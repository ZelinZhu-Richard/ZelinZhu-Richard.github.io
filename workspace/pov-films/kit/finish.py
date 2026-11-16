#!/usr/bin/env python3
"""Finishing step for the POV films.

Takes a rendered PNG sequence (0001.png ... 0336.png, 1080x1920, 24 fps, frame 1 = t 0)
and a 14 s WAV, and writes the delivery file:

  * outro: from 10.0 s the picture eases down to about 12 percent brightness (linear light)
    over 1.2 s with a slight desaturation and a gentle blur, then holds dim while the
    scene keeps moving underneath
  * end card: the site name in Avenir Next, white at 92 percent opacity with a very soft
    shadow, fading in over 10.6 to 11.3 s with a 10 px upward drift
  * the last 0.4 s fades the whole picture to black
  * H.264 (libx264 CRF 16, preset slow, yuv420p, BT.709 tags, +faststart) with AAC 48 kHz
    256 kb/s audio
  * <out>_contact.png (2 fps contact sheet, 7 columns) and <out>_poster.jpg (frame at 4 s)

Only the frames that change are decoded and processed in Python. The untouched head of the
sequence is read by ffmpeg directly; the processed tail is streamed to ffmpeg over a pipe
as raw RGB, so nothing extra is written to disk.

Usage:
  python3 kit/finish.py --slug <slug> [--frames DIR] [--audio WAV] [--out MP4] [--card TEXT]
  python3 kit/finish.py --slug <slug> --stills 10.5,11.5,13.8   # preview frames only, no encode
  python3 kit/finish.py --selftest                              # synthetic end-to-end test

See kit/FINISH.md for details.
"""

import argparse
import collections
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # workspace/pov-films
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

DEFAULT_CARD = "zelinzhu-richard.github.io"

# Every number of the look lives here. Times are seconds, sizes are fractions of the frame
# height unless noted (so a half-scale test render gets the same proportions).
LOOK = dict(
    fps=24,
    # outro dim
    dim_start=10.0,      # s, the picture starts to ease down
    dim_dur=1.2,         # s, until it reaches dim_level
    dim_level=0.12,      # linear-light gain at full dim (about 12 percent brightness)
    desat=0.18,          # saturation drops by this fraction at full dim
    blur=1.8 / 1920,     # gaussian sigma at full dim (1.8 px at 1920 high)
    # end card
    card_in=10.6,        # s, card starts to fade in
    card_full=11.3,      # s, card fully in
    card_drift=10 / 1920,  # upward drift during the fade (10 px at 1920 high)
    card_opacity=0.92,   # white at 92 percent
    cap_height=0.022,    # cap height of the typeface (2.2 percent of the frame height)
    card_y=0.715,        # vertical centre of the cap band (fraction of height, lower third)
    tracking=0.02,       # extra letter spacing in em
    shadow_sigma=0.13,   # shadow blur, in cap heights
    shadow_offset=0.05,  # shadow drop, in cap heights
    shadow_opacity=0.5,
    # end
    black_dur=0.4,       # s, final fade of the whole picture to black (last frame is black)
    audio_fade=0.4,      # s, matching audio fade at the very end (0 = off)
    dither=1.0,          # TPDF dither amplitude in 8-bit code values for processed frames
    supersample=4,       # card text is drawn at this multiple and box-filtered down
)

FONT_CANDIDATES = [
    ("/System/Library/Fonts/Avenir Next.ttc", "Medium"),
    ("/System/Library/Fonts/Avenir Next.ttc", "Demi Bold"),
    ("/System/Library/Fonts/HelveticaNeue.ttc", "Medium"),
    ("/System/Library/Fonts/HelveticaNeue.ttc", "Regular"),
    ("/System/Library/Fonts/Helvetica.ttc", "Regular"),
]
WEIGHTS = {"medium": "Medium", "demi": "Demi Bold", "regular": "Regular"}


def log(msg):
    print(f"[finish] {msg}", flush=True)


# ----------------------------------------------------------------------------- timeline

def _clamp01(x):
    return 0.0 if x <= 0 else 1.0 if x >= 1 else x


def smoother(x):
    x = _clamp01(x)
    return x * x * x * (x * (6 * x - 15) + 10)


