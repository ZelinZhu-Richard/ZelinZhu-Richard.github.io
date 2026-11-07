"""04-lantern-canal: film-local fix-up of the kit soundtrack (kit/audio.py is shared and
read-only for this film). Run it from workspace/pov-films after kit/audio.py:

  python3 kit/audio.py --preset 04-lantern-canal --out out/04-lantern-canal.wav
  python3 films/04-lantern-canal/audio_post.py            # -> films/04-lantern-canal/audio.wav
  python3 kit/finish.py --slug 04-lantern-canal --audio films/04-lantern-canal/audio.wav

What it fixes (motion/audio QA, 2026-11-02 round 4):

1. Mono compatibility of the ending tail. The hall reverb IRs are independent noise per
   channel (correlation about 0) and the preset's width 1.35 then boosts the side signal,
   so after the hit the side is louder than the mid: L/R correlation falls to -0.14 ...
   -0.42 and a mono fold loses 3.7 to 5.4 dB of the tail. Here the side signal is limited
   to SIDE_MAX times the mid from 9.9 s on (smoothed envelopes; the cruise
   sits at 0.64 to 0.92 correlation and is not touched). Tail correlation +0.47, mono fold
   loss 1.2 dB (was 3.7 to 5.4 dB).
2. True peak after AAC. The kit limits to -1.5 dBTP, but the AAC encoder overshoots by
   about 0.7 dB on the bar-1 downbeat, which starts in the very first AAC frame (13 ms in;
   -0.8 dBTP delivered), and by about 0.35 dB elsewhere (-1.14 dBTP at 5.64 s). A 25 ms
   raised-cosine fade-in removes the first-frame overshoot (5 and 12 ms did not), and the
   kit's own look-ahead true-peak limiter runs again at TP_CEIL inside a loudness loop
   (up to 0.7 dB of gain reduction on a few transients, +0.02 dB make-up), so the AAC encode
   measures -1.67 dBTP and -14.0 LUFS (LRA 1.5 LU).
"""
import os
import sys
import argparse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'kit'))
import audio as A  # noqa: E402
from scipy.ndimage import uniform_filter1d  # noqa: E402

SLUG = '04-lantern-canal'
SIDE_MAX = 0.6        # side/mid amplitude ratio cap: correlation >= (1 - 0.36) / (1 + 0.36) = 0.47
ENV_S = 0.12          # envelope window (s)
TAIL_FROM = 9.9       # s: the side limit only acts on the hit and its reverb tail
TP_CEIL = -1.8        # dBTP in the WAV: -1.67 dBTP after the finish.py AAC encode
FADE_IN = 0.025       # s, raised cosine on the first downbeat (AAC first-frame overshoot)
TARGET_LUFS = -14.0


def fix(x):
    m = 0.5 * (x[:, 0] + x[:, 1])
    s = 0.5 * (x[:, 0] - x[:, 1])
    w = int(ENV_S * A.SR)
    em = np.sqrt(uniform_filter1d(m * m, w, mode='nearest') + 1e-14)
    es = np.sqrt(uniform_filter1d(s * s, w, mode='nearest') + 1e-14)
    t = np.arange(len(x)) / A.SR
    g = np.minimum(1.0, SIDE_MAX * em / es)
    g[t < TAIL_FROM] = 1.0           # the cruise mix is left exactly as the kit made it
    # smooth the gain twice (no zipper noise)
    g = uniform_filter1d(uniform_filter1d(g, w, mode='nearest'), w, mode='nearest')
    s = s * g
    y = np.stack([m + s, m - s], axis=1)
    f = 0.5 - 0.5 * np.cos(np.pi * np.clip(t / FADE_IN, 0.0, 1.0))
    y = y * f[:, None]
    gain = 1.0
    for _ in range(5):
        z, gr_max, _ = A.limiter(y * gain, TP_CEIL)
        gain *= 10 ** ((TARGET_LUFS - A.lufs(z)) / 20.0)
    y = z
    # the kit keeps the first and last samples at exactly zero
    y[0] = 0.0
    y[-1] = 0.0
    return y, g, gr_max


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', default=os.path.join(ROOT, 'out', SLUG + '.wav'))
    ap.add_argument('--out', default=os.path.join(HERE, 'audio.wav'))
    a = ap.parse_args()
    x = A.read_wav24(a.src)
    y, g, gr = fix(x)
    A.write_wav24(a.out, y, np.random.default_rng(4404))
    print('side gain min %.2f (from %.2f s), limiter GR max %.2f dB' % (
        g.min(), np.argmax(g < 0.99) / A.SR, gr))
    print('in : TP %.2f dBTP, %.2f LUFS' % (A.true_peak_db(x), A.lufs(x)))
    print('out: TP %.2f dBTP, %.2f LUFS -> %s' % (A.true_peak_db(y), A.lufs(y), a.out))


if __name__ == '__main__':
    main()
