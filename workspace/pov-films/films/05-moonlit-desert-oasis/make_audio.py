"""05-moonlit-desert-oasis soundtrack master: the kit preset plus an opening-transient trim.

The kit mix (kit/audio.py --preset 05-moonlit-desert-oasis) opens on a full-level downbeat in the
first 10 ms. The WAV is at -1.5 dBTP, but the AAC encoder overshoots that first transient (no
lead-in for its pre-echo) and the delivered mp4 measured -0.5 dBTP, over the -1 dBTP spec. This
script renders the kit preset (or takes an existing kit WAV), then applies a 4 ms raised-cosine
fade-in and holds the first 25 ms 2 dB down, releasing over the next 30 ms (cosine). Everything
after 55 ms is bit-exact. It then test-encodes AAC exactly as kit/finish.py does (256 kb/s, 48 kHz,
stereo) and prints the WAV and AAC loudness and true peak.

Run from workspace/pov-films (writes the file finish.py picks up by default):
  python3 -I films/05-moonlit-desert-oasis/make_audio.py --out out/05-moonlit-desert-oasis.wav
Options: --kit-wav PATH uses an existing kit render instead of rendering the preset again.
A WAV processed by this script carries a 'pk05' chunk and is refused as input (no double trim).
"""
import argparse
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile

import numpy as np

SLUG = '05-moonlit-desert-oasis'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FADE_MS, HOLD_MS, REL_MS, DIP_DB = 4.0, 25.0, 30.0, 2.0
MARK = b'pk05'


def chunks(data):
    """RIFF chunks as (id, payload offset, size)."""
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise SystemExit('make_audio: not a RIFF/WAVE file')
    out, i = [], 12
    while i + 8 <= len(data):
        cid, size = data[i:i + 4], struct.unpack('<I', data[i + 4:i + 8])[0]
        out.append((cid, i + 8, size))
        i += 8 + size + (size & 1)
    return out


def trim_opening(src, dst):
    with open(src, 'rb') as fh:
        data = fh.read()
    ch = chunks(data)
    ids = [c[0] for c in ch]
    if MARK in ids:
        raise SystemExit('make_audio: %s was already processed (has a %r chunk)' % (src, MARK))
    fmt = [c for c in ch if c[0] == b'fmt '][0]
    tag, nch, sr, _, align, bits = struct.unpack('<HHIIHH', data[fmt[1]:fmt[1] + 16])
    if tag != 1 or bits != 24 or nch != 2:
        raise SystemExit('make_audio: expected 24-bit stereo PCM, got tag %d, %d bit, %d ch' % (tag, bits, nch))
    dat = [c for c in ch if c[0] == b'data'][0]
    n_proc = int(round(sr * (HOLD_MS + REL_MS) / 1000.0)) + 1
    raw = np.frombuffer(data[dat[1]:dat[1] + n_proc * align], np.uint8).reshape(-1, 3)
    v = raw[:, 0].astype(np.int32) | (raw[:, 1].astype(np.int32) << 8) | (raw[:, 2].astype(np.int32) << 16)
    v = np.where(v >= 2 ** 23, v - 2 ** 24, v).reshape(-1, 2).astype(np.float64)
    t = np.arange(len(v)) / float(sr)
    lo = 10 ** (-DIP_DB / 20.0)
    h, r = HOLD_MS / 1000.0, REL_MS / 1000.0
    g = np.where(t < h, lo, lo + (1 - lo) * (0.5 - 0.5 * np.cos(np.pi * np.clip((t - h) / r, 0.0, 1.0))))
    k = int(round(sr * FADE_MS / 1000.0))
    g[:k] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
    q = np.clip(np.round(v * g[:, None]), -2 ** 23, 2 ** 23 - 1).astype('<i4')
    new = q.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    body = bytearray(data)
    body[dat[1]:dat[1] + len(new)] = new
    # marker chunk right after fmt (before data, so readers that scan for 'data' are unaffected)
    ins = fmt[1] + fmt[2] + (fmt[2] & 1)
    mark = MARK + struct.pack('<I', 4) + b'dip1'
    body = body[:ins] + mark + body[ins:]
    body[4:8] = struct.pack('<I', len(body) - 8)
    tmp = dst + '.tmp'
    with open(tmp, 'wb') as fh:
        fh.write(bytes(body))
    os.replace(tmp, dst)


def ebur128(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-map', '0:a',
                        '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind('Summary:'):]
    i = re.search(r'I:\s+(-?[\d.]+) LUFS', s)
    p = re.search(r'True peak:\s+Peak:\s+(-?[\d.]+) dBFS', s)
    return float(i.group(1)) if i else float('nan'), float(p.group(1)) if p else float('nan')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=os.path.join(ROOT, 'out', SLUG + '.wav'))
    ap.add_argument('--kit-wav', default=None, help='existing kit render to process instead of rendering')
    a = ap.parse_args(argv)
    tmpd = tempfile.mkdtemp(prefix='pk05_audio_')
    try:
        src = a.kit_wav
        if src is None:
            src = os.path.join(tmpd, 'kit.wav')
            subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'kit', 'audio.py'), '--preset', SLUG,
                            '--out', src, '--quiet'], check=True, cwd=ROOT)
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        trim_opening(src, os.path.abspath(a.out))
        m4a = os.path.join(tmpd, 'test.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.out, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
                        '-ac', '2', m4a], check=True)
        wi, wp = ebur128(a.out)
        ai, apk = ebur128(m4a)
        print('make_audio: %s  WAV I %.1f LUFS, TP %.1f dBTP | AAC test encode I %.1f LUFS, TP %.1f dBTP (%s)'
              % (a.out, wi, wp, ai, apk, 'ok' if apk <= -1.0 else 'OVER -1 dBTP'))
        return 0 if apk <= -1.0 else 2
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