def ease_out_cubic(x):
    x = _clamp01(x)
    return 1 - (1 - x) ** 3


def state_at(t, n_frames, height, look):
    """All outro parameters for time t (seconds, frame n is at (n-1)/fps)."""
    p = smoother((t - look["dim_start"]) / look["dim_dur"])
    # Ramp in exposure stops so the fade feels even to the eye.
    gain = look["dim_level"] ** p
    pc = _clamp01((t - look["card_in"]) / max(1e-6, look["card_full"] - look["card_in"]))
    end_t = n_frames / look["fps"]
    last_t = (n_frames - 1) / look["fps"]
    b0 = end_t - look["black_dur"]
    pb = _clamp01((t - b0) / max(1e-6, last_t - b0)) if look["black_dur"] > 0 else 0.0
    return dict(
        dim=p,
        gain=gain,
        sat=1 - look["desat"] * p,
        sigma=look["blur"] * height * p,
        card_alpha=smoother(pc),
        card_dy=look["card_drift"] * height * (1 - ease_out_cubic(pc)),
        black=0.5 * (1 + math.cos(math.pi * pb)),
    )


def needs_processing(st):
    return st["dim"] > 1e-6 or st["card_alpha"] > 1e-6 or st["black"] < 1 - 1e-6


# ----------------------------------------------------------------------------- end card

def find_font(weight="medium"):
    want = WEIGHTS.get(weight, "Medium")
    cands = [(p, want) for p, _ in FONT_CANDIDATES[:1]] + FONT_CANDIDATES
    for path, style in cands:
        if not os.path.exists(path):
            continue
        for idx in range(32):
            try:
                f = ImageFont.truetype(path, 100, index=idx)
            except OSError:
                break
            if f.getname()[1] == style:
                return path, idx, f.getname()
    raise SystemExit("finish: no suitable font found (Avenir Next / Helvetica Neue)")


def render_card(text, width, height, look, weight="medium"):
    """Returns the supersampled text coverage mask and its placement.

    The mask is drawn at `ss` times the frame resolution, glyph by glyph so a faint letter
    spacing can be added on top of the font's own advances and kerning.
    """
    ss = look["supersample"]
    path, idx, name = find_font(weight)
    probe = ImageFont.truetype(path, 200, index=idx)
    cap200 = -probe.getbbox("H", anchor="ls")[1]
    cap_px = look["cap_height"] * height
    size_px = cap_px * 200.0 / cap200
    font = ImageFont.truetype(path, max(8, round(size_px * ss)), index=idx)
    cap_ss = -font.getbbox("H", anchor="ls")[1]
    track = look["tracking"] * size_px * ss
    xs = [font.getlength(text[:i]) + i * track for i in range(len(text))]
    asc, desc = font.getmetrics()
    pad = int(math.ceil(cap_px * 0.6 + look["card_drift"] * height + 4)) * ss
    adv = font.getlength(text) + max(0, len(text) - 1) * track
    w_ss = int(math.ceil(adv)) + 2 * pad
    h_ss = asc + desc + 2 * pad
    w_ss += (-w_ss) % ss
    h_ss += (-h_ss) % ss
    canvas = Image.new("L", (w_ss, h_ss), 0)
    draw = ImageDraw.Draw(canvas)
    base_ss = pad + asc
    for ch, x in zip(text, xs):
        draw.text((pad + x, base_ss), ch, font=font, fill=255, anchor="ls")
    m = np.asarray(canvas, dtype=np.float32) / 255.0
    # Centre the ink, not the advance box, on the frame centre.
    cols = np.nonzero(m.max(axis=0) > 0.0)[0]
    ink_cx = (cols[0] + cols[-1] + 1) / 2.0 / ss if len(cols) else w_ss / 2.0 / ss
    w1, h1 = w_ss // ss, h_ss // ss
    x0 = int(round(width / 2.0 - ink_cx))
    # Vertical: centre of the cap band at card_y.
    base_y = look["card_y"] * height + cap_ss / ss / 2.0
    y0 = int(round(base_y - base_ss / ss))
    info = dict(font=f"{name[0]} {name[1]}", size_px=round(size_px, 2),
                cap_px=round(cap_ss / ss, 2), ink_width_px=round((cols[-1] - cols[0] + 1) / ss, 1) if len(cols) else 0)
    return dict(mask_ss=m, ss=ss, x0=x0, y0=y0, w=w1, h=h1, info=info)


