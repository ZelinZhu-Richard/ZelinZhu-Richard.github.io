#!/usr/bin/env python3
"""
kit/audio.py: original procedural soundtracks for the POV films.

Every sound is synthesized here from numpy and scipy (no samples, no downloaded audio,
no borrowed melodies). One preset per film.

    python3 kit/audio.py --preset 01-mushroom-hollow --out out/01-mushroom-hollow.wav
    python3 kit/audio.py --preset 02-bedroom-railway --out x.wav --seed 7
    python3 kit/audio.py --preset 03-first-snow-village --out x.wav --png x.png   # + spectrogram and checks
    python3 kit/audio.py --all out/_audio-test --png                            # all five presets
    python3 kit/audio.py --list

Output: 48 kHz, stereo, 24-bit PCM WAV, exactly 14.0 s (672000 frames).
Form: 4 bars at 96 BPM (0 to 10.0 s), an ending hit at 10.0 s, reverb tail to silence by 14.0 s.
Master: integrated loudness -14 LUFS, true peak at or below -1.5 dBTP (BS.1770-4, 4x oversampled).

See kit/AUDIO.md for the presets and the signal chain.
"""
import argparse
import json
import os
import struct
import sys
import time

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, uniform_filter1d

SR = 48000
DUR = 14.0
N = int(round(SR * DUR))
BPM = 96.0
BEAT = 60.0 / BPM          # 0.625 s
S16 = BEAT / 4.0           # 0.15625 s
BAR = 4.0 * BEAT           # 2.5 s
LOOP_END = 4.0 * BAR       # 10.0 s
HIT_T = LOOP_END
STOP_T = 62 * S16          # 9.6875 s: the band rests here so the swell can lead into the hit
TARGET_LUFS = -14.0
TP_CEIL = -1.5             # dBTP ceiling (0.5 dB margin under the -1 dBTP spec, for AAC)
END_FADE = (12.9, 13.96)   # master fade: tail is already near silence here

TWO_PI = 2.0 * np.pi

# --------------------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------------------

_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def nm(s):
    """Note name to MIDI number: 'A4' -> 69, 'Bb3', 'C#5', 'Cb5'."""
    letter = s[0].upper()
    i, acc = 1, 0
    while i < len(s) and s[i] in "#b":
        acc += 1 if s[i] == "#" else -1
        i += 1
    return 12 * (int(s[i:]) + 1) + _NOTE[letter] + acc


def notes(s):
    return [nm(x) for x in s.split()]


def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def step_time(step, swing):
    """Time (s) of a 16th-note step on the swung grid. Odd 16ths are pushed late."""
    t = step * S16
    if abs(step - round(step)) < 1e-9 and int(round(step)) % 2 == 1:
        t += (swing - 0.5) * 2.0 * S16
    return t


def panlaw(p):
    th = (np.asarray(p, dtype=float) + 1.0) * np.pi / 4.0
    return np.cos(th) * np.sqrt(2.0), np.sin(th) * np.sqrt(2.0)


def add_at(buf, sig, t0, pan=0.0, gain=1.0):
    """Mix a mono or stereo signal into a stereo buffer starting at t0 seconds."""
    i0 = int(round(t0 * SR))
    if i0 >= len(buf) or len(sig) == 0:
        return
    if sig.ndim == 1:
        gl, gr = panlaw(pan)
        sig = np.stack([sig * gl, sig * gr], axis=1)
    j0 = max(0, -i0)
    a = max(i0, 0)
    b = min(len(buf), i0 + len(sig))
    if b > a:
        buf[a:b] += gain * sig[j0:j0 + (b - a)]


def add_mono(buf, sig, t0, gain=1.0):
    i0 = int(round(t0 * SR))
    if i0 >= len(buf):
        return
    j0 = max(0, -i0)
    a = max(i0, 0)
    b = min(len(buf), i0 + len(sig))
    if b > a:
        buf[a:b] += gain * sig[j0:j0 + (b - a)]


def rc_ramp(x):
    """Raised-cosine 0->1 for x in [0, 1]."""
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def env_note(n, att, hold, rel, tau=None, sus=0.0):
    """Attack (raised cosine), optional exponential decay to sus, release starting at hold."""
    t = np.arange(n) / SR
    e = rc_ramp(t / max(att, 1e-4))
    if tau is not None:
        e = e * (sus + (1.0 - sus) * np.exp(-t / tau))
    if rel is not None:
        e = e * (1.0 - rc_ramp((t - hold) / max(rel, 1e-4)))
    return e


def tail_fade(y, sec=0.01):
    k = min(len(y), int(sec * SR))
    if k > 1:
        r = 1.0 - rc_ramp(np.linspace(0, 1, k))
        y[-k:] *= r[:, None] if y.ndim == 2 else r
    return y


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)) + 1e-30))


def crest_limit(x, max_crest_db=18.0):
    """Soft-saturate the peaks of an impulsive bed so its crest factor stays under a limit."""
    thr = rms(x) * 10 ** (max_crest_db / 20.0)
    return thr * np.tanh(x / thr)


def set_rms(x, db, region=None):
    r = rms(x if region is None else x[region])
    return x * (10 ** (db / 20.0) / r)


def db(x):
    return 20.0 * np.log10(np.maximum(x, 1e-12))


# --------------------------------------------------------------------------------------
# filters
# --------------------------------------------------------------------------------------

def _sos(kind, f, order=2):
    nyq = SR / 2.0
    if kind == "bp":
        f = (max(f[0], 5.0), min(f[1], nyq * 0.97))
    else:
        f = min(f, nyq * 0.97)
    bt = {"lp": "lowpass", "hp": "highpass", "bp": "bandpass"}[kind]
    return signal.butter(order, f, btype=bt, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(_sos(kind, f, order), x, axis=0)


def rbj(kind, f, q=0.707, gain_db=0.0, sr=SR):
    """RBJ cookbook biquad. kind: lp, hp, bp (0 dB peak), peak, ls, hs."""
    f = min(max(f, 5.0), sr * 0.49)
    w = TWO_PI * f / sr
    cw, sw = np.cos(w), np.sin(w)
    A = 10 ** (gain_db / 40.0)
    if kind in ("ls", "hs"):
        al = sw / 2.0 * np.sqrt(2.0)
        sa = 2.0 * np.sqrt(A) * al
        if kind == "ls":
            b = [A * ((A + 1) - (A - 1) * cw + sa), 2 * A * ((A - 1) - (A + 1) * cw),
                 A * ((A + 1) - (A - 1) * cw - sa)]
            a = [(A + 1) + (A - 1) * cw + sa, -2 * ((A - 1) + (A + 1) * cw),
                 (A + 1) + (A - 1) * cw - sa]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw),
                 A * ((A + 1) + (A - 1) * cw - sa)]
            a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw),
                 (A + 1) - (A - 1) * cw - sa]
    else:
        al = sw / (2.0 * q)
        if kind == "lp":
            b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
            a = [1 + al, -2 * cw, 1 - al]
        elif kind == "hp":
            b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
            a = [1 + al, -2 * cw, 1 - al]
        elif kind == "bp":
            b = [al, 0.0, -al]
            a = [1 + al, -2 * cw, 1 - al]
        elif kind == "peak":
            b = [1 + al * A, -2 * cw, 1 - al * A]
            a = [1 + al / A, -2 * cw, 1 - al / A]
        else:
            raise ValueError(kind)
    b = np.array(b, float) / a[0]
    a = np.array(a, float) / a[0]
    return b, a


