"""02-bedroom-railway: delivery soundtrack (round 4).

The kit soundtrack (`kit/audio.py --preset 02-bedroom-railway`, -14 LUFS, -1.5 dBTP) opens with a
full-level downbeat that rises from silence to about 0.67 within 5 ms of t = 0. ffmpeg's native AAC
encoder (256 kb/s, as `kit/finish.py` uses it) overshoots that onset inside the first AAC frame: the
delivery mp4 decoded to 1.10 at 11 to 13 ms (+0.8 dBFS sample peak, +0.9 dBTP, 23 samples over full
scale) while the WAV holds 0.69 there. 5 and 10 ms fade-ins do not help (the overshoot sits after
them); a 20 ms raised-cosine attack on the first hit does (decoded peak -1.4 dBFS, true peak
-1.3 dBTP, the rest of the film unchanged, loudness still -14.0 LUFS).

This script regenerates the kit soundtrack (or takes --in), applies that attack ramp, writes
films/02-bedroom-railway/audio.wav and checks it through the same AAC encode finish.py runs.

Run from workspace/pov-films:
  python3 films/02-bedroom-railway/master_audio.py
  python3 kit/finish.py --slug 02-bedroom-railway --audio films/02-bedroom-railway/audio.wav

(finish.py looks for out/<slug>.wav before films/<slug>/audio.wav, so pass --audio explicitly.)
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SLUG = '02-bedroom-railway'
ATTACK_MS = 20.0       # raised-cosine fade-in on the opening downbeat
TP_LIMIT = -1.0        # delivery ceiling (dBTP) for the AAC as finish.py encodes it


def load(path):
    sr, a = wavfile.read(path)
    if a.dtype == np.int32:
        x = a.astype(np.float64) / 2 ** 31
    elif a.dtype == np.int16:
        x = a.astype(np.float64) / 2 ** 15
    else:
        x = a.astype(np.float64)
    if x.ndim == 1:
        x = x[:, None]
    return sr, x


def aac_check(wav, dur=14.0, fade=0.4):
    """Encode like kit/finish.py (resample, pad/trim to 14 s, 0.4 s fade, AAC 256k 48 kHz stereo),
    decode, and return (true peak dBTP, sample peak dBFS, samples over 0 dBFS, LUFS)."""
    tmp = tempfile.mkdtemp(prefix='br-aac-')
    try:
        m4a = os.path.join(tmp, 'check.m4a')
        af = ('aresample=48000,apad=whole_dur=%.6f,atrim=end=%.6f,afade=t=out:st=%.6f:d=%.6f'
              % (dur, dur, dur - fade, fade))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', af, '-c:a', 'aac', '-b:a', '256k',
                        '-ar', '48000', '-ac', '2', m4a], check=True)
        r = subprocess.run(['ffmpeg', '-nostats', '-i', m4a, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                           capture_output=True, text=True)
        summ = r.stderr[r.stderr.rfind('Summary'):]
        tp = float(re.search(r'Peak:\s+(-?[\d.]+|-inf)', summ).group(1))
        lufs = float(re.search(r'I:\s+(-?[\d.]+)', summ).group(1))
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', m4a, '-f', 'f32le', '-ac', '2', '-'],
                             capture_output=True, check=True).stdout
        a = np.frombuffer(raw, np.float32).reshape(-1, 2)
        peak = float(np.abs(a).max())
        return tp, 20 * np.log10(max(peak, 1e-12)), int((np.abs(a) > 1.0).sum()), lufs
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', help='kit soundtrack WAV (default: regenerate with kit/audio.py)')
    ap.add_argument('--out', default=os.path.join(HERE, 'audio.wav'))
    ap.add_argument('--attack-ms', type=float, default=ATTACK_MS)
    args = ap.parse_args()

    tmp = None
    src = args.src
    if not src:
        tmp = tempfile.mkdtemp(prefix='br-audio-')
        src = os.path.join(tmp, SLUG + '.wav')
        subprocess.run([sys.executable, os.path.join(ROOT, 'kit', 'audio.py'), '--preset', SLUG, '--out', src],
                       check=True, cwd=ROOT)
    try:
        sr, x = load(src)
        n = int(round(sr * args.attack_ms / 1000.0))
        ramp = 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / n)
        y = x.copy()
        y[:n] *= ramp[:, None]
        out = np.round(np.clip(y, -1.0, 1.0 - 2.0 ** -31) * 2 ** 31).astype(np.int32)
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        wavfile.write(args.out, sr, out)
        before = aac_check(src)
        after = aac_check(args.out)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
    fmt = 'true peak %+.1f dBTP, sample peak %+.2f dBFS, %d samples over 0 dBFS, %.1f LUFS'
    print('kit soundtrack through AAC: ' + fmt % before)
    print('with %.0f ms attack:        ' % args.attack_ms + fmt % after)
    print('wrote %s (%d Hz, %.3f s)' % (args.out, sr, len(y) / sr))
    print('finish with: python3 kit/finish.py --slug %s --audio %s' % (SLUG, os.path.relpath(args.out, ROOT)))
    if after[0] > TP_LIMIT or after[2] > 0:
        print('FAIL: AAC true peak above %.1f dBTP' % TP_LIMIT)
        sys.exit(1)


if __name__ == '__main__':
    main()