def card_patch(card, dy, look, height):
    """Coverage and shadow masks (h, w) at frame resolution for a downward offset dy px."""
    from scipy.ndimage import gaussian_filter
    ss = card["ss"]
    k = int(round(dy * ss))
    m = card["mask_ss"]
    if k:
        m = np.roll(m, k, axis=0)  # padding is larger than the drift, so nothing wraps
    h, w = card["h"], card["w"]
    cov = m.reshape(h, ss, w, ss).mean(axis=(1, 3))
    cap = look["cap_height"] * height
    sh = gaussian_filter(cov, look["shadow_sigma"] * cap, mode="constant")
    off = look["shadow_offset"] * cap
    sh = np.roll(sh, int(round(off)), axis=0)
    return cov, sh


# ----------------------------------------------------------------------------- grading

_SRGB_LUT = None


def srgb_lut():
    global _SRGB_LUT
    if _SRGB_LUT is None:
        x = np.arange(256, dtype=np.float64) / 255.0
        _SRGB_LUT = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)
    return _SRGB_LUT


def to_srgb(lin):
    lin = np.clip(lin, 0.0, 1.0)
    return np.where(lin <= 0.0031308, lin * 12.92,
                    1.055 * np.power(lin, 1 / 2.4, dtype=np.float32) - 0.055).astype(np.float32)


def grade(rgb8, st, card, look, seed=0):
    """Apply the outro to one uint8 RGB frame; returns uint8 RGB."""
    from scipy.ndimage import gaussian_filter
    h = rgb8.shape[0]
    lin = srgb_lut()[rgb8]
    if st["sigma"] > 0.05:
        lin = gaussian_filter(lin, sigma=(st["sigma"], st["sigma"], 0), mode="nearest")
    if st["sat"] < 0.9999:
        y = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        lin = y[..., None] + (lin - y[..., None]) * np.float32(st["sat"])
    if st["gain"] < 0.9999:
        lin *= np.float32(st["gain"])
    out = to_srgb(lin)
    if card is not None and st["card_alpha"] > 1e-4:
        cov, sh = card_patch(card, st["card_dy"], look, h)
        H, W = out.shape[:2]
        x0, y0 = card["x0"], card["y0"]
        ph, pw = cov.shape
        # clip the patch to the frame
        fx0, fy0 = max(0, x0), max(0, y0)
        fx1, fy1 = min(W, x0 + pw), min(H, y0 + ph)
        if fx1 > fx0 and fy1 > fy0:
            c = cov[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]
            s = sh[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]
            reg = out[fy0:fy1, fx0:fx1]
            a = st["card_alpha"]
            reg *= (1.0 - look["shadow_opacity"] * a * s)[..., None]
            ta = (look["card_opacity"] * a * c)[..., None]
            reg += (1.0 - reg) * ta
    if st["black"] < 0.9999:
        out *= np.float32(st["black"])
    out *= 255.0
    if look["dither"] > 0:
        rng = np.random.default_rng(seed)
        n = rng.random(out.shape, dtype=np.float32) - rng.random(out.shape, dtype=np.float32)
        out += n * np.float32(look["dither"])
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


# Worker-process globals (set by _init_worker).
_W = {}


def _init_worker(card, look, n_frames, height):
    _W.update(card=card, look=look, n=n_frames, h=height)


def _work(job):
    idx, path = job  # idx is 1-based
    t = (idx - 1) / _W["look"]["fps"]
    st = state_at(t, _W["n"], _W["h"], _W["look"])
    with Image.open(path) as im:
        rgb = np.asarray(im.convert("RGB"))
    return idx, grade(rgb, st, _W["card"], _W["look"], seed=idx).tobytes()


# ----------------------------------------------------------------------------- inputs