def eq(x, kind, f, q=0.707, gain_db=0.0):
    b, a = rbj(kind, f, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def tv_biquad(x, fc, q=0.707, kind="lp", block=64, stages=1):
    """Time-varying biquad, coefficients updated every `block` samples, state carried."""
    y = x
    for _ in range(stages):
        out = np.empty_like(y)
        zi = np.zeros((2,) + y.shape[1:])
        for i in range(0, len(y), block):
            j = min(i + block, len(y))
            b, a = rbj(kind, float(fc[(i + j) // 2]), q)
            out[i:j], zi = signal.lfilter(b, a, y[i:j], axis=0, zi=zi)
        y = out
    return y


# --------------------------------------------------------------------------------------
# noise and modulation
# --------------------------------------------------------------------------------------

def colored(n, rng, ch=1, slope=0.5):
    """1/f^slope noise via FFT shaping (slope 0.5 = pink, 1 = brown), unit std."""
    w = rng.standard_normal((n, ch))
    W = np.fft.rfft(w, axis=0)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    f[0] = f[1]
    W *= (f ** -slope)[:, None]
    W[0] = 0.0
    y = np.fft.irfft(W, n, axis=0)
    y /= y.std(axis=0, keepdims=True) + 1e-20
    return y if ch > 1 else y[:, 0]


def smooth_rand(n, rate, rng):
    """Smooth random modulation in about [-1, 1] with features near `rate` Hz."""
    k = int(n / SR * rate) + 4
    pts = rng.uniform(-1.0, 1.0, k)
    x = np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)
    w = max(3, int(SR / rate * 0.7))
    x = uniform_filter1d(uniform_filter1d(x, w, mode="nearest"), w, mode="nearest")
    return x / (np.abs(x).max() + 1e-12)


# --------------------------------------------------------------------------------------
# oscillators and instruments
# --------------------------------------------------------------------------------------

def saw_blep(freq, phase0=0.0):
    dt = freq / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2.0 * ph - 1.0
    m = ph < dt
    tt = ph[m] / dt[m]
    y[m] -= tt + tt - tt * tt - 1.0
    m = ph > 1.0 - dt
    tt = (ph[m] - 1.0) / dt[m]
    y[m] -= tt * tt + tt + tt + 1.0
    return y


def osc(kind, freq, phase0, width=0.5):
    if kind == "saw":
        return saw_blep(freq, phase0)
    if kind == "pulse":
        y = saw_blep(freq, phase0) - saw_blep(freq, phase0 + width)
        return y - np.mean(y)
    if kind == "tri":
        ph = (phase0 + np.cumsum(freq / SR)) % 1.0
        return 4.0 * np.abs(ph - 0.5) - 1.0
    raise ValueError(kind)


def ep_tone(f, dur, vel, rng, E):
    """FM electric piano: tine (1:1 with decaying index) plus a 14:1 attack ping."""
    rel = E.get("release", 0.16)
    n = int((dur + rel) * SR) + 2
    t = np.arange(n) / SR
    f = f * 2 ** (rng.normal(0.0, 2.0) / 1200.0)
    v = float(np.clip(vel, 0.05, 1.0))
    ph = TWO_PI * f * t
    i1 = E["index"] * (0.35 + 0.9 * v) * np.exp(-t / (0.22 + 0.25 * (1 - v))) + E["sus"]
    r2 = 14.0
    while f * r2 > 11000 and r2 > 2:
        r2 /= 2.0
    i2 = E["tine"] * v ** 1.5 * np.exp(-t / 0.014)
    y = np.sin(ph + i1 * np.sin(ph + 0.4) + i2 * np.sin(r2 * ph))
    y = y + E["bark"] * v * (y * y - 0.5)
    tau = E["decay"] * (262.0 / f) ** 0.45
    env = env_note(n, 0.0015 + 0.003 * (1 - v), dur, rel, tau=tau, sus=0.0)
    return y * env * v ** 1.3


def partial_tone(f, n, parts, tau, rng, beat_hz=0.0):
    """Sum of decaying partials (ratio, amp, tau_scale). Optional detuned twin for shimmer."""
    t = np.arange(n) / SR
    y = np.zeros(n)
    for r, a, ts in parts:
        fr = f * r
        if fr > 19000:
            continue
        ph0 = rng.uniform(0, TWO_PI)
        e = np.exp(-t / (tau * ts))
        y += a * np.sin(TWO_PI * fr * t + ph0) * e
        if beat_hz > 0:
            y += 0.35 * a * np.sin(TWO_PI * (fr + beat_hz * r ** 0.5) * t + ph0 + 1.0) * e
    return y


CHIMES = {
    # free-free bar / plate partials (1 : 2.756 : 5.404 : 8.933)
    "celesta": dict(parts=[(1, 1.0, 1.0), (2.0, 0.10, 0.45), (2.756, 0.16, 0.28), (5.404, 0.05, 0.1)],
                    tau=1.5, ref=880, beat=0.6, click=0.03),
    "glock": dict(parts=[(1, 1.0, 1.0), (2.756, 0.32, 0.35), (5.404, 0.12, 0.15), (8.933, 0.05, 0.07)],
                  tau=1.7, ref=1046, beat=0.8, click=0.05),
    "tube": dict(parts=[(1, 1.0, 1.0), (2.756, 0.55, 0.55), (5.404, 0.3, 0.3), (8.933, 0.12, 0.16)],
                 tau=2.6, ref=1175, beat=0.5, click=0.02),
    "bell": dict(parts=[(0.5, 0.45, 1.3), (1, 1.0, 1.0), (1.19, 0.35, 0.8), (1.5, 0.28, 0.6),
                        (2.0, 0.45, 0.45), (2.51, 0.18, 0.3), (3.0, 0.08, 0.2)],
                 tau=1.7, ref=660, beat=0.7, click=0.02),
    "musicbox": dict(parts=[(1, 1.0, 1.0), (2.004, 0.2, 0.45), (3.01, 0.06, 0.3), (6.27, 0.09, 0.07)],
                     tau=1.5, ref=880, beat=0.0, click=0.06),
}


def chime_tone(kind, f, vel, rng, length=4.0, tau_scale=1.0):
    C = CHIMES[kind]
    n = int(length * SR)
    tau = tau_scale * C["tau"] * (C["ref"] / f) ** 0.5
    y = partial_tone(f, n, C["parts"], tau, rng, C["beat"])
    t = np.arange(n) / SR
    click = filt(rng.standard_normal(n), "hp", 2500) * np.exp(-t / 0.0012) * C["click"]
    y = (y + click) * rc_ramp(t / 0.0007)
    return tail_fade(y, 0.05) * vel


def vibe_tone(f, dur, vel, rng):
    """Vibraphone bar (1 : 4 : 10 tuning), soft mallet, pedal damping at note-off."""
    rel = 0.22
    n = int((dur + rel) * SR) + 2
    t = np.arange(n) / SR
    tau = 3.0 * (440.0 / f) ** 0.35
    y = partial_tone(f, n, [(1, 1.0, 1.0), (4.0, 0.22 * vel, 0.22), (10.0, 0.05 * vel, 0.07)], tau, rng)
    mallet = filt(rng.standard_normal(n), "lp", 2500) * np.exp(-t / 0.004) * 0.05
    y = (y + mallet) * env_note(n, 0.001, dur, rel)
    return y * vel ** 1.2


def ks_pluck(f, dur, vel, rng, L):
    """Karplus-Strong string: noise burst into a tuned loop with a 2-tap damping filter."""
    rel = L.get("release", 0.09)
    n = max(int((dur + rel) * SR) + 2, int(0.06 * SR))
    P = SR / f
    s = L.get("damp", 0.4)
    w = TWO_PI * f / SR
    pd_lp = -np.angle((1 - s) + s * np.exp(-1j * w)) / w
    R = P - pd_lp
    Li = int(np.floor(R))
    target = R - Li
    fr = target
    for _ in range(4):
        fr = float(np.clip(fr, 0.0, 1.0))
        pd = -np.angle((1 - fr) + fr * np.exp(-1j * w)) / w
        fr = fr + (target - pd)
    fr = float(np.clip(fr, 0.0, 1.0))
    taps = np.convolve([1 - s, s], [1 - fr, fr])
    decay = L.get("decay", 1.5) * (440.0 / f) ** 0.3
    g = 10 ** (-3.0 / (decay * f))
    a = np.zeros(Li + 3)
    a[0] = 1.0
    a[Li:Li + 3] -= g * taps
    exc = rng.standard_normal(Li + 1)
    fc = f * (1.5 + 14.0 * L.get("bright", 0.4) * vel)
    c = np.exp(-TWO_PI * min(fc, 16000) / SR)
    exc = signal.lfilter([1 - c], [1, -c], exc)
    k = max(1, int(L.get("pick", 0.2) * Li))
    exc[k:] -= 0.85 * exc[:-k].copy()
    exc *= np.hanning(len(exc) + 2)[1:-1] ** 0.3
    exc /= rms(exc)
    x = np.zeros(n)
    x[:len(exc)] = exc
    y = signal.lfilter([1.0], a, x)
    t = np.arange(n) / SR
    y += filt(rng.standard_normal(n), "lp", 900) * np.exp(-t / 0.003) * 0.25  # finger
    y *= env_note(n, 0.0008, dur, rel)
    return y * vel ** 1.25 * 0.25


def bass_tone(f, dur, vel, B):
    rel = 0.07
    n = int((dur + rel) * SR) + 2
    t = np.arange(n) / SR
    ph = TWO_PI * f * t
    y = (np.sin(ph) + 2.2 * B.get("h2", 0.16) * np.sin(2 * ph + 0.3) +
         1.8 * B.get("h3", 0.06) * np.sin(3 * ph + 0.7))
    d = B.get("drive", 1.5)
    y = np.tanh(d * y) / np.tanh(d)
    env = env_note(n, 0.007, dur, rel, tau=B.get("tau", 1.3), sus=B.get("sus", 0.55))
    return y * env * vel


# drums ---------------------------------------------------------------------------------

def kick(vel, rng, K):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = K["f1"] + (K["f0"] - K["f1"]) * np.exp(-t / K["tp"])
    ph = TWO_PI * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / K["decay"])
    click = filt(rng.standard_normal(n), "lp", 2200) * np.exp(-t / 0.004) * K.get("click", 0.1)
    knock = filt(rng.standard_normal(n), "bp", (90, 350)) * np.exp(-t / 0.02) * K.get("knock", 0.35)
    y = (body + click + knock) * (1.0 - np.exp(-t / 0.0007))
    y = np.tanh(1.6 * y) / np.tanh(1.6)
    y = filt(y, "lp", K.get("lp", 3000))
    return tail_fade(y, 0.08) * vel


def brush(vel, rng, S=None):
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    nz = filt(rng.standard_normal(n), "bp", (900, 6000))
    env = rc_ramp(t / 0.006) * (np.exp(-t / 0.07) + 0.14 * np.exp(-t / 0.18))
    body = (0.45 * np.sin(TWO_PI * 192 * t) + 0.18 * np.sin(TWO_PI * 335 * t + 1.0)) * np.exp(-t / 0.05)
    body *= 1.0 - np.exp(-t / 0.001)
    y = nz * env * 1.6 + body
    return tail_fade(y, 0.05) * vel * 0.42


def rim(vel, rng, S=None):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    exc = rng.standard_normal(n) * np.exp(-t / 0.0015)
    y = np.zeros(n)
    for f, q, g in ((470, 9, 0.7), (1650, 14, 1.0), (3300, 10, 0.45)):
        b, a = rbj("bp", f * (1 + 0.01 * rng.normal()), q)
        y += g * signal.lfilter(b, a, exc)
    y += 0.25 * np.sin(TWO_PI * 470 * t) * np.exp(-t / 0.022) * (1 - np.exp(-t / 0.0005))
    y *= rc_ramp(t / 0.0009)
    return tail_fade(y, 0.03) * vel * 3.4


def hat(vel, rng, H, open_=False):
    n = int((0.5 if open_ else 0.18) * SR)
    t = np.arange(n) / SR
    fr = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * H.get("tune", 1.25)
    metal = np.zeros(n)
    for f in fr:
        metal += np.sign(np.sin(TWO_PI * f * t + rng.uniform(0, TWO_PI)))
    x = 0.5 * metal / 6.0 + 0.5 * rng.standard_normal(n)
    x = filt(x, "hp", 6500)
    x = filt(x, "lp", H.get("lp", 9000))
    dec = 0.17 if open_ else H.get("decay", 0.038)
    env = (1.0 - np.exp(-t / 0.0006)) * np.exp(-t / dec)
    return tail_fade(x * env, 0.03) * vel * 1.1


def shaker(vel, rng, H=None):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    nz = filt(rng.standard_normal(n), "bp", (4200, 10500))
    env = rc_ramp(t / 0.009) * np.exp(-t / 0.045)
    return tail_fade(nz * env, 0.02) * vel * 0.38


def tom(vel, rng, f=96.0):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.35 * np.exp(-t / 0.03))
    ph = TWO_PI * np.cumsum(fr) / SR
    y = np.sin(ph) * np.exp(-t / 0.28)
    skin = filt(rng.standard_normal(n), "bp", (180, 1400)) * np.exp(-t / 0.012) * 0.6
    y = (y + skin) * (1 - np.exp(-t / 0.001))
    return tail_fade(y, 0.05) * vel * 0.38


# --------------------------------------------------------------------------------------
# effects
# --------------------------------------------------------------------------------------

def make_ir(rng, rt_lo, rt_hi, length, predelay, damp=9000.0, er=10):
    """Stereo reverb impulse: band-split noise with per-band exponential decay, a diffuse
    build-up, sparse early reflections and HF damping. Unit energy per channel."""
    n = int(length * SR)
    t = np.arange(n) / SR
    edges = [0, 200, 600, 1800, 5000, 24000]
    rts = np.geomspace(rt_lo, rt_hi, len(edges) - 1)
    ir = np.zeros((n, 2))
    for ch in range(2):
        w = rng.standard_normal(n)
        acc = np.zeros(n)
        for (lo, hi), rt in zip(zip(edges[:-1], edges[1:]), rts):
            if lo == 0:
                b = filt(w, "lp", hi, 4)
            elif hi >= 24000:
                b = filt(w, "hp", lo, 4)
            else:
                b = filt(w, "bp", (lo, hi), 3)
            acc += b * np.exp(-6.9078 * t / rt)
        acc *= 1.0 - np.exp(-t / 0.018)
        lvl = rms(acc[: int(0.1 * SR)])
        for _ in range(er):
            d = rng.uniform(0.003, 0.06)
            acc[int(d * SR)] += rng.choice([-1, 1]) * rng.uniform(0.6, 1.6) * lvl * np.exp(-d / 0.04)
        acc = filt(acc, "lp", damp)
        acc *= 1.0 - rc_ramp((t - 0.85 * length) / (0.15 * length))
        ir[:, ch] = acc
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    return np.concatenate([np.zeros((int(predelay * SR), 2)), ir])


def reverb(x, ir, cross=0.3):
    n = len(x)
    inl = x[:, 0] + cross * x[:, 1]
    inr = x[:, 1] + cross * x[:, 0]
    wl = signal.oaconvolve(inl, ir[:, 0])[:n]
    wr = signal.oaconvolve(inr, ir[:, 1])[:n]
    return np.stack([wl, wr], axis=1) / (1.0 + cross)


def frac_delay_read(x, pos):
    return np.interp(pos, np.arange(len(x)), x, left=0.0, right=0.0)


def chorus(x, rng, rate=0.5, depth_ms=2.0, base_ms=11.0, mix=0.3):
    """Stereo chorus from a mono or stereo input (quadrature LFOs)."""
    n = len(x)
    t = np.arange(n) / SR
    mono = x if x.ndim == 1 else x.mean(axis=1)
    out = np.zeros((n, 2))
    ph0 = rng.uniform(0, TWO_PI)
    for ch, ph in ((0, 0.0), (1, np.pi / 2)):
        d = (base_ms + depth_ms * np.sin(TWO_PI * rate * t + ph0 + ph)) * SR / 1000.0
        wet = frac_delay_read(mono, np.arange(n) - d)
        dry = mono if x.ndim == 1 else x[:, ch]
        out[:, ch] = dry * (1 - mix) + wet * mix
    return out


def autopan(x, rate, depth, phase=0.0):
    t = np.arange(len(x)) / SR
    l = np.sin(TWO_PI * rate * t + phase)
    mono = x if x.ndim == 1 else x.mean(axis=1)
    return np.stack([mono * (1 + depth * l), mono * (1 - depth * l)], axis=1)


def tremolo(x, rate, depth, phase=0.0):
    t = np.arange(len(x)) / SR
    g = 1.0 - depth * (0.5 + 0.5 * np.sin(TWO_PI * rate * t + phase))
    return x * (g[:, None] if x.ndim == 2 else g)


def tape(x, rng, drive_db=4.0, wow_ms=0.45, flutter_ms=0.03):
    """Wow and flutter (modulated read head), then oversampled tanh saturation with
    pre/de-emphasis, head bump and HF roll-off."""
    n = len(x)
    t = np.arange(n) / SR
    d = (wow_ms * (0.75 * np.sin(TWO_PI * 0.55 * t + rng.uniform(0, TWO_PI)) +
                   0.25 * smooth_rand(n, 0.9, rng)) +
         flutter_ms * np.sin(TWO_PI * 6.3 * t + rng.uniform(0, TWO_PI))) * SR / 1000.0
    pos = np.arange(n) - d
    y = np.stack([frac_delay_read(x[:, c], pos) for c in range(2)], axis=1)
    y2 = signal.resample_poly(y, 2, 1, axis=0)
    b, a = rbj("hs", 3500, gain_db=3.0, sr=2 * SR)
    y2 = signal.lfilter(b, a, y2, axis=0)
    g = 10 ** (drive_db / 20.0)
    bias = 0.06
    y2 = (np.tanh(g * y2 + bias) - np.tanh(bias)) / (g * (1 - np.tanh(bias) ** 2))
    b, a = rbj("hs", 3500, gain_db=-3.0, sr=2 * SR)
    y2 = signal.lfilter(b, a, y2, axis=0)
    y = signal.resample_poly(y2, 1, 2, axis=0)[:n]
    y = eq(y, "peak", 85, 0.8, 1.0)
    y = filt(y, "lp", 14500, 2)
    return y


def width(x, amount, mono_below=140.0):
    m = 0.5 * (x[:, 0] + x[:, 1])
    s = 0.5 * (x[:, 0] - x[:, 1])
    s = filt(s, "hp", mono_below, 2) * amount
    return np.stack([m + s, m - s], axis=1)


def duck_env(hits, depth_db, rel=0.14):
    d = np.zeros(N)
    L = int(0.7 * SR)
    t = np.arange(L) / SR
    shape = (1 - np.exp(-t / 0.006)) * np.exp(-t / rel)
    shape /= shape.max()
    for tk, v in hits:
        i = int(round(tk * SR))
        j = min(N, i + L)
        if i < N:
            d[i:j] = np.maximum(d[i:j], v * shape[: j - i])
    return 10 ** (-depth_db * d / 20.0)


# --------------------------------------------------------------------------------------
# loudness, true peak, limiter, wav
# --------------------------------------------------------------------------------------

_KB1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_KA1 = [1.0, -1.69065929318241, 0.73248077421585]
_KB2 = [1.0, -2.0, 1.0]
_KA2 = [1.0, -1.99004745483398, 0.99007225036621]


def _kweight(x):
    if x.ndim == 1:
        x = x[:, None]
    y = signal.lfilter(_KB1, _KA1, x, axis=0)
    return signal.lfilter(_KB2, _KA2, y, axis=0)


def momentary(x, blk_s=0.4, hop_s=0.1):
    y = _kweight(x)
    blk, hop = int(blk_s * SR), int(hop_s * SR)
    cs = np.concatenate([np.zeros((1, y.shape[1])), np.cumsum(y ** 2, axis=0)])
    starts = np.arange(0, max(1, len(y) - blk + 1), hop)
    z = ((cs[starts + blk] - cs[starts]) / blk).sum(axis=1)
    return starts / SR, -0.691 + 10 * np.log10(z + 1e-20), z


def lufs(x):
    """BS.1770-4 integrated loudness (absolute -70 and relative -10 LU gates)."""
    _, l, z = momentary(x)
    keep = l > -70.0
    if not keep.any():
        return -120.0
    rel = -0.691 + 10 * np.log10(z[keep].mean()) - 10.0
    keep &= l > rel
    return float(-0.691 + 10 * np.log10(z[keep].mean()))


def peak4x(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(axis=1)
    pk = pk[: 4 * len(x)].reshape(-1, 4).max(axis=1)
    return np.maximum(pk, np.abs(x).max(axis=1))


def true_peak_db(x):
    return float(db(peak4x(x).max()))


def limiter(x, ceil_db, look=0.0025, rel_db_s=12.0):
    """Look-ahead true-peak limiter. Gain reduction (dB) is held with a linear release,
    then smoothed by a forward max and two trailing box filters so it always covers the
    required reduction and never steps."""
    gr = np.maximum(0.0, db(peak4x(x)) - ceil_db)
    L = int(look * SR)
    L += L % 2
    idx = np.arange(len(gr))
    rate = rel_db_s / SR
    r = np.maximum.accumulate(gr + rate * idx) - rate * idx
    m = maximum_filter1d(r, size=2 * L + 1, origin=-L, mode="nearest")
    s = uniform_filter1d(m, size=L + 1, origin=L // 2, mode="nearest")
    s = uniform_filter1d(s, size=L + 1, origin=L // 2, mode="nearest")
    return x * (10 ** (-s / 20.0))[:, None], float(s.max()), float(np.mean(s[s > 0.01])) if np.any(s > 0.01) else 0.0


def write_wav24(path, x, rng):
    x = np.asarray(x, float)
    lsb = 1.0 / 2 ** 23
    dither = (rng.uniform(-0.5, 0.5, x.shape) + rng.uniform(-0.5, 0.5, x.shape)) * lsb
    dither *= (np.abs(x) > 1e-7).any(axis=1, keepdims=True)
    q = np.round(np.clip(x + dither, -1.0, 1.0 - lsb) * 2 ** 23).astype("<i4")
    raw = q.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with open(path, "wb") as fh:
        fh.write(b"RIFF" + struct.pack("<I", 36 + len(raw)) + b"WAVE")
        fh.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, SR, SR * 6, 6, 24))
        fh.write(b"data" + struct.pack("<I", len(raw)))
        fh.write(raw)


def read_wav24(path):
    with open(path, "rb") as fh:
        data = fh.read()
    i = data.index(b"data") + 8
    raw = np.frombuffer(data[i:], np.uint8).reshape(-1, 3)
    v = (raw[:, 0].astype(np.int32) | (raw[:, 1].astype(np.int32) << 8) |
         (raw[:, 2].astype(np.int32) << 16))
    v = np.where(v >= 2 ** 23, v - 2 ** 24, v)
    return (v / 2 ** 23).reshape(-1, 2)


# --------------------------------------------------------------------------------------
# ambience beds
# --------------------------------------------------------------------------------------

LOOPR = slice(0, int(LOOP_END * SR))


def poisson_times(rng, rate_fn_max, dur, accept=None):
    k = rng.poisson(rate_fn_max * dur)
    tt = np.sort(rng.uniform(0, dur, k))
    if accept is not None:
        tt = tt[rng.random(len(tt)) < accept(tt)]
    return tt


def impulses(times, amps, pans=None, shape_ms=(0.2, 0.6), rng=None, groups=1):
    """Sparse stereo impulse train, smeared by short Hann pulses of random width per group."""
    out = np.zeros((N, 2))
    idx = np.clip((times * SR).astype(int), 0, N - 1)
    if pans is None:
        pans = np.zeros(len(times))
    gl, gr = panlaw(pans)
    grp = rng.integers(0, groups, len(times))
    for g in range(groups):
        sel = grp == g
        imp = np.zeros((N, 2))
        np.add.at(imp[:, 0], idx[sel], amps[sel] * gl[sel])
        np.add.at(imp[:, 1], idx[sel], amps[sel] * gr[sel])
        w = int(SR * rng.uniform(*shape_ms) / 1000.0) + 2
        win = np.hanning(w + 2)[1:-1]
        out += signal.lfilter(win / win.sum(), [1.0], imp, axis=0)
    return out


def resonate(x, modes, rng=None, jitter=0.0):
    y = np.zeros_like(x)
    for f, q, g in modes:
        if rng is not None and jitter:
            f = f * (1 + jitter * rng.normal())
        b, a = rbj("bp", f, q)
        y += g * signal.lfilter(b, a, x, axis=0)
    return y


def rain_on_roof(rng, rate=150.0):
    tt = poisson_times(rng, rate, DUR)
    amp = np.minimum(np.exp(rng.normal(-0.7, 0.8, len(tt))), 4.0)
    pan = rng.uniform(-0.85, 0.85, len(tt))
    out = np.zeros((N, 2))
    base = np.array([330.0, 590.0, 880.0, 1290.0, 1760.0, 2400.0, 3250.0])
    grp = rng.integers(0, 4, len(tt))
    for g in range(4):
        sel = grp == g
        imp = impulses(tt[sel], amp[sel], pan[sel], (0.15, 0.7), rng, groups=2)
        modes = [(f * rng.uniform(0.94, 1.06), rng.uniform(7, 15),
                  rng.uniform(0.3, 1.0) * (f / 1000.0) ** -0.25) for f in base]
        out += resonate(imp, modes)
    thud = filt(impulses(tt, amp ** 1.3, pan * 0.5, (1.0, 2.5), rng), "lp", 260) * 2.5
    return filt(out, "lp", 6500) + thud


def engine_hum(rng, f0=34.0, level_half=0.3):
    f = f0 * (1 + 0.012 * smooth_rand(N, 0.25, rng) + 0.004 * smooth_rand(N, 2.0, rng))
    ph = TWO_PI * np.cumsum(f) / SR
    y = level_half * np.sin(0.5 * ph + 0.2)
    for k, a in enumerate([1.0, 0.65, 0.45, 0.28, 0.16, 0.1, 0.06, 0.04], start=1):
        y += a * np.sin(k * ph + rng.uniform(0, TWO_PI))
    y *= 1 + 0.08 * smooth_rand(N, 3.0, rng)
    y = y / rms(y) + 0.7 * filt(colored(N, rng, 1, 1.0), "lp", 110, 2)
    y = filt(y, "lp", 420, 2)
    return np.stack([y, y * 0.97], axis=1)


def cricket(rng, fc, period, nsyl, syl=0.016, gap=0.017, jitter=0.04, lock=None, until=DUR):
    """Field cricket: chirps of `nsyl` tonal syllables. lock=(swing, every_steps) puts the
    chirps on the music grid."""
    y = np.zeros(N)
    ls = int(syl * SR)
    ts = np.arange(ls) / SR
    win = np.sin(np.pi * ts / syl) ** 2
    if lock is None:
        times = []
        tc = rng.uniform(0, period)
        while tc < until:
            times.append(tc)
            tc += period * (1 + jitter * rng.normal())
    else:
        sw, every = lock
        times = [step_time(s, sw) + rng.normal(0, 0.003) for s in range(0, 200, every)
                 if step_time(s, sw) < until]
    for tc in times:
        a = 1 + 0.15 * rng.normal()
        for k in range(nsyl):
            i = int((max(tc, 0) + k * (syl + gap)) * SR)
            if i + ls >= N:
                break
            fk = fc * (1 + 0.006 * rng.normal())
            phs = TWO_PI * fk * ts * (1 - 0.012 * ts / syl) + rng.uniform(0, TWO_PI)
            seg = np.sin(phs) + 0.06 * np.sin(2 * phs)
            y[i:i + ls] += seg * win * a * (0.85 + 0.3 * rng.random())
    return y


def tree_cricket(rng, fc=2950.0, pulse=46.0):
    t = np.arange(N) / SR
    car = np.sin(TWO_PI * fc * t + 0.002 * np.cumsum(smooth_rand(N, 1.0, rng)))
    p = (0.5 - 0.5 * np.cos(TWO_PI * pulse * t)) ** 2
    sw = 0.55 + 0.45 * smooth_rand(N, 0.15, rng)
    return car * p * sw


def jingle_bells(rng, nb=16):
    """Pool of small sleigh bells: inharmonic shell partials plus a short pellet rattle."""
    bells = []
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    for _ in range(nb):
        f0 = rng.uniform(2400, 5200)
        ratios = [1.0, 1.5 + 0.1 * rng.random(), 2.1 + 0.15 * rng.random(),
                  2.8 + 0.2 * rng.random(), 3.6 + 0.2 * rng.random()]
        amps = [1.0, 0.7, 0.5, 0.35, 0.2]
        taus = np.array([0.22, 0.16, 0.12, 0.08, 0.05]) * rng.uniform(0.8, 1.2)
        y = np.zeros(n)
        for r, a, tau in zip(ratios, amps, taus):
            if f0 * r < 19000:
                y += a * np.sin(TWO_PI * f0 * r * t + rng.uniform(0, TWO_PI)) * np.exp(-t / tau)
        rattle = filt(rng.standard_normal(n), "bp", (3000, 11000)) * np.exp(-t / 0.012) * 0.35
        bells.append(tail_fade((y + rattle) * rc_ramp(t / 0.0003), 0.05))
    return bells


def shake(buf, t0, intensity, bells, rng, pan=0.0):
    for _ in range(int(rng.integers(4, 10))):
        b = bells[int(rng.integers(len(bells)))]
        r = rng.uniform(0.97, 1.03)
        bb = np.interp(np.arange(0, len(b) - 1, r), np.arange(len(b)), b)
        add_at(buf, bb, t0 + rng.uniform(0, 0.09), pan + rng.uniform(-0.2, 0.2),
               intensity * rng.uniform(0.25, 1.0))


def bubble(rng, f0, tau):
    n = int(6 * tau * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.6 * t / (6 * tau))
    y = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / tau) * (1 - np.exp(-t / 0.0005))
    return tail_fade(y, 0.004)


def creak(rng, dur=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rate = 40 + 85 * np.sin(np.pi * t / dur) ** 1.5 * rng.uniform(0.8, 1.1) + 8 * smooth_rand(n, 12, rng)
    ph = np.cumsum(rate) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    imp = np.zeros(n)
    imp[idx] = rng.uniform(0.5, 1.0, len(idx))
    y = resonate(imp, [(410, 8, 1.0), (760, 10, 0.8), (1380, 12, 0.55), (2450, 14, 0.3)], rng, 0.03)
    y = filt(y, "lp", 4500, 2)
    return tail_fade(y * np.sin(np.pi * t / dur) ** 0.8, 0.02)


def amb_fade(n=N):
    """Ambience gain: full through the cruise, then a smooth dB-linear fade after the hit."""
    t = np.arange(n) / SR
    x = np.clip((t - 10.25) / (13.6 - 10.25), 0, 1)
    g = 10 ** (-48 * x ** 1.3 / 20.0)
    return g * (1 - rc_ramp((t - 13.55) / 0.35))


def amb_mushroom(rng, P, out_ir):
    reg = LOOPR
    drops = set_rms(crest_limit(rain_on_roof(rng, 150.0), 16.0), -22, reg)
    wash = colored(N, rng, 2, 0.5)
    wash = filt(wash, "bp", (500, 5000)) * (1 + 0.3 * smooth_rand(N, 0.4, rng))[:, None]
    wash = set_rms(wash, -36, reg)
    eng = set_rms(engine_hum(rng, 46.0, 0.12), -32, reg)
    ins = np.zeros((N, 2))
    for fc, per, ns, pan, g in ((4300, 0.52, 3, -0.6, 1.0), (4750, 0.71, 4, 0.55, 0.7),
                                (3900, 0.45, 2, 0.1, 0.5)):
        add_at(ins, cricket(rng, fc, per, ns), 0.0, pan, g)
    add_at(ins, tree_cricket(rng, 2950, 46), 0.0, 0.3, 0.45)
    ins = ins * 0.4 + reverb(ins, out_ir) * 0.9
    ins = set_rms(filt(ins, "lp", 5200), -39, reg)
    return drops + wash + eng + ins


def toy_click(rng, kind):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    exc = rng.standard_normal(n) * np.exp(-t / 0.0006)
    if kind == 0:
        modes = [(2350, 22, 1.0), (3720, 26, 0.7), (5150, 30, 0.45), (1240, 15, 0.5), (210, 6, 1.2)]
    else:
        modes = [(1880, 20, 1.0), (2960, 24, 0.7), (4420, 28, 0.4), (990, 14, 0.5), (180, 6, 1.4)]
    y = resonate(exc, modes, rng, 0.02)
    return tail_fade(y * rc_ramp(t / 0.0003), 0.02)


def amb_bedroom(rng, P, out_ir):
    reg = LOOPR
    sw = P["swing"]
    t = np.arange(N) / SR
    clicks = np.zeros((N, 2))
    # clickety-clack: two axles per truck, one truck per beat, alternating timbre, on the grid
    for beat in range(16):
        kind = beat % 2
        for k, (st, v) in enumerate(((0, 0.95), (1, 0.6))):
            tt = step_time(4 * beat + st, sw) + rng.normal(0, 0.0008)
            add_at(clicks, toy_click(rng, kind), max(tt, 0.0), -0.15 + 0.3 * k,
                   v * (1 + 0.06 * rng.normal()))
    # the train coasts to a stop after the hit
    tt, gap, amp = HIT_T + BEAT, BEAT, 0.8
    for k in range(6):
        gap *= 1.22
        for st, v in ((0, 0.95), (1, 0.6)):
            add_at(clicks, toy_click(rng, k % 2), tt + st * S16 * (1.22 ** k), -0.1, v * amp)
        tt += gap
        amp *= 0.72
    clicks = set_rms(crest_limit(clicks + 0.25 * reverb(clicks, out_ir), 15.0), -26, reg)
    # little motor: buzz that slows down with the train
    fm = 150.0 * np.where(t < HIT_T, 1.0, np.maximum(0.45, 1.0 - 0.22 * (t - HIT_T)))
    fm = fm * (1 + 0.01 * smooth_rand(N, 3.0, rng))
    ph = np.cumsum(fm) / SR
    buzz = filt((2 * (ph % 1.0) - 1.0), "bp", (120, 1800))
    whine = np.sin(TWO_PI * np.cumsum(fm * 8.8) / SR) * 0.25
    motor = (buzz + whine) * (0.85 + 0.15 * np.sin(TWO_PI * t / BEAT))
    motor = np.stack([motor, motor], axis=1) * amb_fade()[:, None]
    motor = set_rms(motor, -41, reg)
    rumble = filt(colored(N, rng, 2, 0.5), "bp", (90, 700)) * (0.8 + 0.2 * np.sin(TWO_PI * t / BEAT))[:, None]
    rumble = set_rms(rumble, -37, reg)
    room = filt(filt(colored(N, rng, 2, 0.5), "lp", 1800), "hp", 40)
    room = set_rms(room, -45, reg)
    return clicks + motor + rumble + room


def amb_snow(rng, P, out_ir):
    reg = LOOPR
    sw = P["swing"]
    t = np.arange(N) / SR
    gust = 0.5 + 0.5 * smooth_rand(N, 0.18, rng)
    wind = colored(N, rng, 2, 1.0)
    wind = tv_biquad(wind, 220 * 2 ** (1.4 * gust), 0.9, "lp", 128, stages=2)
    wind = filt(wind, "hp", 50) * (0.35 + 0.65 * gust ** 1.5)[:, None]
    wind = set_rms(wind, -27, reg)
    wheel = 0.55 + 0.45 * (0.5 + 0.5 * np.sin(TWO_PI * 2.9 * t))
    tt = poisson_times(rng, 900.0, DUR, accept=lambda x: np.interp(x, t, wheel))
    amp = np.minimum(np.exp(rng.normal(-0.5, 0.7, len(tt))), 4.0)
    crunch = impulses(tt, amp, rng.uniform(-0.4, 0.4, len(tt)), (0.2, 1.5), rng, groups=3)
    crunch = filt(crunch, "bp", (300, 2800)) + 0.4 * eq(crunch, "bp", 1100, 2.0)
    crunch = filt(crunch, "lp", 3500)
    rumble = filt(colored(N, rng, 2, 1.0), "lp", 120)
    tires = set_rms(crest_limit(crunch, 16.0), -29, reg) + set_rms(rumble, -33, reg)
    bells = jingle_bells(rng)
    jb = np.zeros((N, 2))
    swell = lambda x: 0.35 + 0.65 * np.clip(x / 6.0, 0, 1)
    for s in range(0, 64, 2):
        tt0 = step_time(s, sw)
        shake(jb, tt0 + rng.normal(0, 0.008), swell(tt0) * (1.0 if s % 4 == 0 else 0.6),
              bells, rng, -0.5 + s / 64.0)
    shake(jb, HIT_T + 0.01, 1.4, bells, rng, 0.2)
    for k in range(1, 7):
        shake(jb, HIT_T + k * 2 * S16 * 1.1 ** k, 1.1 * 0.7 ** k, bells, rng, 0.25)
    jb = filt(jb * 0.35 + reverb(jb, out_ir) * 1.0, "lp", 7500)
    jb = set_rms(jb, -36, reg)
    return wind + tires + jb


def amb_canal(rng, P, out_ir):
    reg = LOOPR
    sw = P["swing"]
    bed = filt(filt(colored(N, rng, 2, 1.0), "lp", 600), "hp", 70)
    bed = set_rms(bed * (0.7 + 0.3 * smooth_rand(N, 0.3, rng))[:, None], -37, reg)
    laps = np.zeros((N, 2))
    tl = rng.uniform(0.1, 0.5)
    while tl < 13.5:
        n = int(0.9 * SR)
        tt = np.arange(n) / SR
        fc = rng.uniform(250, 700)
        slosh = filt(rng.standard_normal(n), "bp", (fc * 0.5, fc * 1.6))
        slosh *= rc_ramp(tt / rng.uniform(0.04, 0.09)) * np.exp(-tt / rng.uniform(0.18, 0.35))
        knock = np.sin(TWO_PI * rng.uniform(120, 170) * tt) * np.exp(-tt / 0.06) * rc_ramp(tt / 0.006)
        y = slosh + 0.3 * knock
        for _ in range(int(rng.integers(2, 6))):
            add_mono(y, bubble(rng, rng.uniform(500, 1400), rng.uniform(0.012, 0.035)) * 0.25,
                     rng.uniform(0.02, 0.25))
        add_at(laps, tail_fade(y, 0.05), tl, rng.uniform(-0.45, 0.45), rng.uniform(0.6, 1.0))
        tl += rng.uniform(0.7, 1.7)
    laps = set_rms(laps, -28, reg)
    oar = np.zeros((N, 2))
    for bar in range(5):
        to = step_time(bar * 16 + 6, sw)
        add_at(oar, creak(rng, rng.uniform(0.5, 0.7)), to, -0.35, 1.0)
        n = int(0.9 * SR)
        tt = np.arange(n) / SR
        swish = filt(rng.standard_normal(n), "bp", (300, 2200)) * np.sin(np.pi * tt / 0.9) ** 2
        add_at(oar, swish * 0.35, to + 0.35, -0.5, 1.0)
    oar = set_rms(oar + 0.2 * reverb(oar, out_ir), -31, reg)
    tubes = [chime_tone("tube", hz(m), 1.0, rng, 5.0) for m in notes("D6 E6 F#6 A6 B6")]
    ch = np.zeros((N, 2))
    for gc in rng.uniform(0.5, 9.5, 3).tolist() + [HIT_T + 0.15]:
        tc = gc
        for _ in range(int(rng.integers(4, 9))):
            k = int(rng.integers(len(tubes)))
            add_at(ch, tubes[k], tc, -0.7 + 0.35 * k, rng.uniform(0.3, 1.0))
            tc += rng.uniform(0.08, 0.4)
    ch = filt(ch * 0.4 + reverb(ch, out_ir), "lp", 7000)
    ch = set_rms(ch, -34, reg)
    return bed + laps + oar + ch


def amb_desert(rng, P, out_ir):
    reg = LOOPR
    sw = P["swing"]
    t = np.arange(N) / SR
    gust = 0.5 + 0.5 * smooth_rand(N, 0.22, rng)
    wind = filt(colored(N, rng, 2, 0.5), "bp", (350, 2800)) * (0.3 + 0.7 * gust ** 1.6)[:, None]
    sand = filt(colored(N, rng, 2, 0.0), "hp", 4000) * (0.3 * gust ** 2)[:, None]
    wn = colored(N, rng, 1, 0.3)
    wh = tv_biquad(wn, 760 * 2 ** (0.45 * smooth_rand(N, 0.3, rng)), 30.0, "bp", 128)
    wh = wh * np.clip(smooth_rand(N, 0.25, rng), 0, 1) ** 2
    wind = set_rms(wind, -30.5, reg) + set_rms(sand, -40, reg)
    whistle = set_rms(np.stack([wh * 0.8, wh], axis=1), -44, reg)
    cr = np.zeros((N, 2))
    add_at(cr, cricket(rng, 4600, BEAT, 3, lock=(sw, 4), until=13.0), 0.0, -0.35, 1.0)
    add_at(cr, cricket(rng, 5100, 0.41, 4), 0.0, 0.5, 0.55)
    add_at(cr, cricket(rng, 4300, 0.57, 3), 0.0, 0.1, 0.4)
    cr = set_rms(cr + 0.35 * reverb(cr, out_ir), -32, reg)
    hiss = filt(colored(N, rng, 2, 0.5), "bp", (600, 6000)) * (0.85 + 0.15 * np.sin(TWO_PI * 3.1 * t))[:, None]
    hiss = set_rms(hiss, -35, reg)
    sp = np.zeros((N, 2))
    for ts_, a in ((1.35, 1.0), (3.85, 0.7), (6.55, 1.0), (8.7, 0.8), (5.2, 0.35), (2.6, 0.3)):
        n = int(1.0 * SR)
        tt = np.arange(n) / SR
        y = filt(rng.standard_normal(n), "bp", (220, 5000)) * rc_ramp(tt / 0.07) * np.exp(-tt / 0.28)
        y = filt(y, "lp", 6000)
        k = 24
        dt_ = np.sort(rng.uniform(0.08, 0.7, k))
        drops = impulses(ts_ + dt_, rng.uniform(0.2, 1.0, k), rng.uniform(-0.6, 0.6, k), (0.3, 0.8), rng)
        add_at(sp, tail_fade(y, 0.05), ts_, rng.uniform(-0.3, 0.3), a)
        sp += 0.25 * resonate(drops, [(1800, 8, 1.0), (2900, 10, 0.7), (4200, 12, 0.4)], rng, 0.1) * a
    sp = set_rms(sp, -28, reg)
    eng = set_rms(engine_hum(rng, 40.0, 0.2), -39, reg)
    return filt(wind + whistle + cr + hiss + sp + eng, "lp", 9000)


AMBIENCES = {"mushroom": amb_mushroom, "bedroom": amb_bedroom, "snow": amb_snow,
             "canal": amb_canal, "desert": amb_desert}


# --------------------------------------------------------------------------------------
# presets (all original material)
# --------------------------------------------------------------------------------------

def per_bar(pattern, bars=4):
    """Repeat (step, dur, vel) pattern per bar."""
    out = []
    for b in range(bars):
        for s, d, v in pattern:
            out.append((b * 16 + s, d, v))
    return out


PRESETS = {}

PRESETS["01-mushroom-hollow"] = dict(
    title="Mushroom Hollow",
    seed=1101,
    key="A minor (Aeolian), resolving to A major 9 (Picardy)",
    mood="mysterious and cozy",
    progression="Am9 | Fmaj7#11 | Dm9 | E7sus4 E7b9 || Amaj9",
    swing=0.60,
    chords=[
        (0, 16, "C4 E4 G4 B4", "E3 G3 B3 C4"),
        (16, 16, "A3 C4 E4 B4", "C3 F3 A3 E4"),
        (32, 16, "C4 E4 F4 A4", "D3 A3 C4 F4"),
        (48, 8, "D4 E4 A4 B4", "E3 A3 B3 D4"),
        (56, 8, "D4 F4 G#4 B4", "D3 G#3 B3 F4"),
    ],
    bass=[(0, 6, "A1", .95), (7, 2, "A2", .5), (10, 5, "A1", .85),
          (16, 6, "F1", .95), (23, 2, "F2", .5), (26, 4, "F1", .8), (30, 2, "E1", .6),
          (32, 6, "D2", .95), (39, 2, "A1", .55), (42, 4, "D2", .8), (46, 2, "C2", .6),
          (48, 6, "E1", .95), (55, 2, "E2", .55), (58, 4, "E1", .85), (62, 2, "G#1", .6)],
    comp=[(0, 6, .72), (7, 3, .55), (10, 5, .62), (16, 6, .7), (23, 3, .55), (26, 5, .6),
          (32, 6, .72), (39, 3, .55), (42, 5, .62), (48, 6, .7), (55, 1, .45), (58, 5, .62)],
    lead=dict(kind="pluck", bright=0.32, decay=1.4, damp=0.42, pick=0.21),
    melody=[(2, 2, "E5", .72), (6, 2, "G5", .6), (8, 2, "E5", .65), (11, 2, "D5", .55), (13, 3, "B4", .6),
            (18, 2, "C5", .7), (20, 2, "B4", .6), (22, 4, "E5", .7), (28, 4, "A4", .55),
            (34, 2, "F5", .7), (36, 2, "E5", .6), (38, 2, "D5", .6), (40, 6, "E5", .72), (46, 2, "A4", .5),
            (50, 2, "B4", .65), (52, 3, "D5", .6), (55, 3, "F5", .66), (58, 2, "E5", .6), (60, 3, "G#4", .55)],
    ep=dict(index=1.25, sus=0.12, tine=0.9, decay=1.9, bark=0.12, trem_rate=3.6, trem_depth=0.25,
            strum=0.009, lp=6800, chorus=0.3),
    pad=dict(osc="saw", voices=3, detune=9, drift=3, cutoff=650, q=1.0, lfo_oct=0.9, lfo_period=5.0,
             env_oct=0.6, env_tau=1.2, attack=0.35, release=0.7, spread=0.6),
    bass_sound=dict(drive=1.7, tau=1.4, sus=0.6, h2=0.18, h3=0.07),
    drums=dict(
        base=dict(kick=[(0, 1.0), (7, .62), (10, .82)],
                  snare=[(4, .8), (12, .85), (9, .16), (14, .22)],
                  hat=[(0, .55), (2, .3), (4, .45), (6, .3), (8, .52), (10, .3), (12, .45), (14, .32),
                       (3, .14), (11, .14)]),
        extra={1: [(14, "ohat", .3)]},
        fill_from=12,
        fill=[(12, "snare", .62), (13, "snare", .24), (12, "hat", .4)],
        snare_kind="brush", swirl=0.5, kick=dict(f0=110, f1=56, tp=0.03, decay=0.17, lp=2600),
        hat=dict(lp=8500, decay=0.036, tune=1.2), lag=dict(snare=0.010), human=0.004),
    sting=dict(pad="A2 E3 G#3 B3 C#4 E4", ep="C#4 E4 G#4 B4", bass="A1",
               chime=["E5", "G#5", "B5", "C#6"], chime_kind="celesta", chime_gap=0.075,
               boom=(62.0, 38.0), crash=0.5, gong=0.0, lift=2.0),
    amb="mushroom", amb_rel=-11.0,
    mix=dict(drums=-19.5, bass=-27.0, pad=-25.5, keys=-22.5, lead=-21.5),
    duck=dict(pad=3.0, keys=2.0, bass=2.5, lead=1.0),
    width=1.25, tape_drive=4.0,
)

PRESETS["02-bedroom-railway"] = dict(
    title="Bedroom Railway",
    seed=2202,
    key="F major (Ionian)",
    mood="sweet, sleepy, toy-box",
    progression="Fmaj9 | Em7 A7 | Dm9 | Gm9 C9sus4 || Fmaj9",
    swing=0.56,
    chords=[
        (0, 16, "A3 C4 E4 G4", "F3 C4 E4 A4"),
        (16, 8, "D4 E4 G4 B4", "E3 B3 D4 G4"),
        (24, 8, "C#4 E4 G4 B4", "E3 A3 C#4 G4"),
        (32, 16, "C4 E4 F4 A4", "D3 A3 C4 F4"),
        (48, 8, "F3 A3 Bb3 D4", "G3 Bb3 D4 F4"),
        (56, 8, "Bb3 D4 F4 G4", "C3 G3 Bb3 D4 F4"),
    ],
    bass=[(0, 7, "F1", .9), (8, 6, "C2", .7), (14, 2, "E2", .5),
          (16, 7, "E2", .9), (24, 7, "A1", .9),
          (32, 7, "D2", .9), (40, 6, "A1", .7), (46, 2, "F1", .5),
          (48, 7, "G1", .9), (56, 6, "C2", .85), (62, 2, "E2", .5)],
    comp=[(0, 7, .55), (8, 6, .45), (16, 6, .55), (24, 6, .5), (32, 7, .55), (40, 6, .45),
          (48, 6, .55), (56, 6, .5)],
    lead=dict(kind="musicbox"),
    melody=[(0, 4, "A5", .7), (4, 2, "C6", .6), (6, 2, "G5", .55), (8, 4, "A5", .65), (12, 4, "E5", .5),
            (16, 2, "G5", .62), (18, 2, "B5", .55), (20, 4, "D6", .6), (24, 2, "C#6", .62), (26, 2, "E6", .5),
            (28, 4, "A5", .55),
            (32, 2, "A5", .65), (34, 2, "F5", .55), (36, 2, "E5", .55), (38, 2, "F5", .5), (40, 4, "C6", .65),
            (44, 4, "A5", .55),
            (48, 2, "Bb5", .62), (50, 2, "A5", .55), (52, 4, "G5", .6), (56, 2, "F5", .55), (58, 2, "G5", .55),
            (60, 4, "D6", .55)],
    ep=dict(index=0.9, sus=0.1, tine=0.5, decay=2.0, bark=0.08, trem_rate=4.5, trem_depth=0.3,
            strum=0.012, lp=6000, chorus=0.35),
    pad=dict(osc="pulse", pw=0.36, voices=2, detune=6, drift=3, cutoff=900, q=0.8, lfo_oct=0.6,
             lfo_period=10.0, env_oct=0.4, env_tau=1.5, attack=0.4, release=0.8, spread=0.5),
    bass_sound=dict(drive=1.4, tau=1.2, sus=0.5, h2=0.2, h3=0.08),
    drums=dict(
        base=dict(kick=[(0, .9), (8, .7)], rim=[(4, .55), (12, .6)],
                  shaker=[(s, (.42, .2, .3, .22)[s % 4]) for s in range(16)]),
        extra={1: [(11, "kick", .45)], 3: []},
        fill_from=12,
        fill=[(12, "rim", .55), (12, "shaker", .4), (13, "shaker", .22)],
        snare_kind="rim", swirl=0.0, kick=dict(f0=100, f1=58, tp=0.03, decay=0.15, lp=2200, click=0.06),
        hat=dict(lp=9000), lag=dict(rim=0.006), human=0.0035),
    sting=dict(pad="F2 C3 E3 G3 A3 C4", ep="A3 C4 E4 G4", bass="F1",
               chime=["F5", "A5", "C6", "E6", "F6"], chime_kind="musicbox", chime_gap=0.085,
               boom=(70.0, 45.0), crash=0.25, gong=0.0, lift=1.5),
    amb="bedroom", amb_rel=-12.0,
    mix=dict(drums=-20.5, bass=-27.5, pad=-25.5, keys=-23.0, lead=-20.5),
    duck=dict(pad=2.5, keys=1.5, bass=2.0, lead=0.0),
    width=1.2, tape_drive=3.5,
)

PRESETS["03-first-snow-village"] = dict(
    title="First Snow Village",
    seed=3303,
    key="Eb major, half-time feel",
    mood="warm and nostalgic",
    progression="Ebmaj9 | G7b13 Cm9 | Abmaj9 | Abm6 Bb13sus || Ebmaj9 (6/9)",
    swing=0.58,
    chords=[
        (0, 16, "G3 Bb3 D4 F4", "Eb3 Bb3 D4 G4"),
        (16, 8, "F3 B3 Eb4 G4", "G3 B3 D4 F4"),
        (24, 8, "Bb3 D4 Eb4 G4", "C3 G3 Bb3 Eb4"),
        (32, 16, "C4 Eb4 G4 Bb4", "Ab2 Eb3 G3 C4"),
        (48, 8, "B3 Eb4 F4 Ab4", "Ab2 Eb3 F3 B3"),
        (56, 8, "Ab3 C4 Eb4 G4", "Bb2 F3 Ab3 Eb4"),
    ],
    bass=[(0, 9, "Eb2", .95), (10, 5, "Bb1", .7),
          (16, 7, "G1", .9), (24, 7, "C2", .9),
          (32, 9, "Ab1", .95), (42, 5, "Eb2", .6),
          (48, 7, "Ab1", .9), (56, 7, "Bb1", .9)],
    comp=[(0, 10, .6), (10, 6, .5), (16, 7, .6), (24, 6, .55), (30, 2, .4), (32, 10, .6), (42, 5, .5),
          (48, 7, .6), (56, 7, .55)],
    lead=dict(kind="vibe", trem_rate=4.8, trem_depth=0.3),
    melody=[(2, 2, "G5", .6), (4, 2, "F5", .55), (6, 2, "Eb5", .55), (8, 4, "Bb4", .65), (14, 2, "D5", .5),
            (16, 4, "F5", .65), (20, 4, "Eb5", .6), (24, 2, "D5", .55), (26, 2, "Eb5", .55), (28, 4, "G5", .62),
            (32, 4, "Bb5", .65), (36, 2, "G5", .55), (38, 2, "Ab5", .5), (40, 6, "Eb5", .6), (46, 2, "C5", .5),
            (48, 4, "B4", .6), (52, 2, "Eb5", .55), (54, 2, "F5", .55), (56, 4, "G5", .6), (60, 3, "F5", .55)],
    ep=dict(index=1.1, sus=0.12, tine=0.6, decay=2.2, bark=0.1, trem_rate=4.0, trem_depth=0.35,
            strum=0.01, lp=6500, chorus=0.4),
    pad=dict(osc="saw", voices=4, detune=14, drift=4, cutoff=800, q=0.9, lfo_oct=0.8, lfo_period=10.0,
             env_oct=0.5, env_tau=1.6, attack=0.6, release=0.9, spread=0.75),
    bass_sound=dict(drive=1.5, tau=1.6, sus=0.6, h2=0.16, h3=0.06),
    drums=dict(
        base=dict(kick=[(0, 1.0), (10, .75)], snare=[(8, .85), (6, .15), (15, .22)],
                  hat=[(0, .35), (2, .22), (4, .32), (6, .22), (8, .35), (10, .22), (12, .32), (14, .24)]),
        extra={1: [(3, "kick", .4)], 3: []},
        fill_from=12,
        fill=[(12, "snare", .42), (13, "snare", .2), (12, "hat", .3)],
        snare_kind="brush", swirl=0.85, kick=dict(f0=105, f1=54, tp=0.035, decay=0.2, lp=2400),
        hat=dict(lp=7500, decay=0.03, tune=1.1), lag=dict(snare=0.008), human=0.004),
    sting=dict(pad="Eb2 Bb2 G3 D4 F4 C5", ep="G3 Bb3 D4 F4", bass="Eb2",
               chime=["Bb5", "D6", "F6", "G6"], chime_kind="glock", chime_gap=0.07,
               boom=(60.0, 38.0), crash=0.45, gong=0.0, lift=2.0),
    amb="snow", amb_rel=-11.5,
    mix=dict(drums=-20.0, bass=-27.0, pad=-24.5, keys=-22.0, lead=-21.0),
    duck=dict(pad=2.5, keys=2.0, bass=2.0, lead=1.0),
    width=1.3, tape_drive=4.5,
)

PRESETS["04-lantern-canal"] = dict(
    title="Lantern Canal",
    seed=4404,
    key="D major pentatonic (D E F# A B)",
    mood="serene, floating",
    progression="D6/9 | Bm11 | G6/9 | A9sus4 || D6/9",
    swing=0.54,
    chords=[
        (0, 16, "F#3 B3 E4 A4", "D3 A3 B3 E4"),
        (16, 16, "A3 D4 E4 F#4", "F#3 A3 D4 E4"),
        (32, 16, "B3 D4 E4 A4", "D3 B3 E4 A4"),
        (48, 16, "G3 B3 D4 E4", "E3 G3 B3 D4"),
    ],
    bass=[(0, 8, "D2", .9), (10, 6, "A1", .65),
          (16, 8, "B1", .9), (26, 6, "F#1", .65),
          (32, 8, "G1", .9), (42, 6, "D2", .65),
          (48, 8, "A1", .9), (58, 6, "E2", .65)],
    comp=[(0, 12, .5), (12, 4, .4), (16, 12, .5), (28, 4, .4), (32, 12, .5), (44, 4, .4),
          (48, 12, .5), (60, 3, .38)],
    lead=dict(kind="pluck", bright=0.55, decay=2.4, damp=0.3, pick=0.13),
    melody=[(0, 2, "F#5", .65), (2, 2, "A5", .55), (4, 4, "B5", .62), (8, 2, "A5", .55), (10, 2, "F#5", .5),
            (12, 4, "E5", .55),
            (18, 2, "D5", .6), (20, 2, "E5", .55), (22, 4, "F#5", .6), (26, 2, "B4", .5), (28, 4, "D5", .55),
            (32, 2, "B5", .62), (34, 2, "A5", .55), (36, 2, "F#5", .55), (38, 2, "E5", .5), (40, 4, "D5", .6),
            (44, 2, "E5", .5), (46, 2, "F#5", .5),
            (48, 6, "E5", .6), (54, 2, "B4", .5), (56, 2, "D5", .55), (58, 2, "E5", .55), (60, 3, "A5", .58)],
    ep=dict(index=0.8, sus=0.1, tine=0.5, decay=2.4, bark=0.08, trem_rate=3.2, trem_depth=0.2,
            strum=0.014, lp=6500, chorus=0.35),
    pad=dict(osc="saw", voices=3, detune=7, drift=3, cutoff=1100, q=0.8, lfo_oct=1.0, lfo_period=5.0,
             env_oct=0.4, env_tau=2.0, attack=0.8, release=1.0, spread=0.8),
    bass_sound=dict(drive=1.3, tau=1.8, sus=0.6, h2=0.14, h3=0.05),
    drums=dict(
        base=dict(kick=[(0, .8), (6, .55)], rim=[(4, .45), (12, .5)],
                  shaker=[(s, (.38, .15)[s % 2]) for s in range(16)]),
        extra={1: [(14, "tom", .35)], 3: []},
        fill_from=12,
        fill=[(12, "rim", .45), (13, "tom", .32), (12, "shaker", .35)],
        snare_kind="rim", swirl=0.0, kick=dict(f0=95, f1=56, tp=0.03, decay=0.17, lp=2000, click=0.05),
        hat=dict(lp=8000), tom_f=118.0, lag=dict(rim=0.006), human=0.004),
    sting=dict(pad="D2 A2 F#3 B3 E4 A4", ep="F#3 B3 E4 A4", bass="D2",
               chime=["A5", "D6", "F#6", "B6"], chime_kind="tube", chime_gap=0.11,
               boom=(58.0, 40.0), crash=0.2, gong=0.0, lift=1.5),
    amb="canal", amb_rel=-11.0,
    mix=dict(drums=-21.0, bass=-27.5, pad=-24.5, keys=-23.5, lead=-20.0),
    duck=dict(pad=2.0, keys=1.5, bass=1.5, lead=0.0),
    width=1.35, tape_drive=3.0,
)

PRESETS["05-moonlit-desert-oasis"] = dict(
    title="Moonlit Desert Oasis",
    seed=5505,
    key="E Dorian with a Phrygian bII cadence",
    mood="mysterious, warm night air",
    progression="Em9 | A9 (Dorian IV) | Em11 | Fmaj7#11 (Phrygian bII) || Em(add9)",
    swing=0.62,
    chords=[
        (0, 16, "G3 B3 D4 F#4", "E3 B3 D4 G4"),
        (16, 16, "G3 B3 C#4 E4", "C#3 G3 B3 E4"),
        (32, 16, "D4 G4 A4 B4", "E3 B3 D4 A4"),
        (48, 16, "A3 B3 C4 E4", "F3 C4 E4 A4"),
    ],
    drone="E2 B2",
    bass=[(0, 5, "E1", .95), (6, 2, "E2", .55), (10, 4, "E1", .85), (14, 2, "B1", .6),
          (16, 5, "A1", .95), (22, 2, "A2", .55), (26, 4, "A1", .85), (30, 2, "E2", .6),
          (32, 5, "E1", .95), (38, 2, "E2", .55), (42, 4, "E1", .85), (46, 2, "D2", .6),
          (48, 5, "F1", .95), (54, 2, "F2", .55), (58, 4, "F1", .85), (62, 2, "C2", .55)],
    comp=per_bar([(0, 6, .6), (6, 2, .45), (10, 6, .55)]),
    lead=dict(kind="pluck", bright=0.42, decay=1.1, damp=0.5, pick=0.12),
    melody=[(0, 2, "B4", .65), (3, 2, "D5", .55), (6, 2, "E5", .6), (8, 3, "F#5", .62), (11, 2, "E5", .5),
            (13, 3, "D5", .55),
            (16, 2, "C#5", .65), (18, 2, "E5", .55), (20, 4, "G5", .6), (24, 2, "F#5", .55), (26, 2, "E5", .5),
            (28, 4, "C#5", .55),
            (32, 2, "B4", .6), (34, 2, "A4", .5), (36, 2, "B4", .55), (38, 2, "D5", .55), (40, 4, "E5", .62),
            (44, 4, "G5", .55),
            (48, 3, "F5", .66), (51, 2, "E5", .55), (53, 3, "C5", .55), (56, 2, "B4", .6), (58, 2, "C5", .55),
            (60, 2, "A4", .5), (62, 2, "F4", .45)],
    ep=dict(index=1.4, sus=0.14, tine=0.8, decay=1.8, bark=0.14, trem_rate=4.2, trem_depth=0.3,
            strum=0.008, lp=6500, chorus=0.3),
    pad=dict(osc="saw", voices=3, detune=10, drift=4, cutoff=600, q=1.3, lfo_oct=1.0, lfo_period=10.0,
             env_oct=0.6, env_tau=1.2, attack=0.4, release=0.7, spread=0.6),
    bass_sound=dict(drive=1.8, tau=1.2, sus=0.55, h2=0.2, h3=0.08),
    drums=dict(
        base=dict(kick=[(0, 1.0), (6, .6), (10, .8)], rim=[(4, .6), (12, .65), (3, .18), (9, .16)],
                  tom=[(14, .45)],
                  hat=[(s, (.5 if s % 4 == 0 else (.38 if s % 2 == 0 else .18))) for s in range(16)]),
        extra={},
        fill_from=12,
        fill=[(12, "rim", .6), (13, "tom", .42), (12, "hat", .4)],
        snare_kind="rim", swirl=0.0, kick=dict(f0=105, f1=52, tp=0.035, decay=0.2, lp=2600, gain=0.38),
        hat=dict(lp=9000, decay=0.032, tune=1.3), tom_f=92.0, lag=dict(rim=0.008), human=0.004),
    sting=dict(pad="E2 B2 G3 B3 F#4", ep="G3 B3 D4 F#4", bass="E1",
               chime=["E5", "B5", "E6", "F#6"], chime_kind="bell", chime_gap=0.09,
               boom=(56.0, 36.0), crash=0.3, gong=0.5, lift=2.0),
    amb="desert", amb_rel=-11.5,
    mix=dict(drums=-19.5, bass=-28.5, pad=-25.5, keys=-22.5, lead=-21.0),
    duck=dict(pad=3.0, keys=2.0, bass=2.5, lead=1.0),
    width=1.3, tape_drive=4.5,
)


# --------------------------------------------------------------------------------------
# arrangement renderers
# --------------------------------------------------------------------------------------

def chord_at(P, step):
    for c in P["chords"]:
        if c[0] <= step < c[0] + c[1]:
            return c
    return P["chords"][-1]


def human(rng, sd):
    return float(np.clip(rng.normal(0, sd), -2.5 * sd, 2.5 * sd))


def render_drums(P, rng):
    D = P["drums"]
    sw = P["swing"]
    ev = []
    for bar in range(4):
        for inst, hits in D["base"].items():
            for s, v in hits:
                if bar == 3 and s >= D["fill_from"]:
                    continue
                ev.append((bar * 16 + s, inst, v))
        for s, inst, v in D.get("extra", {}).get(bar, []):
            if bar == 3 and s >= D["fill_from"]:
                continue
            ev.append((bar * 16 + s, inst, v))
    ev += [(48 + s, inst, v) for s, inst, v in D["fill"]]
    out = np.zeros((N, 2))
    send = np.zeros((N, 2))
    kicks = []
    onsets = []
    snare_fn = brush if D["snare_kind"] == "brush" else rim
    pans = dict(kick=0.0, snare=-0.06, rim=-0.1, hat=0.28, ohat=0.3, shaker=-0.32, tom=-0.18)
    for step, inst, v in ev:
        t0 = step_time(step, sw) + D.get("lag", {}).get(inst, 0.0)
        if step > 0:
            t0 += human(rng, D.get("human", 0.004))
        v = v * float(np.clip(1 + rng.normal(0, 0.07), 0.8, 1.2))
        if inst == "kick":
            y = kick(v, rng, D["kick"]) * D["kick"].get("gain", 0.42)
            kicks.append((t0, min(1.0, v)))
        elif inst == "snare":
            y = snare_fn(v, rng)
        elif inst == "rim":
            y = rim(v, rng)
        elif inst == "hat":
            y = hat(v, rng, D["hat"])
        elif inst == "ohat":
            y = hat(v, rng, D["hat"], open_=True)
        elif inst == "shaker":
            y = shaker(v, rng)
        elif inst == "tom":
            y = tom(v, rng, D.get("tom_f", 100.0))
        else:
            raise ValueError(inst)
        add_at(out, y, t0, pans[inst])
        if inst in ("snare", "rim", "tom"):
            add_at(send, y, t0, pans[inst])
        onsets.append((t0, inst))
    if D.get("swirl", 0) > 0:
        t = np.arange(N) / SR
        nz = filt(rng.standard_normal((N, 2)), "bp", (1800, 6500))
        ph = (t / BEAT) % 1.0
        env = np.sin(np.pi * ph) ** 2 * (0.6 + 0.4 * smooth_rand(N, 1.5, rng))
        env *= 1 - rc_ramp((t - (LOOP_END - 0.3)) / 0.25)
        pan = 0.5 * np.sin(TWO_PI * t / (2 * BEAT))
        gl, gr = panlaw(pan)
        sw_ = nz * (env[:, None] * np.stack([gl, gr], 1))
        out += D["swirl"] * 0.05 * sw_
    out = filt(out, "lp", 11000)
    out = np.tanh(1.7 * out / (np.abs(out).max() + 1e-9)) / np.tanh(1.7)
    return out, send, kicks, onsets


def render_bass(P, rng):
    sw = P["swing"]
    B = P["bass_sound"]
    out = np.zeros(N)
    for s, d, note, v in P["bass"]:
        t0 = step_time(s, sw) + (human(rng, 0.003) if s > 0 else 0.0)
        t1 = min(step_time(s + d, sw), STOP_T)
        dur = max(0.05, t1 - t0 - 0.02)
        add_mono(out, bass_tone(hz(nm(note)), dur, v, B), t0)
    out = filt(filt(out, "lp", 320, 2), "hp", 28, 2)
    return np.stack([out, out], axis=1)


def pad_synth(chord_list, PP, rng, cutoff_fn):
    """chord_list: (t0, t1, voicing, attack, release, decay_tau). Detuned analog voices, slow
    pitch drift, spread across the stereo field, then a 4-pole moving low-pass."""
    raw = np.zeros((N, 2))
    nv = PP["voices"]
    for t0, t1, voicing, att, rel, tau in chord_list:
        n = int((t1 - t0 + rel) * SR) + 2
        env = env_note(n, att, t1 - t0, rel, tau=tau, sus=0.0 if tau else 0.0)
        ms = notes(voicing)
        for j, m in enumerate(ms):
            f = hz(m)
            for v in range(nv):
                det = ((v - (nv - 1) / 2.0) / max(1.0, (nv - 1) / 2.0)) * PP["detune"] + rng.normal(0, 1.5)
                k = int(n / SR * 3) + 3
                drift = np.interp(np.linspace(0, k - 1, n), np.arange(k), rng.normal(0, 1, k)) * PP["drift"]
                fr = f * 2 ** ((det + drift) / 1200.0)
                y = osc(PP["osc"], fr, rng.random(), PP.get("pw", 0.5))
                pan = ((v / max(1, nv - 1)) * 2 - 1) * PP["spread"] if nv > 1 else 0.0
                pan = float(np.clip(pan + 0.15 * rng.normal() + 0.1 * (j - len(ms) / 2) / len(ms), -1, 1))
                add_at(raw, y * env / np.sqrt(nv), t0, pan, 1.0 / np.sqrt(len(ms)))
    fc = cutoff_fn(np.arange(N) / SR)
    return tv_biquad(raw, fc, PP["q"], "lp", 64, stages=2)


def render_pad(P, rng):
    PP = P["pad"]
    sw = P["swing"]
    cl = []
    starts = []
    for i, (s, d, _, pv) in enumerate(P["chords"]):
        t0 = step_time(s, sw)
        t1 = step_time(s + d, sw)
        last = i == len(P["chords"]) - 1
        cl.append((t0, min(t1, 9.72) if last else t1, pv, PP["attack"], 0.22 if last else PP["release"], None))
        starts.append(t0)
    phi = rng.uniform(0, TWO_PI)

    def cutoff(t):
        lfo = np.sin(TWO_PI * t / PP["lfo_period"] + phi)
        ce = np.zeros_like(t)
        for t0 in starts:
            m = t >= t0
            ce[m] = np.maximum(ce[m], (1 - np.exp(-(t[m] - t0) / 0.15)) * np.exp(-(t[m] - t0) / PP["env_tau"]))
        return np.clip(PP["cutoff"] * 2 ** (PP["lfo_oct"] * lfo + PP["env_oct"] * ce), 80, 12000)

    out = pad_synth(cl, PP, rng, cutoff)
    if P.get("drone"):
        dr = pad_synth([(0.0, LOOP_END + 0.5, P["drone"], 1.2, 2.0, None)],
                       dict(PP, voices=2, detune=5, spread=0.3), rng,
                       lambda t: 380 * 2 ** (0.5 * np.sin(TWO_PI * t / 7.0)))
        out += 0.35 * dr
    return filt(out, "hp", 75, 2)


def chord_root(P, c):
    """Left-hand root for a chord: the bass note at (or first after) the chord start, moved
    into the 98-196 Hz octave."""
    cand = [b for b in P["bass"] if c[0] <= b[0] < c[0] + c[1]]
    m = nm((cand[0] if cand else P["bass"][0])[2])
    while hz(m) < 98:
        m += 12
    while hz(m) >= 196:
        m -= 12
    return m


def render_keys(P, rng):
    E = P["ep"]
    sw = P["swing"]
    mono = np.zeros(N)
    for s, d, v in P["comp"]:
        c = chord_at(P, s)
        t0 = step_time(s, sw) + (human(rng, 0.005) if s > 0 else 0.0)
        t1 = step_time(s + d, sw)
        voicing = notes(c[2])
        if E.get("lh", 0.85) > 0 and s == c[0]:
            dur = max(0.06, min(t1 - t0 - 0.03, STOP_T - t0))
            add_mono(mono, ep_tone(hz(chord_root(P, c)), dur, v * E.get("lh", 0.85), rng, E), t0)
        for k, m in enumerate(voicing):
            tk = t0 + k * E["strum"] * (1 + 0.3 * rng.random())
            dur = max(0.06, t1 - tk - 0.03)
            dur = min(dur, STOP_T - tk)
            vk = v * float(np.clip(1 + rng.normal(0, 0.06), 0.8, 1.2)) * (1.08 if k == len(voicing) - 1 else 1.0)
            add_mono(mono, ep_tone(hz(m), dur, vk, rng, E), tk)
    mono = filt(filt(mono, "hp", 85, 2), "lp", E["lp"], 2)
    st = autopan(mono, E["trem_rate"], E["trem_depth"])
    return chorus(st, rng, 0.45, 2.2, 11.0, E["chorus"])


def lead_note(P, f, dur, v, rng):
    L = P["lead"]
    if L["kind"] == "pluck":
        return ks_pluck(f, dur, v, rng, L)
    if L["kind"] == "musicbox":
        y = chime_tone("musicbox", f, v, rng, 3.0)
        return y * 0.6
    if L["kind"] == "vibe":
        return vibe_tone(f, dur, v, rng)
    raise ValueError(L["kind"])


def render_lead(P, rng):
    sw = P["swing"]
    L = P["lead"]
    mono = np.zeros(N)
    for s, d, note, v in P["melody"]:
        t0 = step_time(s, sw) + (human(rng, 0.005) if s > 0 else 0.0)
        t1 = step_time(s + d, sw)
        end = LOOP_END - 0.06 if t0 >= STOP_T - 0.01 else STOP_T + 0.12
        dur = max(0.08, min(t1 - t0 + 0.05, end - t0))
        v = v * float(np.clip(1 + rng.normal(0, 0.06), 0.8, 1.2))
        y = lead_note(P, hz(nm(note)), dur, v, rng)
        if L["kind"] == "musicbox":
            tt = np.arange(len(y)) / SR
            y = y * (1 - rc_ramp((tt - dur) / 0.12))
        add_mono(mono, y, t0)
    mono = filt(mono, "hp", 150, 2)
    if L["kind"] == "vibe":
        st = np.stack([tremolo(mono, L["trem_rate"], L["trem_depth"]),
                       tremolo(mono, L["trem_rate"], L["trem_depth"], 0.9)], axis=1)
    else:
        st = np.stack([mono, mono], axis=1)
    return chorus(st, rng, 0.3, 1.2, 9.0, 0.2)


def render_sting(P, rng, hall_ir):
    S = P["sting"]
    t0 = HIT_T
    sting = np.zeros((N, 2))
    n = int(3.6 * SR)
    t = np.arange(n) / SR
    f0 = S["boom"][0]
    f1 = hz(nm(S["bass"]))          # the boom settles on the root so it never beats against the bass
    while f1 > 58:
        f1 /= 2.0
    f = f1 + (f0 - f1) * np.exp(-t / 0.09)
    boom = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.5) * (1 - np.exp(-t / 0.0025))
    thump = filt(rng.standard_normal(n), "lp", 180) * np.exp(-t / 0.05)
    thump *= 0.5 / (np.abs(thump).max() + 1e-9) * rc_ramp(t / 0.002)
    felt = filt(rng.standard_normal(n), "bp", (140, 2400)) * np.exp(-t / 0.05) * rc_ramp(t / 0.0012)
    felt *= 0.45 / (np.abs(felt).max() + 1e-9)
    impact = tail_fade(boom + thump + felt, 0.2)
    add_at(sting, impact, t0, 0.0, 1.0)
    if S["crash"] > 0:
        cr = filt(rng.standard_normal((n, 2)), "bp", (2500, 9000))
        cr = filt(cr, "lp", 6500) * (rc_ramp(t / 0.004) * np.exp(-t / 1.0))[:, None]
        add_at(sting, tail_fade(cr, 0.2), t0, 0.0, S["crash"] * 0.35)
    if S.get("gong", 0) > 0:
        gp = [(1.0, 1.0, 1.0), (1.52, 0.7, 0.8), (2.07, 0.5, 0.6), (2.68, 0.35, 0.5), (3.41, 0.25, 0.35),
              (4.2, 0.15, 0.25)]
        g = partial_tone(98.0, n, gp, 1.6, rng, 0.4) * rc_ramp(t / 0.012)
        add_at(sting, tail_fade(g, 0.3), t0, 0.0, S["gong"] * 0.35)
    # resolving chord on the electric piano (held, pedal down)
    ep = np.zeros(N)
    for k, m in enumerate(notes(S["ep"])):
        add_mono(ep, ep_tone(hz(m), 2.3 - k * 0.012, 0.72, rng,
                             dict(P["ep"], release=0.5, decay=0.8 * P["ep"]["decay"])), t0 + k * 0.012)
    ep = filt(ep, "hp", 110)
    sting += autopan(ep, P["ep"]["trem_rate"], P["ep"]["trem_depth"] * 0.6) * 0.5
    # pad chord swelling in, decaying into the tail
    PP = P["pad"]
    pad = pad_synth([(t0, 12.3, S["pad"], 0.05, 0.8, 1.05)], PP, rng,
                    lambda tt: np.clip(PP["cutoff"] * 2.2 * 2 ** (-np.maximum(tt - t0, 0) / 2.5), 150, 9000))
    sting += 0.8 * filt(pad, "hp", 90)
    bass = bass_tone(hz(nm(S["bass"])), 1.8, 0.9, dict(P["bass_sound"], tau=0.8, sus=0.0))
    bass = filt(bass, "lp", 320)
    add_at(sting, bass, t0, 0.0, 0.35)
    # chime arpeggio, first note exactly on the hit
    chime = np.zeros((N, 2))
    first = None
    for k, nn in enumerate(S["chime"]):
        y = chime_tone(S["chime_kind"], hz(nm(nn)), 0.85 - 0.06 * k, rng, 3.9 - k * S["chime_gap"], 0.8)
        if first is None:
            first = y
        add_at(chime, y, t0 + k * S["chime_gap"], -0.3 + 0.6 * k / max(1, len(S["chime"]) - 1))
    # reverse-reverb swell into the hit, built from the first chime note
    wet = signal.oaconvolve(np.concatenate([first, np.zeros(int(0.5 * SR))]), hall_ir[:, 0])
    wet = wet[int(0.08 * SR): int(1.48 * SR)]
    rev = wet[::-1].copy()
    k = len(rev)
    tt = np.arange(k) / SR
    rev *= np.exp((tt - tt[-1]) / 0.32) * rc_ramp(tt / 0.3)   # rises about 27 dB/s into the hit
    rev[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
    swell = np.zeros((N, 2))
    add_at(swell, rev, t0 - k / SR, 0.0, 1.0)
    swell = chorus(swell, rng, 0.2, 1.5, 8.0, 0.5)
    return sting, chime, swell


# --------------------------------------------------------------------------------------
# full render
# --------------------------------------------------------------------------------------

def render(slug, seed=None, log=print):
    P = PRESETS[slug]
    seed = P["seed"] if seed is None else int(seed)
    ss = np.random.SeedSequence(seed)
    R = [np.random.default_rng(s) for s in ss.spawn(10)]
    tm = time.time()
    st = {}
    st["drums"], drum_send, kicks, drum_onsets = render_drums(P, R[0])
    st["bass"] = render_bass(P, R[1])
    st["pad"] = render_pad(P, R[2])
    st["keys"] = render_keys(P, R[3])
    st["lead"] = render_lead(P, R[4])
    hall_ir = make_ir(R[5], 3.0, 1.0, 3.8, 0.025, 8000)
    room_ir = make_ir(R[5], 1.6, 0.6, 2.2, 0.012, 9000)
    out_ir = make_ir(R[5], 1.3, 0.5, 2.0, 0.008, 7000)
    sting, chime, swell = render_sting(P, R[6], hall_ir)
    amb = AMBIENCES[P["amb"]](R[7], P, out_ir)
    log(f"  synth {time.time() - tm:.1f}s")

    # level the loop stems by loudness over the cruise
    gains = {}
    for k, target in P["mix"].items():
        L = lufs(st[k][LOOPR])
        gains[k] = 10 ** ((target - L) / 20.0)
        st[k] = st[k] * gains[k]
    drum_send *= gains["drums"]

    # light sidechain from the kick
    du = P["duck"]
    ducked = {k: st[k] * duck_env(kicks, du.get(k, 0.0))[:, None] for k in ("pad", "keys", "bass", "lead")}
    room_in = ducked["keys"] * 0.28 + ducked["lead"] * 0.32 + ducked["pad"] * 0.15 + drum_send * 0.16
    room = reverb(filt(room_in, "hp", 200), room_ir) * duck_env(kicks, du["pad"] * 0.7)[:, None]
    loop = st["drums"] + ducked["pad"] + ducked["keys"] + ducked["bass"] + ducked["lead"] + 0.5 * room
    stems = dict(ducked, drums=st["drums"], room=0.5 * room)

    # stinger level: its loudest 400 ms block sits `lift` dB over the cruise average
    tt, lm, _ = momentary(loop)
    cruise = 10 * np.log10(np.mean(10 ** (lm[(tt > 0.5) & (tt < 9.4)] / 10)))
    grp = sting + 0.55 * chime
    sl = slice(int(HIT_T * SR), int((HIT_T + 1.2) * SR))
    _, sm, _ = momentary(grp[sl])
    g_st = 10 ** ((cruise + P["sting"]["lift"] - sm.max()) / 20.0)
    sting, chime = sting * g_st, chime * g_st
    # the swell's last 60 ms sit about 7 dB under the first 200 ms of the hit
    ih = int(HIT_T * SR)
    hit_rms = rms((sting + 0.55 * chime)[ih:ih + int(0.2 * SR)])
    swell *= 0.45 * hit_rms / (rms(swell[ih - int(0.06 * SR):ih]) + 1e-12)
    hall_in = filt(sting * 0.3 + chime * 0.9 + swell * 0.2 + ducked["lead"] * 0.06 + drum_send * 0.03,
                   "hp", 160)
    hall = reverb(hall_in, hall_ir)
    music = loop + sting + 0.55 * chime + swell + 0.55 * hall

    # tape
    pk = np.abs(music).max()
    music = tape(music * (0.5 / pk), R[8], P["tape_drive"]) * (pk / 0.5)

    # ambience bed under the music
    L_music = lufs(music[LOOPR])
    L_amb = lufs(amb[LOOPR])
    amb = amb * 10 ** ((L_music + P["amb_rel"] - L_amb) / 20.0)
    amb *= (amb_fade() * rc_ramp(np.arange(N) / (0.06 * SR)))[:, None]

    mix = music + amb
    mix = filt(mix, "hp", 20, 4)
    mix = width(mix, P["width"])
    t = np.arange(N) / SR
    fade = rc_ramp(t / 0.005) * (1 - rc_ramp((t - END_FADE[0]) / (END_FADE[1] - END_FADE[0])))
    mix *= fade[:, None]
    music_only = width(filt(music, "hp", 20, 4), P["width"]) * fade[:, None]

    g = 10 ** ((TARGET_LUFS - lufs(mix)) / 20.0)
    for _ in range(8):
        y, grmax, grmean = limiter(mix * g, TP_CEIL)
        L = lufs(y)
        if abs(L - TARGET_LUFS) < 0.015:
            break
        g *= 10 ** ((TARGET_LUFS - L) / 20.0)
    y *= fade[:, None]
    info = dict(lufs=lufs(y), tp=true_peak_db(y), gr_max=grmax, gr_mean=grmean, seed=seed,
                L_music=L_music, L_amb=lufs(amb[LOOPR]), sting_gain_db=20 * np.log10(g_st),
                drum_onsets=drum_onsets, stems=stems, sting=sting + 0.55 * chime + swell, hall=0.55 * hall,
                music=music_only * g, amb=amb * g, render_s=time.time() - tm)
    return y, info


# --------------------------------------------------------------------------------------
# analysis: spectrogram PNG and numeric checks (PIL only used here)
# --------------------------------------------------------------------------------------

def onset_detect(x, hop=96, win=512):
    """Spectral-flux onsets on a mono signal. Returns times (s) corrected by a bias measured
    on a synthetic click track through the same detector."""
    def flux_peaks(sig):
        f, tt, Z = signal.stft(sig, SR, nperseg=win, noverlap=win - hop, boundary=None, padded=False)
        mag = np.log1p(200 * np.abs(Z))
        fl = np.maximum(0, np.diff(mag, axis=1))
        fl = (fl * (f[:, None] > 150)).sum(axis=0)
        times = tt[1:]
        med = signal.medfilt(fl, 2 * int(0.25 * SR / hop / 2) + 1)
        thr = med * 1.6 + 0.18 * np.percentile(fl, 99)
        pk, _ = signal.find_peaks(fl, height=thr, distance=int(0.07 * SR / hop))
        return times[pk], fl[pk]

    rng = np.random.default_rng(0)
    cal = np.zeros(int(4 * SR))
    true_t = np.arange(0.2, 3.8, 0.3) + rng.uniform(0, 0.01, 12)
    for tc in true_t:
        n = int(0.1 * SR)
        tt = np.arange(n) / SR
        add_mono(cal, rng.standard_normal(n) * np.exp(-tt / 0.02) * rc_ramp(tt / 0.001), tc)
    ct, _ = flux_peaks(cal)
    bias = np.median([ct[np.argmin(np.abs(ct - tc))] - tc for tc in true_t])
    pad = int(0.05 * SR)
    t_on, s_on = flux_peaks(np.concatenate([np.zeros(pad), x]))
    return t_on - bias - pad / SR, s_on, bias


def analyze(y, info, P, png=None, log=print):
    out = {}
    mono = y.mean(axis=1)
    # loudness / peaks / dc
    out["lufs"] = lufs(y)
    out["tp"] = true_peak_db(y)
    out["sample_peak"] = float(db(np.abs(y).max()))
    out["dc"] = [float(v) for v in y.mean(axis=0)]
    out["n_frames"] = len(y)
    # onsets of the music bus against the swung 16th grid
    sw = P["swing"]
    grid = np.array([step_time(s, sw) for s in range(64)])
    mus = info["music"].mean(axis=1)
    t_on, s_on, bias = onset_detect(mus)
    sel = (t_on > -0.02) & (t_on < LOOP_END - 0.05)
    dev = np.array([t - grid[np.argmin(np.abs(grid - t))] for t in t_on[sel]])
    out["onset_bias_ms"] = bias * 1000
    out["onsets"] = int(sel.sum())
    out["onset_med_abs_ms"] = float(np.median(np.abs(dev)) * 1000) if len(dev) else None
    out["onset_p90_abs_ms"] = float(np.percentile(np.abs(dev), 90) * 1000) if len(dev) else None
    out["onset_within_20ms"] = float(np.mean(np.abs(dev) < 0.02)) if len(dev) else None
    out["onset_within_20ms_weighted"] = (float(np.sum(s_on[sel] * (np.abs(dev) < 0.02)) / np.sum(s_on[sel]))
                                         if len(dev) else None)
    out["offgrid"] = [(round(float(a), 3), round(float(b) * 1000, 1)) for a, b in zip(t_on[sel], dev)
                      if abs(b) >= 0.02]
    hit = (t_on > HIT_T - 0.03) & (t_on < HIT_T + 0.05)
    out["hit_onset_s"] = float(t_on[hit][np.argmax(s_on[hit])]) if hit.any() else None
    # tail: 50 ms RMS (dBFS) at checkpoints, smoothness (largest rise after 10.4 s)
    w = int(0.05 * SR)
    env = np.sqrt(np.maximum(uniform_filter1d(mono ** 2, w), 0)) + 1e-12
    edb = db(env)
    out["tail_db"] = {f"{tc:.1f}": float(edb[min(N - 1, int(tc * SR))]) for tc in (10.2, 11, 12, 13, 13.5, 13.9)}
    out["last_10ms_peak"] = float(np.abs(y[-int(0.01 * SR):]).max())
    seg = edb[int(10.4 * SR):int(13.9 * SR):int(0.25 * SR)]
    out["tail_max_rise_db"] = float(np.max(np.diff(seg)))
    # clicks: 2nd-difference spikes against their 10 ms neighbourhood (exact moving sums).
    # A lone discontinuity scores near sqrt(480) = 22; noise and drums score 4 to 10.
    def click_ratio(x):
        d2 = np.abs(np.diff(x, 2))
        w = int(0.01 * SR)
        loc = np.sqrt(signal.oaconvolve(d2 ** 2, np.ones(w) / w, mode="same").clip(0))
        ok = loc > 1e-6
        return float(np.max(d2[ok] / loc[ok])) if ok.any() else 0.0
    out["click_ratio_max"] = click_ratio(mus)
    out["click_ratio_tail"] = click_ratio(mono[int(10.3 * SR):int(13.95 * SR)])
    # stereo: L/R correlation over the cruise, side/mid energy ratio
    l, r = y[LOOPR, 0], y[LOOPR, 1]
    out["lr_corr"] = float(np.corrcoef(l, r)[0, 1])
    out["side_mid_db"] = float(10 * np.log10(np.sum((l - r) ** 2) / np.sum((l + r) ** 2)))
    out["dc_dbfs"] = float(db(np.abs(y.mean(axis=0)).max()))
    # spectrum of the cruise in octave bands (dB re total)
    f, pxx = signal.welch(mono[LOOPR], SR, nperseg=8192)
    bands = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    tot = pxx.sum()
    out["octaves_db"] = {str(int(b)): float(10 * np.log10(pxx[(f >= b / 1.414) & (f < b * 1.414)].sum() / tot + 1e-20))
                         for b in bands}
    if png:
        spectrogram_png(y, info, P, t_on[sel | hit], png)
    return out


def spectrogram_png(y, info, P, onsets, path):
    from PIL import Image, ImageDraw
    W, H = 1400, 780
    x0, x1 = 60, 1390
    sy0, sy1 = 20, 520
    ry0, ry1 = 560, 760
    mono = y.mean(axis=1)
    f, t, Z = signal.stft(mono, SR, nperseg=4096, noverlap=4096 - 480)
    mag = 20 * np.log10(np.abs(Z) + 1e-10)
    rows = sy1 - sy0
    fq = np.geomspace(30, 20000, rows)[::-1]
    cols = x1 - x0
    tq = np.linspace(0, DUR, cols)
    ti = np.clip(np.searchsorted(t, tq), 0, len(t) - 1)
    fi = np.clip(np.searchsorted(f, fq), 1, len(f) - 1)
    img = mag[fi][:, ti]
    top = np.percentile(img, 99.7)
    v = np.clip((img - (top - 90)) / 90, 0, 1)
    cps = np.array([[0, 0, 0, 4], [.15, 30, 12, 70], [.35, 100, 20, 110], [.55, 190, 55, 80],
                    [.75, 245, 130, 40], [.9, 250, 210, 90], [1, 252, 252, 220]])
    rgb = np.stack([np.interp(v, cps[:, 0], cps[:, c]) for c in (1, 2, 3)], axis=-1).astype(np.uint8)
    im = Image.new("RGB", (W, H), (12, 12, 16))
    im.paste(Image.fromarray(rgb), (x0, sy0))
    d = ImageDraw.Draw(im)
    px = lambda tt: x0 + tt / DUR * cols
    for b in range(int(DUR / BEAT) + 1):
        tb = b * BEAT
        col = (90, 90, 110) if b % 4 else (160, 160, 190)
        d.line([(px(tb), sy1), (px(tb), sy1 + (10 if b % 4 else 18))], fill=col)
    d.line([(px(HIT_T), sy0), (px(HIT_T), ry1)], fill=(80, 220, 230))
    for hzv in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        yy = sy0 + int(np.interp(np.log(hzv), np.log(fq[::-1]), np.arange(rows)[::-1]))
        d.line([(x0 - 6, yy), (x0, yy)], fill=(160, 160, 160))
        d.text((4, yy - 6), f"{hzv if hzv < 1000 else str(hzv // 1000) + 'k'}", fill=(170, 170, 170))
    # rms strip
    w = int(0.01 * SR)
    env = np.sqrt(np.maximum(uniform_filter1d(mono ** 2, w), 0)) + 1e-12
    edb = db(env)
    d.rectangle([x0, ry0, x1, ry1], outline=(60, 60, 70))
    for lv in (-20, -40, -60):
        yy = ry0 + (-lv) / 80 * (ry1 - ry0)
        d.line([(x0, yy), (x1, yy)], fill=(45, 45, 55))
        d.text((10, yy - 6), f"{lv}", fill=(150, 150, 150))
    pts = []
    for c in range(cols):
        i = min(N - 1, int(tq[c] * SR))
        pts.append((x0 + c, ry0 + np.clip(-edb[i], 0, 80) / 80 * (ry1 - ry0)))
    d.line(pts, fill=(200, 200, 210))
    for to in onsets:
        d.line([(px(to), ry0 - 12), (px(to), ry0 - 2)], fill=(255, 255, 255))
    sw = P["swing"]
    for s in range(64):
        tg = step_time(s, sw)
        d.line([(px(tg), ry0 - 20), (px(tg), ry0 - 14)], fill=(110, 110, 140))
    d.text((x0, 2), f"{P['title']}  |  {P['key']}  |  {P['progression']}", fill=(220, 220, 220))
    im.save(path)


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------

def run_one(slug, out, seed=None, png=None, quiet=False):
    log = (lambda *a: None) if quiet else (lambda *a: print(*a, file=sys.stderr))
    log(f"[{slug}] rendering")
    y, info = render(slug, seed, log)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    write_wav24(out, y, np.random.default_rng(info["seed"] + 99))
    res = analyze(y, info, PRESETS[slug], png, log)
    log(f"[{slug}] {out}  LUFS {res['lufs']:.2f}  TP {res['tp']:.2f} dBTP  "
        f"GR max {info['gr_max']:.2f} dB (mean {info['gr_mean']:.2f})  {info['render_s']:.1f}s")
    return res, info


def main(argv=None):
    ap = argparse.ArgumentParser(description="Procedural soundtrack generator for the POV films.")
    ap.add_argument("--preset", choices=sorted(PRESETS))
    ap.add_argument("--out", help="output WAV path")
    ap.add_argument("--seed", type=int, default=None, help="random seed (default: preset seed)")
    ap.add_argument("--png", nargs="?", const="auto", default=None,
                    help="also write a spectrogram PNG (default: next to the WAV) and print checks")
    ap.add_argument("--all", metavar="DIR", help="render every preset into DIR/<slug>.wav")
    ap.add_argument("--list", action="store_true", help="list presets")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    if a.list:
        for k, P in PRESETS.items():
            print(f"{k:26s} {P['key']:45s} {P['progression']}")
        return 0
    jobs = []
    if a.all:
        for k in PRESETS:
            jobs.append((k, os.path.join(a.all, f"{k}.wav")))
    elif a.preset and a.out:
        jobs.append((a.preset, a.out))
    else:
        ap.error("need --preset and --out, or --all DIR, or --list")
    for slug, out in jobs:
        png = None
        if a.png:
            png = os.path.splitext(out)[0] + ".png" if (a.png == "auto" or a.all) else a.png
        res, info = run_one(slug, out, a.seed, png, a.quiet)
        if a.png:
            res = dict(slug=slug, out=out, gr_max_db=info["gr_max"], gr_mean_db=info["gr_mean"], **res)
            print(json.dumps(res, default=float))
    return 0


if __name__ == "__main__":
    sys.exit(main())