def list_frames(frames_dir):
    if not os.path.isdir(frames_dir):
        raise SystemExit(f"finish: frames dir not found: {frames_dir}")
    paths = []
    n = 1
    while True:
        p = os.path.join(frames_dir, f"{n:04d}.png")
        if not os.path.exists(p):
            break
        paths.append(p)
        n += 1
    if not paths:
        raise SystemExit(f"finish: no 0001.png ... frames in {frames_dir}")
    extra = sorted(f for f in os.listdir(frames_dir)
                   if f.endswith(".png") and f[:-4].isdigit() and int(f[:-4]) > len(paths))
    if extra:
        raise SystemExit(f"finish: frame sequence has a gap after {len(paths):04d}.png "
                         f"(found {extra[0]})")
    return paths


def find_audio(slug):
    cands = [
        os.path.join(ROOT, "out", f"{slug}.wav"),
        os.path.join(ROOT, "out", "audio", f"{slug}.wav"),
        os.path.join(ROOT, "renders", slug, "audio.wav"),
        os.path.join(ROOT, "renders", slug, f"{slug}.wav"),
        os.path.join(ROOT, "films", slug, "audio.wav"),
        os.path.join(ROOT, "films", slug, f"{slug}.wav"),
        os.path.join(ROOT, "films", slug, "soundtrack.wav"),
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    return None


def probe(path):
    r = subprocess.run([FFPROBE, "-v", "error", "-count_packets", "-show_entries",
                        "format=duration,format_name:stream=index,codec_type,codec_name,width,"
                        "height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_packets,pix_fmt,"
                        "color_space,color_transfer,color_primaries,color_range,sample_rate,"
                        "channels,bit_rate,duration,profile",
                        "-of", "json", path], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"finish: ffprobe failed on {path}: {r.stderr.strip()}")
    return json.loads(r.stdout)


# ----------------------------------------------------------------------------- encode

def encode(frames, audio, out, card, look, workers, silent=False):
    n = len(frames)
    with Image.open(frames[0]) as im:
        W, H = im.size
    fps = look["fps"]
    dur = n / fps
    states = [state_at(i / fps, n, H, look) for i in range(n)]
    k = 0
    while k < n and not needs_processing(states[k]):
        k += 1
    # Everything after the first processed frame is processed (the outro never reverts).
    log(f"{n} frames {W}x{H} @ {fps} fps = {dur:.3f} s; frames 1-{k} pass straight through, "
        f"{k + 1}-{n} are processed ({n - k})")

    tmp = tempfile.mkdtemp(prefix="finish_")
    try:
        cmd = [FFMPEG, "-y", "-hide_banner", "-nostats", "-loglevel", "warning"]
        vin = []
        if k > 0:
            # Symlink farm for the untouched head so ffmpeg reads exactly k originals.
            for i in range(k):
                os.symlink(os.path.abspath(frames[i]), os.path.join(tmp, f"{i + 1:04d}.png"))
            cmd += ["-framerate", str(fps), "-start_number", "1", "-i", os.path.join(tmp, "%04d.png")]
            vin.append("head")
        if k < n:
            cmd += ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                    "-framerate", str(fps), "-i", "pipe:0"]
            vin.append("tail")
        if silent:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        else:
            cmd += ["-i", audio]
        ai = len(vin)
        parts = []
        labels = []
        for j, _ in enumerate(vin):
            parts.append(f"[{j}:v]setpts=PTS-STARTPTS,format=rgb24,setsar=1[v{j}]")
            labels.append(f"[v{j}]")
        if len(vin) == 2:
            parts.append(f"{''.join(labels)}concat=n=2:v=1:a=0[vc]")
            vsrc = "[vc]"
        else:
            vsrc = labels[0]
        parts.append(f"{vsrc}scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,"
                     f"format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:"
                     f"range=tv[vout]")
        af = f"[{ai}:a]aresample=48000,apad=whole_dur={dur:.6f},atrim=end={dur:.6f}"
        if look["audio_fade"] > 0 and not silent:
            af += f",afade=t=out:st={dur - look['audio_fade']:.6f}:d={look['audio_fade']:.6f}"
        parts.append(af + ",asetpts=PTS-STARTPTS[aout]")
        cmd += ["-filter_complex", ";".join(parts),
                "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
                "-profile:v", "high", "-r", str(fps), "-frames:v", str(n),
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                "-color_range", "tv",
                "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
                "-movflags", "+faststart", out]
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        t0 = time.time()
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE if k < n else subprocess.DEVNULL)
        try:
            if k < n:
                _stream_tail(proc, frames, k, card, look, H, workers)
                proc.stdin.close()
        except BrokenPipeError:
            pass
        rc = proc.wait()
        if rc != 0:
            raise SystemExit(f"finish: ffmpeg failed (exit {rc})")
        log(f"encoded {out} in {time.time() - t0:.1f} s")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _stream_tail(proc, frames, k, card, look, H, workers):
    import multiprocessing as mp
    n = len(frames)
    jobs = [(i + 1, frames[i]) for i in range(k, n)]
    ctx = mp.get_context("spawn")
    with ctx.Pool(workers, initializer=_init_worker, initargs=(card, look, n, H)) as pool:
        # Sliding window keeps at most ~2 frames per worker in memory.
        window = collections.deque()
        it = iter(jobs)
        for job in it:
            window.append(pool.apply_async(_work, (job,)))
            if len(window) >= 2 * workers:
                break
        while window:
            idx, data = window.popleft().get()
            proc.stdin.write(data)
            nxt = next(it, None)
            if nxt is not None:
                window.append(pool.apply_async(_work, (nxt,)))


def contact_sheet(mp4, path, n, fps, cols=7, tile_w=243, tile_h=432):
    step = max(1, int(round(fps / 2)))  # 2 fps
    count = (n + step - 1) // step
    rows = (count + cols - 1) // cols
    vf = (f"select=not(mod(n\\,{step})),scale={tile_w}:{tile_h}:flags=lanczos:"
          f"in_color_matrix=bt709:in_range=tv,format=rgb24,tile={cols}x{rows}")
    r = subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", mp4,
                        "-vf", vf, "-fps_mode", "passthrough", "-frames:v", "1", path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"finish: contact sheet failed: {r.stderr.strip()}")


def poster(frames, path, t, card, look):
    n = len(frames)
    fps = look["fps"]
    idx = min(n, max(1, int(round(t * fps)) + 1))
    with Image.open(frames[idx - 1]) as im:
        rgb = np.asarray(im.convert("RGB"))
    st = state_at((idx - 1) / fps, n, rgb.shape[0], look)
    if needs_processing(st):
        rgb = grade(rgb, st, card, look, seed=idx)
    Image.fromarray(rgb).save(path, quality=92, optimize=True, progressive=True, subsampling=0)


def faststart_ok(path):
    """True when the moov atom precedes mdat (progressive playback)."""
    order = []
    with open(path, "rb") as f:
        size_total = os.path.getsize(path)
        pos = 0
        while pos < size_total and len(order) < 32:
            f.seek(pos)
            hdr = f.read(16)
            if len(hdr) < 8:
                break
            size, typ = struct.unpack(">I4s", hdr[:8])
            if size == 1:
                size = struct.unpack(">Q", hdr[8:16])[0]
            elif size == 0:
                size = size_total - pos
            order.append(typ.decode("latin-1"))
            pos += size
    return "moov" in order and "mdat" in order and order.index("moov") < order.index("mdat")


def verify(out, n, fps):
    info = probe(out)
    v = [s for s in info["streams"] if s["codec_type"] == "video"]
    a = [s for s in info["streams"] if s["codec_type"] == "audio"]
    dur = n / fps
    problems = []
    if not v:
        problems.append("no video stream")
    else:
        v = v[0]
        frames = int(v.get("nb_read_packets") or v.get("nb_frames") or 0)
        checks = [
            (v.get("codec_name") == "h264", f"codec {v.get('codec_name')}"),
            (v.get("pix_fmt") == "yuv420p", f"pix_fmt {v.get('pix_fmt')}"),
            (v.get("r_frame_rate") == f"{fps}/1", f"frame rate {v.get('r_frame_rate')}"),
            (frames == n, f"{frames} frames (want {n})"),
            (abs(float(v.get("duration", 0)) - dur) < 0.5 / fps, f"video duration {v.get('duration')}"),
            (v.get("color_space") == "bt709" and v.get("color_transfer") == "bt709"
             and v.get("color_primaries") == "bt709", "colour tags not BT.709"),
        ]
        problems += [msg for ok, msg in checks if not ok]
    if not a:
        problems.append("no audio stream")
    else:
        a = a[0]
        if a.get("codec_name") != "aac" or a.get("sample_rate") != "48000":
            problems.append(f"audio {a.get('codec_name')} {a.get('sample_rate')} Hz")
        if abs(float(a.get("duration", 0)) - dur) > 0.03:
            problems.append(f"audio duration {a.get('duration')}")
    fdur = float(info["format"]["duration"])
    if abs(fdur - dur) > 0.03:
        problems.append(f"container duration {fdur}")
    if not faststart_ok(out):
        problems.append("moov atom is not at the front (+faststart)")
    summary = dict(
        duration=round(fdur, 3),
        video=(f"{v.get('codec_name')} {v.get('profile')} {v.get('width')}x{v.get('height')} "
               f"{v.get('pix_fmt')} {v.get('r_frame_rate')} fps, "
               f"{v.get('nb_read_packets')} frames, {int(v.get('bit_rate', 0)) // 1000} kb/s, "
               f"{v.get('color_space')}/{v.get('color_transfer')}/{v.get('color_primaries')}/"
               f"{v.get('color_range')}") if isinstance(v, dict) else None,
        audio=(f"{a.get('codec_name')} {a.get('sample_rate')} Hz {a.get('channels')} ch "
               f"{int(a.get('bit_rate', 0)) // 1000} kb/s, {a.get('duration')} s") if isinstance(a, dict) else None,
        size_mb=round(os.path.getsize(out) / 1e6, 2),
    )
    return problems, summary


# ----------------------------------------------------------------------------- stills

def write_stills(frames, times, out_prefix, card, look):
    n = len(frames)
    fps = look["fps"]
    outs = []
    for t in times:
        idx = min(n, max(1, int(round(t * fps)) + 1))
        with Image.open(frames[idx - 1]) as im:
            rgb = np.asarray(im.convert("RGB"))
        st = state_at((idx - 1) / fps, n, rgb.shape[0], look)
        res = grade(rgb, st, card, look, seed=idx) if needs_processing(st) else rgb
        p = f"{out_prefix}_t{(idx - 1) / fps:05.2f}.png"
        Image.fromarray(res).save(p, compress_level=3)
        outs.append(p)
        log(f"still t={(idx - 1) / fps:.3f} s (frame {idx}) -> {p}")
    return outs


# ----------------------------------------------------------------------------- self test

def _synth_frame(args):
    idx, n, W, H, path = args
    t = (idx - 1) / 24.0
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H
    # moving night gradient: deep blue at the top to violet at the horizon, drifting hue
    ph = 0.15 * math.sin(t * 0.6)
    sky = np.stack([0.004 + 0.07 * v ** 2 + 0.02 * ph * v,
                    0.004 + 0.015 * v,
                    0.02 + 0.09 * v + 0.01 * math.cos(t * 0.4) * (1 - v)], -1)
    sky += 0.006 * np.sin((xx / W * 3 + yy / H * 2 + t * 0.5) * math.pi)[..., None] * np.array(
        [0.6, 0.2, 1.0], np.float32)
    img = sky.astype(np.float32)
    # stars (fixed)
    sx = rng.integers(0, W, 900)
    sy = rng.integers(0, int(H * 0.45), 900)
    sb = rng.random(900).astype(np.float32) ** 3
    img[sy, sx] += sb[:, None] * 0.9
    # road: darker, glossy lower half
    horizon = 0.52 * H
    road = yy > horizon
    img[road] *= 0.35
    # lights streaming outward from a vanishing point, with vertical reflections
    vx, vy = W * 0.5, horizon
    cols = np.array([[1.0, 0.62, 0.22], [0.2, 0.9, 1.0], [1.0, 0.25, 0.8],
                     [0.5, 1.0, 0.45], [1.0, 0.85, 0.5]], np.float32)
    lrng = np.random.default_rng(11)
    for j in range(26):
        side = -1 if j % 2 else 1
        ang = lrng.uniform(0.15, 1.1) * side
        ph0 = lrng.random()
        z = (ph0 + t / 6.0) % 1.0  # 0 far, 1 near
        d = 40 + (z ** 2.2) * 900
        x = vx + math.sin(ang) * d
        y = vy - math.cos(abs(ang)) * d * 0.55 * lrng.uniform(0.2, 1.0)
        r = 2.5 + 16 * z ** 2
        c = cols[j % len(cols)] * (2.0 + 4 * z)
        x0, x1 = int(max(0, x - 9 * r)), int(min(W, x + 9 * r + 1))
        y0, y1 = int(max(0, y - 9 * r)), int(min(H, y + 9 * r + 1))
        if x1 > x0 and y1 > y0:
            dx = xx[y0:y1, x0:x1] - x
            dy = yy[y0:y1, x0:x1] - y
            d2 = dx * dx + dy * dy
            g = np.exp(-d2 / (2 * r * r)) + 0.08 * np.exp(-d2 / (2 * (2 * r) ** 2))
            img[y0:y1, x0:x1] += g[..., None] * c
        # reflection streak on the road
        ry0 = int(max(horizon, 2 * horizon - y))
        ry1 = int(min(H, ry0 + 300 + 500 * z))
        if ry1 > ry0 and x1 > x0:
            dx = xx[ry0:ry1, x0:x1] - x
            fall = np.exp(-((yy[ry0:ry1, x0:x1] - ry0) / (120 + 400 * z)))
            g = np.exp(-(dx * dx) / (2 * (r * 0.5 + 1.5) ** 2)) * fall
            img[ry0:ry1, x0:x1] += g[..., None] * c * 0.25
    # dashboard: dark band at the bottom with a faint highlight edge
    dash = 0.85 * H + 25 * np.sin(xx / W * math.pi) * -1
    band = yy > dash
    img[band] = img[band] * 0.03 + 0.008
    edge = np.exp(-((yy - dash) ** 2) / 8.0) * 0.12
    img += edge[..., None] * np.array([0.5, 0.45, 0.9], np.float32)
    # tone map to display
    img = 1 - np.exp(-img * 1.2)
    out = np.where(img <= 0.0031308, img * 12.92, 1.055 * np.power(np.clip(img, 0, 1), 1 / 2.4) - 0.055)
    out = np.clip(out * 255 + rng.random(out.shape) - 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(path, compress_level=1)
    return idx


def _synth_wav(path, dur=14.0, sr=48000):
    t = np.arange(int(dur * sr)) / sr
    sig = np.zeros_like(t)
    beat = 10.0 / 16  # 4 bars of 4 beats over the 10 s cruise
    chords = [(220.0, 277.18, 329.63), (196.0, 246.94, 293.66), (174.61, 220.0, 261.63), (196.0, 246.94, 329.63)]
    for b in range(16):
        t0 = b * beat
        m = (t >= t0) & (t < t0 + beat * 1.5)
        env = np.exp(-(t[m] - t0) * 3.0) * np.minimum(1, (t[m] - t0) * 200)
        for f in chords[b // 4]:
            sig[m] += 0.08 * env * np.sin(2 * np.pi * f * t[m])
    m = t >= 10.0
    env = np.exp(-(t[m] - 10.0) * 1.1) * np.minimum(1, (t[m] - 10.0) * 400)
    for f in (110.0, 164.81, 220.0, 329.63):
        sig[m] += 0.12 * env * np.sin(2 * np.pi * f * t[m])
    sig = np.clip(sig, -1, 1)
    st = np.stack([sig, sig * 0.97], -1)
    data = (st * 32767).astype("<i2").tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data)


def selftest(args):
    import multiprocessing as mp
    base = os.path.join(ROOT, "out", "_finish-test")
    fdir = os.path.join(base, "frames")
    os.makedirs(fdir, exist_ok=True)
    n, W, H = 336, 1080, 1920
    t0 = time.time()
    with mp.get_context("spawn").Pool(args.workers) as pool:
        list(pool.imap_unordered(_synth_frame, [(i, n, W, H, os.path.join(fdir, f"{i:04d}.png"))
                                                for i in range(1, n + 1)]))
    wav = os.path.join(base, "tone.wav")
    _synth_wav(wav)
    log(f"synthetic frames + tone in {time.time() - t0:.1f} s")
    out = os.path.join(base, "finish-test.mp4")
    rc = run(argparse.Namespace(slug="finish-test", frames=fdir, audio=wav, out=out,
                                card=args.card, weight=args.weight, workers=args.workers,
                                stills=None, silent=False, keep_frames=False))
    if not args.keep_frames:
        shutil.rmtree(fdir, ignore_errors=True)
        os.remove(wav)
        log("removed synthetic frames and tone")
    return rc


# ----------------------------------------------------------------------------- main

def run(args):
    look = dict(LOOK)
    frames_dir = args.frames or os.path.join(ROOT, "renders", args.slug)
    frames = list_frames(frames_dir)
    n = len(frames)
    if n != 336:
        log(f"warning: {n} frames (the films are 336); timings still follow the spec")
    with Image.open(frames[0]) as im:
        W, H = im.size
    if (W, H) != (1080, 1920):
        log(f"warning: frames are {W}x{H}, not 1080x1920; the look scales with the height")
    card = render_card(args.card, W, H, look, args.weight) if args.card else None
    if card:
        log("card: " + ", ".join(f"{k}={v}" for k, v in card["info"].items()))
    out = args.out or os.path.join(ROOT, "out", f"{args.slug}.mp4")
    stem = os.path.splitext(out)[0]

    if args.stills:
        times = [float(x) for x in args.stills.split(",") if x.strip()]
        os.makedirs(os.path.dirname(os.path.abspath(stem)), exist_ok=True)
        write_stills(frames, times, stem, card, look)
        return 0

    audio = None
    if not args.silent:
        audio = args.audio or find_audio(args.slug)
        if not audio or not os.path.exists(audio):
            raise SystemExit("finish: no soundtrack WAV found; pass --audio <wav> "
                             "(or --silent for a silent track)")
        ai = probe(audio)
        adur = float(ai["format"].get("duration", 0))
        log(f"audio: {audio} ({adur:.3f} s)")
        if abs(adur - n / look["fps"]) > 0.25:
            log(f"warning: audio is {adur:.3f} s; it is padded/trimmed to {n / look['fps']:.3f} s")

    t0 = time.time()
    encode(frames, audio, out, card, look, args.workers, silent=args.silent)
    contact_sheet(out, stem + "_contact.png", n, look["fps"])
    poster(frames, stem + "_poster.jpg", 4.0, card, look)
    log(f"wrote {stem}_contact.png and {stem}_poster.jpg")
    problems, summary = verify(out, n, look["fps"])
    for k_, v_ in summary.items():
        log(f"  {k_}: {v_}")
    log(f"total {time.time() - t0:.1f} s")
    if problems:
        log("VERIFY FAILED: " + "; ".join(problems))
        return 2
    log("verify ok")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Outro, end card and encode for a POV film.")
    ap.add_argument("--slug", help="film slug, e.g. 01-mushroom-hollow")
    ap.add_argument("--frames", help="PNG sequence dir (default renders/<slug>)")
    ap.add_argument("--audio", help="soundtrack WAV (default: looked up next to the film)")
    ap.add_argument("--out", help="output mp4 (default out/<slug>.mp4)")
    ap.add_argument("--card", default=DEFAULT_CARD, help="end card text ('' for none)")
    ap.add_argument("--weight", default="medium", choices=sorted(WEIGHTS),
                    help="Avenir Next weight for the card (default medium)")
    ap.add_argument("--workers", type=int, default=max(1, min(6, (os.cpu_count() or 4) - 2)),
                    help="processes for the outro frames")
    ap.add_argument("--stills", help="comma separated times: write finished PNG stills only, no encode")
    ap.add_argument("--silent", action="store_true", help="encode with a silent AAC track")
    ap.add_argument("--selftest", action="store_true", help="synthetic end-to-end test into out/_finish-test")
    ap.add_argument("--keep-frames", action="store_true", help="selftest: keep the synthetic frames")
    args = ap.parse_args()
    if args.selftest:
        sys.exit(selftest(args))
    if not args.slug:
        ap.error("--slug is required")
    sys.exit(run(args))


if __name__ == "__main__":
    main()
