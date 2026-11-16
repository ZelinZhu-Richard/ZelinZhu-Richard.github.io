#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
The Starsea Line -- complete synthesized soundtrack (original score + sound design).

    workspace/starsea/.venv/bin/python workspace/starsea/audio/score.py
        [--events PATH]   timing sheet (default: audio/events.json, written with defaults if missing)
        [--out PATH]      output WAV  (default: out/audio.wav)
        [--report]        print per-shot RMS levels of every bus (mix calibration)

Output: 48 kHz, 16-bit, stereo WAV, exactly `duration` seconds long (default 72.0).
Only numpy and scipy are used.  Every sound is synthesized here: no samples.

MUSIC  An original waltz in 3/4.  D major, lifting to E major the moment the wheels
       leave the water.  The score is written in bars and beats; bars are pinned to the
       picture by events.json["music"]["anchors"] (values may reference other events,
       e.g. "@whistles.grand.t"), and a smooth monotone tempo map is fitted through them.
       Retime the picture -> edit events.json -> re-run, and the music follows.

SOUND  Steam whistle (3-chime chord, breathy onset, pitch rise, vibrato), physically
       timed steam chuffs (beats/s = 4 v / (pi * 1.9)), rail-joint clickety-clack
       (every 12.5 m, front + rear bogie), coasting steam hiss and pass-by air, fish
       splashes tuned to the harmony, meteor swishes, calm ocean and a starry shimmer.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import os
import re
import sys
import time
from functools import lru_cache

import numpy as np
from scipy import fft as sfft
from scipy import signal
from scipy.interpolate import PchipInterpolator
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, uniform_filter1d

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)                      # workspace/starsea
DEFAULT_EVENTS_PATH = os.path.join(HERE, "events.json")
DEFAULT_OUT = os.path.join(PROJECT, "out", "audio.wav")

# =============================================================================
# Default timing sheet (written to events.json when it does not exist)
# =============================================================================

DEFAULT_EVENTS = {
    "_readme": [
        "Timing sheet for audio/score.py. All times are seconds from picture start.",
        "Edit, then re-run: workspace/starsea/.venv/bin/python workspace/starsea/audio/score.py",
        "Any key you delete falls back to the built-in default; set \"enabled\": false to drop a whistle.",
        "Any number may instead be a reference \"@path.to.value\" with optional +/- offset, e.g.",
        "\"@shots.S6.0\" (start of S6) or \"@train.wheels_leave_water+0.5\".",
        "Keyframe lists are [[time, value], ...] and are linearly interpolated (held flat outside).",
        "music.anchors pins score bars (3/4, bar 0 = first bar) to times; most are references to shots",
        "and events, so moving a cut / the grand whistle / wheels_leave_water moves the music with it.",
        "Anchor times must increase with bar number. Bar 17 = held chord under the grand whistle,",
        "bar 21 = lift-off / key change to E major, bar 22 = climax peak, bar 23 = resolution.",
        "train.distance_m drives chuff level, air-absorption low-pass and reverb amount; train.pan drives",
        "stereo position (-1 left .. +1 right). rails.gain_db is the clickety-clack level in dB.",
    ],
    "seed": 1717,
    "duration": 72.0,
    "fade_out_start": 68.8,
    "fade_out_end": 71.5,
    "shots": {
        "S1": [0.0, 8.0], "S2": [8.0, 13.5], "S3": [13.5, 21.0], "S4": [21.0, 28.0],
        "S5": [28.0, 34.0], "S6": [34.0, 38.0], "S7": [38.0, 45.0], "S8": [45.0, 49.0],
        "S9": [49.0, 54.0], "S10": [54.0, 62.0], "S11": [62.0, 72.0],
    },
    "whistle_chord": ["F#4", "A4", "D5"],
    "whistles": {
        "distant": {"t": 10.0, "dur": 1.9, "gain_db": -14.0, "distance_m": 3200, "pan": -0.35, "transpose": 0},
        "second":  {"t": 18.5, "dur": 1.7, "gain_db": -8.0, "distance_m": 1300, "pan": -0.4, "transpose": 0},
        "grand":   {"t": 45.6, "dur": 2.6, "gain_db": -2.0, "distance_m": 22, "pan": 0.05, "transpose": 0},
        "final":   {"t": 64.5, "dur": 1.8, "gain_db": -15.0, "distance_m": 2600, "pan": 0.2, "transpose": 2},
    },
    "train": {
        "wheel_diameter_m": 1.9,
        "beats_per_rev": 4,
        "speed_profile_mps": [[0, 12], [28, 12], [34, 12], [38, 18], [45, 28], [54, 30], [72, 30]],
        "chuff_windows": [[14.0, 28.0], [34.0, 62.0]],
        "chuff_level": [[14.0, 1.0], [27.6, 1.0], [28.0, 0.0], [34.0, 0.0], [34.6, 1.0],
                        ["@train.wheels_leave_water", 1.0], [62.0, 0.0]],
        "chuff_strength_pattern": [1.0, 0.85, 0.95, 0.8],
        "chuff_timing_jitter": 0.035,
        "chuff_gain_db": 0.0,
        "heavy": [[53.5, 0.0], [54.5, 1.0], [72.0, 1.0]],
        "thin_out": [["@train.wheels_leave_water", 0.0], [62.0, 0.7]],
        "wheels_leave_water": 56.0,
        "distance_m": [[0, 4000], [10, 3400], [14, 2600], [18.5, 1400], [21, 700], [24.5, 250], [28, 55],
                       [31, 9], [33.9, 30], [34.1, 12], [38, 18], [45, 26], [49, 32], [54, 40], [56, 55],
                       [59, 170], [62, 550], [72, 3000]],
        "pan": [[0, -0.3], [21, -0.4], [28, -0.85], [31, 0.0], [33.9, 0.85], [34.1, 0.12], [38, 0.0], [72, 0.0]],
    },
    "rails": {
        "start": 21.0,
        "end": "@train.wheels_leave_water",
        "fade_out_s": 0.3,
        "joint_spacing_m": 12.5,
        "bogie_spacing_m": 14.0,
        "gain_db": [[21, -24], [25, -15], [28, -5], [31, 0], [34, -4], [38, -8], [45, -11], [54, -13], [56, -13]],
        "pan": [[21, -0.4], [28, -0.85], [31, 0.0], [33.9, 0.85], [34.1, 0.1], [38, 0.0], [56, 0.0]],
    },
    "coast_hiss": {
        "start": 27.5,
        "end": 35.5,
        "gain_db": [[27.5, -40], [28.2, -16], [31, -4], [33.9, -9], [34.6, -24], [35.5, -60]],
        "pass_by_t": 31.0,
        "pass_by_gain_db": -4.0,
    },
    "fish_splashes": [{"t": 40.4, "pan": -0.45}, {"t": 42.1, "pan": 0.5}, {"t": 43.5, "pan": 0.12}],
    "meteors": [
        {"t": 39.2, "pan_from": -0.7, "pan_to": 0.3},
        {"t": 41.0, "pan_from": 0.65, "pan_to": -0.2},
        {"t": 44.2, "pan_from": -0.3, "pan_to": 0.75},
    ],
    "ambience": {"ocean_db": 0.0, "shimmer_db": 0.0, "duck_db": 9.0},
    "music": {
        "beats_per_bar": 3,
        "anchors": [
            [0, 2.6],
            [4, "@shots.S3.0"],
            [12, "@shots.S6.0"],
            [17, "@whistles.grand.t"],
            [18, "@whistles.grand.t+3.4"],
            [21, "@train.wheels_leave_water"],
            [23, "@shots.S11.0"],
            [24, "@shots.S11.0+2.6"],
            [25, "@shots.S11.0+5.2"],
            [26, "@fade_out_end-0.4"],
        ],
        "duck_under_grand_whistle_db": 3.5,
    },
    "mix": {"music_db": 0.0, "sfx_db": 0.0, "whistle_db": 0.0, "ambience_db": 0.0,
            "limiter_db": 3.0, "peak_dbfs": -1.0},
}

# =============================================================================
# Small utilities
# =============================================================================

NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_of(name: str) -> int:
    s = name.strip()
    pc = NOTE_PC[s[0].upper()]
    i = 1
    while i < len(s) and s[i] in "#b":
        pc += 1 if s[i] == "#" else -1
        i += 1
    return 12 * (int(s[i:]) + 1) + pc


def hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69.0) / 12.0)


def nhz(name: str) -> float:
    return hz(midi_of(name))


def db(x: float) -> float:
    return 10.0 ** (x / 20.0)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def pan_gains(p):
    a = (np.clip(p, -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    return np.cos(a), np.sin(a)


def interp_kf(kf, t):
    a = np.asarray(kf, dtype=float)
    return np.interp(t, a[:, 0], a[:, 1])


def smooth_noise(n, rate_hz, rng, sr=SR):
    """Slowly varying random curve with unit-ish variance (linear interpolation of knots)."""
    k = int(n * rate_hz / sr) + 3
    knots = rng.standard_normal(k)
    return np.interp(np.arange(n) * (rate_hz / sr), np.arange(k), knots)


@lru_cache(maxsize=8192)
def _butter(order, f1, f2, kind):
    nyq = 0.5 * SR
    if kind == "band":
        lo = min(max(f1, 10.0), nyq * 0.95)
        hi = min(max(f2, lo * 1.05), nyq * 0.97)
        return signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    f = min(max(f1, 10.0), nyq * 0.97)
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def butter_sos(order, f, kind):
    if kind == "band":
        return _butter(order, float(round(f[0])), float(round(f[1])), "band")
    return _butter(order, float(round(f)), 0.0, kind)


def filt(x, order, f, kind):
    return signal.sosfilt(butter_sos(order, f, kind), x, axis=-1)


def peaking_sos(f0, gain_db, q):
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    b = np.array([1 + al * A, -2 * c, 1 - al * A])
    a = np.array([1 + al / A, -2 * c, 1 - al / A])
    return np.hstack([b / a[0], a / a[0]])[None, :]


def highshelf_sos(f0, gain_db, s=0.8):
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * f0 / SR
    c, sn = np.cos(w0), np.sin(w0)
    al = sn / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    sa = 2 * np.sqrt(A) * al
    b0 = A * ((A + 1) + (A - 1) * c + sa)
    b1 = -2 * A * ((A - 1) + (A + 1) * c)
    b2 = A * ((A + 1) + (A - 1) * c - sa)
    a0 = (A + 1) - (A - 1) * c + sa
    a1 = 2 * ((A - 1) - (A + 1) * c)
    a2 = (A + 1) - (A - 1) * c - sa
    return np.array([[b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0]])


def end_fade(x, ms=4.0):
    k = min(int(ms * 1e-3 * SR), x.shape[-1])
    if k > 1:
        x[..., -k:] *= np.linspace(1.0, 0.0, k)
    return x


# =============================================================================
# Mixer
# =============================================================================


class Mixer:
    def __init__(self, n):
        self.n = n
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n), dtype=np.float32)
        return self.buses[name]

    def add(self, name, sig, t0, pan=0.0, gain=1.0):
        """Add mono (pan law) or stereo (balance) signal starting at time t0 (s)."""
        if gain == 0.0:
            return
        sig = np.asarray(sig)
        if sig.ndim == 1:
            if np.ndim(pan) == 0:
                gl, gr = pan_gains(pan)
                st = (sig * gl, sig * gr)
            else:  # per-sample pan curve
                gl, gr = pan_gains(pan)
                st = (sig * gl, sig * gr)
        else:
            if np.ndim(pan) == 0 and pan != 0.0:
                bl, br = min(1.0, 1.0 - pan), min(1.0, 1.0 + pan)
                st = (sig[0] * bl, sig[1] * br)
            else:
                st = (sig[0], sig[1])
        i0 = int(round(t0 * SR))
        s0 = 0
        if i0 < 0:
            s0, i0 = -i0, 0
        m = min(len(st[0]) - s0, self.n - i0)
        if m <= 0:
            return
        b = self.bus(name)
        b[0, i0:i0 + m] += (gain * st[0][s0:s0 + m]).astype(np.float32)
        b[1, i0:i0 + m] += (gain * st[1][s0:s0 + m]).astype(np.float32)


# =============================================================================
# Oscillators / instruments
# =============================================================================


def blep_saw(phase, dt):
    """Band-limited sawtooth via polyBLEP. phase in [0,1), dt = f/SR per sample."""
    y = 2.0 * phase - 1.0
    m = phase < dt
    x = phase[m] / dt[m]
    y[m] -= x + x - x * x - 1.0
    m = phase > 1.0 - dt
    x = (phase[m] - 1.0) / dt[m]
    y[m] -= x * x + x + x + 1.0
    return y


def string_note(f0, dur, vel, rng, voices=5, detune=8.0, attack=0.4, release=1.0,
                vib_depth=9.0, vib_rate=5.3, vib_delay=0.4, cutoff=2400.0,
                width=0.6, pan=0.0, swell=None):
    """Bowed-string section: detuned polyBLEP saws, vibrato, drift, low-pass. Stereo."""
    n_on = max(int(dur * SR), 1)
    n = n_on + int(release * SR) + 1
    t = np.arange(n) / SR
    env = np.ones(n)
    na = max(int(attack * SR), 16)
    k = min(na, n)
    env[:k] = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / na)
    if swell is not None:
        pts = np.asarray(swell, float)
        env[:n_on] *= np.interp(np.linspace(0, 1, n_on), np.linspace(0, 1, len(pts)), pts)
        env[n_on:] *= pts[-1]
    env[n_on:] *= np.exp(-(t[n_on:] - t[n_on]) / (release / 5.0))
    end_fade(env, 3.0)
    ve = np.clip((t - vib_delay) / 0.7, 0.0, 1.0)
    L = np.zeros(n)
    R = np.zeros(n)
    for v in range(voices):
        sp = (2.0 * v / (voices - 1) - 1.0) if voices > 1 else 0.0
        cents = detune * sp + rng.normal(0, 1.2)
        cents = cents + vib_depth * rng.uniform(0.75, 1.2) * ve * np.sin(
            2 * np.pi * vib_rate * rng.uniform(0.9, 1.1) * t + rng.uniform(0, 2 * np.pi))
        cents += 2.5 * smooth_noise(n, 1.3, rng)
        f = f0 * np.exp2(cents / 1200.0)
        dt = f / SR
        ph = (np.cumsum(dt) + rng.random()) % 1.0
        s = blep_saw(ph, dt) * (1.0 + 0.07 * smooth_noise(n, 2.5, rng))
        gl, gr = pan_gains(pan + 0.5 * width * sp + rng.normal(0, 0.04))
        L += gl * s
        R += gr * s
    amp = vel ** 1.25 / math.sqrt(voices)
    out = np.vstack([L, R]) * (env * amp)
    fc = cutoff * (0.5 + 0.7 * vel) + 1.5 * f0
    out = filt(out, 2, fc, "low")
    out = filt(out, 2, min(fc * 1.7, 0.45 * SR), "low")
    return out


def pluck_note(f0, vel, rng, tau0=None, bright=0.5, pos=0.27, nmax=18, fmax=8500.0, length=None):
    """Harp / pizzicato: additive plucked string with partial-dependent decay. Mono."""
    if tau0 is None:
        tau0 = float(np.clip(2.6 * (261.6 / f0) ** 0.55, 0.5, 6.0))
    L = length if length is not None else 6.5 * tau0
    n = int(L * SR) + 1
    t = np.arange(n) / SR
    out = np.zeros(n)
    norm = 0.0
    N = max(1, min(nmax, int(fmax / f0)))
    fc = 1800 + 3500 * bright
    for k in range(1, N + 1):
        fk = f0 * k * (1 + 0.00015 * k * k)
        a = abs(math.sin(math.pi * k * pos)) / k ** (1.35 - 0.45 * bright) / (1 + (fk / fc) ** 2)
        tk = tau0 / (1 + 0.32 * (k - 1) + fk / 3200.0)
        nk = min(n, int(7.0 * tk * SR) + 1)
        tt = t[:nk]
        seg = a * np.exp(-tt / tk) * np.sin(2 * np.pi * fk * tt)
        end_fade(seg, 2.0)
        out[:nk] += seg
        norm += a * a
    out /= math.sqrt(norm) + 1e-12
    na = int(0.002 * SR)
    out[:na] *= np.linspace(0, 1, na)
    # finger noise
    m = int(0.012 * SR)
    nz = filt(rng.standard_normal(m), 2, (700, 4000), "band") * np.exp(-np.arange(m) / (0.0025 * SR))
    out[:m] += 0.05 * bright * nz
    return out * vel ** 1.4


def piano_note(f0, dur, vel, rng):
    """Felt-warm piano: inharmonic partials, two-stage decay, unison beating, damper. Mono."""
    midi = 69 + 12 * math.log2(f0 / 440.0)
    B = 3.5e-4 * 2 ** ((midi - 60) / 18.0)
    tau_s = float(np.clip(8.0 * (110.0 / f0) ** 0.7, 0.7, 12.0))
    hard = 0.3 + 0.7 * vel
    fc = 900 + 4000 * hard ** 1.5
    damp_t = 0.14 if midi < 88 else 0.6
    length = max(min(dur + 6 * damp_t, 6.5 * tau_s + 0.05), 0.08)
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    x0 = 0.12 + rng.uniform(-0.012, 0.012)
    norm = 0.0
    k = 1
    while k <= 32:
        fk = k * f0 * math.sqrt(1 + B * k * k)
        if fk > 9500:
            break
        a = abs(math.sin(math.pi * k * x0)) / k ** (0.9 + 0.8 * (1 - hard)) / (1 + (fk / fc) ** 2)
        ts = tau_s / (1 + 0.11 * (k - 1) + (fk / 2800.0) ** 1.4)
        tf = 0.15 * ts
        nk = min(n, int(7.0 * ts * SR) + 1)
        tt = t[:nk]
        df = fk * rng.uniform(1.5e-4, 6e-4)
        env = 0.6 * np.exp(-tt / tf) + 0.4 * np.exp(-tt / ts)
        env *= 0.8 + 0.2 * np.cos(2 * np.pi * df * tt + rng.uniform(0, 2 * np.pi))
        seg = a * env * np.sin(2 * np.pi * fk * tt)
        end_fade(seg, 2.0)
        out[:nk] += seg
        norm += a * a
        k += 1
    out /= math.sqrt(norm) + 1e-12
    na = int(0.0015 * SR)
    out[:na] *= np.linspace(0, 1, na)
    m = int(0.02 * SR)
    knock = filt(rng.standard_normal(m), 2, (250, 1200 + 2500 * hard), "band")
    out[:m] += 0.035 * hard * knock * np.exp(-np.arange(m) / (0.004 * SR))
    if dur < length:
        i = int(dur * SR)
        out[i:] *= np.exp(-(t[i:] - t[i]) / damp_t)
    end_fade(out, 3.0)
    return out * vel ** 1.5


CELESTA_PARTIALS = [(1.0, 1.0, 1.0), (2.0, 0.20, 0.42), (3.0, 0.07, 0.28), (4.0, 0.09, 0.20), (5.97, 0.03, 0.12)]
GLOCK_PARTIALS = [(1.0, 1.0, 1.0), (2.756, 0.26, 0.35), (5.404, 0.09, 0.16), (8.933, 0.035, 0.08)]


def bell_note(f0, vel, rng, partials, tau, tick=0.03):
    n = int(6.0 * tau * SR) + 1
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, dec in partials:
        fk = f0 * ratio * (1 + rng.normal(0, 0.0004))
        if fk > 0.45 * SR:
            continue
        tk = tau * dec
        nk = min(n, int(7.0 * tk * SR) + 1)
        tt = t[:nk]
        seg = amp * np.exp(-tt / tk) * np.sin(2 * np.pi * fk * tt)
        end_fade(seg, 2.0)
        out[:nk] += seg
    na = int(0.0012 * SR)
    out[:na] *= np.linspace(0, 1, na)
    m = int(0.006 * SR)
    out[:m] += tick * filt(rng.standard_normal(m), 2, 3000, "high") * np.exp(-np.arange(m) / (0.0012 * SR))
    return out * vel ** 1.3


def celesta_note(f0, vel, rng):
    tau = float(np.clip(1.4 * (1047.0 / f0) ** 0.5, 0.5, 2.6))
    return bell_note(f0, vel, rng, CELESTA_PARTIALS, tau, tick=0.02)


def glock_note(f0, vel, rng):
    tau = float(np.clip(2.0 * (2093.0 / f0) ** 0.3, 0.8, 3.2))
    return bell_note(f0, vel, rng, GLOCK_PARTIALS, tau, tick=0.04)


def brass_note(f0, dur, vel, rng, players=2, attack=0.22, release=0.45, dark=0.9,
               swell=None, pan=0.0, width=0.3):
    """Soft horn section: additive with level-dependent spectral bloom. Stereo."""
    n_on = max(int(dur * SR), 1)
    n = n_on + int(release * SR) + 1
    t = np.arange(n) / SR
    env = np.ones(n)
    na = max(int(attack * SR), 16)
    k = min(na, n)
    env[:k] = smoothstep(np.arange(k) / na)
    if swell is not None:
        pts = np.asarray(swell, float)
        env[:n_on] *= np.interp(np.linspace(0, 1, n_on), np.linspace(0, 1, len(pts)), pts)
        env[n_on:] *= pts[-1]
    env[n_on:] *= np.exp(-(t[n_on:] - t[n_on]) / (release / 5.0))
    end_fade(env, 3.0)
    level = np.clip(env * (0.35 + 0.65 * vel), 1e-5, 1.0)
    loglev = np.log(level)
    N = max(2, min(16, int(4800.0 / f0)))
    out = np.zeros((2, n))
    ve = np.clip((t - 0.45) / 0.6, 0, 1)
    for p in range(players):
        sp = (2.0 * p / (players - 1) - 1.0) if players > 1 else 0.0
        cents = (sp * 5.0 + rng.normal(0, 1.5) - 22.0 * np.exp(-t / 0.05)
                 + 5.0 * ve * np.sin(2 * np.pi * rng.uniform(4.3, 5.0) * t + rng.uniform(0, 6.3))
                 + 2.0 * smooth_noise(n, 1.5, rng))
        ph = 2 * np.pi * np.cumsum(f0 * np.exp2(cents / 1200.0)) / SR + rng.uniform(0, 6.3)
        s = np.zeros(n)
        for h in range(1, N + 1):
            w = h ** -1.15 * np.exp(loglev * (dark * 0.55 * (h - 1)))
            s += w * np.sin(h * ph)
        gl, gr = pan_gains(pan + 0.5 * width * sp)
        out[0] += gl * s
        out[1] += gr * s
    out *= env * vel / players
    out = filt(out, 2, 4200, "low")
    return out


def timpani_hit(f0, vel, rng, length=3.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    glide = 1 + 0.022 * vel * np.exp(-t / 0.06)
    base = 2 * np.pi * np.cumsum(f0 * glide) / SR
    modes = [(1.0, 1.0, 1.0), (1.504, 0.5, 0.55), (1.742, 0.28, 0.4), (2.0, 0.3, 0.45),
             (2.245, 0.16, 0.3), (2.494, 0.1, 0.25), (2.8, 0.07, 0.2)]
    tau = 0.8 + 0.5 * vel
    out = np.zeros(n)
    for r, a, d in modes:
        out += a * np.exp(-t / (tau * d)) * np.sin(r * base + rng.uniform(0, 0.4))
    out += 0.4 * np.sin(2 * np.pi * 0.62 * f0 * t) * np.exp(-t / 0.12)
    m = int(0.05 * SR)
    out[:m] += 0.5 * filt(rng.standard_normal(m), 2, 900 + 900 * vel, "low") * np.exp(-np.arange(m) / (0.012 * SR))
    na = int(0.002 * SR)
    out[:na] *= np.linspace(0, 1, na)
    out = filt(out, 2, 2500 + 1500 * vel, "low")
    end_fade(out, 20.0)
    return out * vel ** 1.3


def bass_drum(vel, rng):
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    f = 46 + 28 * np.exp(-t / 0.05)
    out = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    m = int(0.2 * SR)
    out[:m] += 0.4 * filt(rng.standard_normal(m), 2, 320, "low") * np.exp(-np.arange(m) / (0.05 * SR))
    na = int(0.004 * SR)
    out[:na] *= np.linspace(0, 1, na)
    end_fade(out, 30.0)
    return out * vel ** 1.3


def sine_grain(f, dur, att, rng, trem=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = smoothstep(t / att) * np.exp(-t / (dur / 5.0))
    s = np.sin(2 * np.pi * f * t + rng.uniform(0, 6.3))
    if trem > 0:
        s *= 1 - 0.35 + 0.35 * np.sin(2 * np.pi * trem * t + rng.uniform(0, 6.3))
    return end_fade(s * env, 5.0)


# =============================================================================
# Reverb (synthetic stereo impulse responses, FFT convolution)
# =============================================================================


def make_ir(rng, t60, length, predelay, hf_damp=0.5, lf_boost=1.15, cross=0.75):
    n = int(length * SR)
    t = np.arange(n) / SR
    edges = [20, 200, 600, 1600, 4000, 9000, 22000]
    mult = [lf_boost, 1.05, 1.0, 1.0 - 0.25 * hf_damp, 1.0 - 0.5 * hf_damp, 1.0 - 0.72 * hf_damp]
    irs = []
    pd = int(predelay * SR)
    for ch in range(4):  # LL, LR, RL, RR
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for (lo, hi), m in zip(zip(edges[:-1], edges[1:]), mult):
            band = filt(noise, 3, (lo, hi), "band")
            acc += band * np.exp(-6.9078 * t / (t60 * m))
        acc *= 1.0 - np.exp(-t / 0.03)
        acc = np.concatenate([np.zeros(pd), acc])[:n]
        end_fade(acc, 200.0)
        irs.append(acc)
    for i in (0, 3):
        irs[i] /= np.sqrt(np.sum(irs[i] ** 2))
    for i in (1, 2):
        irs[i] *= cross / np.sqrt(np.sum(irs[i] ** 2))
    return irs


def convolve_stereo(x, irs):
    n = x.shape[1]
    m = len(irs[0])
    L = sfft.next_fast_len(n + m - 1, real=True)
    XL = sfft.rfft(x[0].astype(np.float32), L)
    XR = sfft.rfft(x[1].astype(np.float32), L)
    H = [sfft.rfft(h.astype(np.float32), L) for h in irs]
    yL = sfft.irfft(XL * H[0] + XR * H[2], L)[:n]
    yR = sfft.irfft(XL * H[1] + XR * H[3], L)[:n]
    return np.vstack([yL, yR]).astype(np.float32)


def spectral_noise(mag, rng, nfft, hop, n_out):
    """Random-phase overlap-add noise; mag[k] = magnitude spectrum of the frame centred at k*hop."""
    nfr = mag.shape[0]
    win = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(nfft) / nfft)).astype(np.float32)
    ph = rng.random(mag.shape, dtype=np.float32) * np.float32(2 * np.pi)
    spec = (mag.astype(np.float32) * np.exp(1j * ph)).astype(np.complex64)
    frames = sfft.irfft(spec, n=nfft, axis=1).astype(np.float32)
    frames *= win
    buf = np.zeros(nfr * hop + nfft, dtype=np.float32)
    g = nfft // hop
    for r in range(g):
        flat = frames[r::g].reshape(-1)
        buf[r * hop:r * hop + flat.size] += flat
    out = buf[nfft // 2:nfft // 2 + n_out]
    if out.size < n_out:
        out = np.concatenate([out, np.zeros(n_out - out.size, np.float32)])
    return out * np.float32(np.sqrt(nfft / 1.5))


# =============================================================================
# Events / tempo map
# =============================================================================

REF_RE = re.compile(r"^@([A-Za-z0-9_.]+)\s*(?:([+-])\s*([0-9]*\.?[0-9]+))?$")


def resolve(ev, v, depth=0):
    if isinstance(v, (int, float)):
        return float(v)
    if depth > 8:
        raise ValueError("reference loop at %r" % v)
    m = REF_RE.match(str(v).strip())
    if not m:
        raise ValueError("cannot parse time value %r (use a number or '@path.to.value+offset')" % v)
    node = ev
    for key in m.group(1).split("."):
        node = node[int(key)] if isinstance(node, list) else node[key]
    val = resolve(ev, node, depth + 1)
    if m.group(2):
        val += float(m.group(3)) * (1.0 if m.group(2) == "+" else -1.0)
    return val


class TempoMap:
    """Beat -> time map through bar anchors.

    Each span between anchors keeps a steady tempo; tempo changes are eased over about one
    beat either side of an anchor (monotone PCHIP through the anchors plus interior knots),
    which reads as a natural ritardando / a tempo rather than a jump.
    """

    def __init__(self, anchors, bpb):
        self.bpb = bpb
        b = np.array([a[0] * bpb for a in anchors], float)
        t = np.array([a[1] for a in anchors], float)
        if np.any(np.diff(b) <= 0) or np.any(np.diff(t) <= 0):
            raise ValueError("music anchors must increase in both bar and time: %s" % list(zip(b / bpb, t)))
        kb, kt = [b[0]], [t[0]]
        for i in range(len(b) - 1):
            gap = b[i + 1] - b[i]
            slope = (t[i + 1] - t[i]) / gap
            if gap > 2.2:
                for off in (1.0, gap - 1.0):
                    kb.append(b[i] + off)
                    kt.append(t[i] + off * slope)
            kb.append(b[i + 1])
            kt.append(t[i + 1])
        self.b, self.t = b, t
        self.f = PchipInterpolator(np.array(kb), np.array(kt), extrapolate=False)
        self.s0 = (t[1] - t[0]) / (b[1] - b[0])
        self.s1 = (t[-1] - t[-2]) / (b[-1] - b[-2])

    def beat_time(self, beat):
        if beat <= self.b[0]:
            return float(self.t[0] + (beat - self.b[0]) * self.s0)
        if beat >= self.b[-1]:
            return float(self.t[-1] + (beat - self.b[-1]) * self.s1)
        return float(self.f(beat))

    def at(self, bar, beat=1.0):
        return self.beat_time(bar * self.bpb + beat - 1.0)


def deep_merge(base, over):
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = deep_merge(base[k], v) if k in base else v
        return out
    return copy.deepcopy(over)


def to_json(obj, ind=0):
    """Readable JSON: short scalar lists / keyframe lists on one line."""
    pad = "  " * ind

    def scalar_list(o):
        return isinstance(o, list) and all(not isinstance(e, (dict, list)) for e in o)

    if isinstance(obj, dict):
        if all(not isinstance(v, (dict, list)) for v in obj.values()) and len(json.dumps(obj)) < 110:
            return pad + json.dumps(obj)
        items = []
        for k, v in obj.items():
            items.append(pad + "  " + json.dumps(k) + ": " + to_json(v, ind + 1).lstrip())
        return pad + "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(obj, list):
        if scalar_list(obj) and not all(isinstance(e, str) and len(e) > 30 for e in obj):
            return pad + json.dumps(obj)
        if all(scalar_list(e) for e in obj) and len(json.dumps(obj)) < 110:
            return pad + "[" + ", ".join(json.dumps(e) for e in obj) + "]"
        inner = ",\n".join(to_json(e, ind + 1) for e in obj)
        return pad + "[\n" + inner + "\n" + pad + "]"
    return pad + json.dumps(obj)


def resolve_all(ev):
    """Replace every "@path.to.value[+/-offset]" string anywhere in the sheet by its number."""
    def walk(node):
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        if isinstance(node, str) and node.strip().startswith("@"):
            return resolve(ev, node)
        return node
    return walk(ev)


def load_events(path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(to_json(DEFAULT_EVENTS) + "\n")
        print("wrote default timing sheet:", path)
    with open(path) as fh:
        user = json.load(fh)
    return resolve_all(deep_merge(DEFAULT_EVENTS, user))


# =============================================================================
# THE SCORE  (original composition; 3/4; bars 0-based, beats 1-based)
#   bars 0-3   intro: celesta over a warm pad (D major)
#   bars 4-11  theme A on piano (A2 adds violins + cello counter-line)
#   bars 12-16 lilting waltz momentum (harp, pizzicato, piano), theme B in violins
#   bar  17    held Gmaj9 -- the grand whistle (F#-A-D) completes the chord
#   bars 18-20 rising build, timpani roll, harp glissando
#   bars 21-22 lift-off: modulation to E major, broad climax (peak at bar 22)
#   bars 23-25 resolution: celesta / glockenspiel, plagal close on E(add9)
# =============================================================================

# (bar, beat, bass notes, string-pad voicing, pad vel, bass vel)
HARMONY = [
    (0, 1, "D2", "D3 A3 E4 F#4", .30, .20),        # D(add9)
    (1, 1, "D2", "D3 B3 E4 G4", .32, .20),         # Em7/D
    (2, 1, "G2", "G3 B3 F#4 A4", .34, .22),        # Gmaj9  (distant whistle)
    (3, 1, "A2", "A3 D4 E4 G4", .33, .22),         # A7sus4
    (3, 3, "A2", "A3 C#4 E4 G4", .33, .22),        # A7
    (4, 1, "D2", "D3 F#3 A3 D4", .27, .17),        # D        theme A1
    (5, 1, "B1", "D3 F#3 A3 C#4", .27, .17),       # Bm9
    (6, 1, "G1", "D3 F#3 A3 B3", .28, .17),        # Gmaj9  (second whistle)
    (7, 1, "A1", "E3 G3 D4", .28, .17),            # A7sus4
    (7, 3, "A1", "E3 G3 C#4", .28, .17),           # A7
    (8, 1, "F#2", "A3 C#4 E4", .38, .26),          # F#m7     theme A2
    (9, 1, "B1", "A3 D4 F#4", .41, .28),           # Bm7
    (10, 1, "E2", "G3 B3 D4 F#4", .44, .30),       # Em9
    (11, 1, "A1", "G3 D4 E4", .44, .30),           # A7sus4
    (11, 2, "A1", "G3 C#4 E4", .44, .30),          # A7
    (12, 1, "D2", "F#3 A3 D4", .42, .32),          # D        momentum
    (13, 1, "G1", "G3 B3 D4", .46, .34),           # Gmaj7
    (14, 1, "A1", "A3 C#4 E4", .50, .36),          # A
    (15, 1, "F#2", "A3 C#4 E4", .54, .38),         # F#m7
    (16, 1, "B1", "A3 D4 F#4", .57, .40),          # Bm7
    (16, 3, "A1", "A3 C#4 E4", .58, .40),          # A
    (17, 1, "G1 G2", "G3 B3 D4", .52, .40),        # Gmaj9 under the grand whistle
    (18, 1, "E2", "G3 B3 D4 F#4", .52, .40),       # Em9      build
    (18, 3, "F#2", "G3 B3 E4", .56, .42),          # Em/F#
    (19, 1, "G2", "G3 B3 D4 F#4", .60, .45),       # Gmaj7
    (19, 3, "A2", "A3 C#4 E4", .64, .48),          # A
    (20, 1, "B1", "B3 E4 F#4", .68, .52),          # Bsus4
    (20, 3, "B1", "A3 D#4 F#4", .74, .56),         # B7
    (21, 1, "E1 E2", "E3 B3 E4 G#4", .85, .62),    # E        lift-off (E major)
    (22, 1, "A1 A2", "A3 C#4 E4 G#4", .88, .64),   # Amaj7    peak
    (22, 3, "B1 B2", "A3 D#4 F#4 B4", .90, .64),   # B7
    (23, 1, "E1 E2", "E3 B3 E4 G#4", .80, .56),    # E        resolution
    (24, 1, "E2", "A3 C#4 E4 G#4", .50, .40),      # Amaj7/E (final whistle G#-B-E)
    (24, 3, "E2", "A3 C#4 E4 F#4", .46, .38),      # A6/E
    (25, 1, "E2", "E3 B3 F#4 G#4 B4", .44, .36),   # E(add9) final chord
]
HARMONY_END = (27, 1)

# Piano right hand: theme A (bar, beat, beats, note, vel)
PIANO_RH = [
    (4, 1, 1.5, "A4", .50), (4, 2.5, .5, "F#4", .40), (4, 3, 1, "A4", .46),
    (5, 1, 2, "D5", .58), (5, 3, 1, "C#5", .46),
    (6, 1, 1.5, "B4", .52), (6, 2.5, .5, "A4", .42), (6, 3, 1, "F#4", .44),
    (7, 1, 3, "E4", .46),
    (8, 1, 1.5, "C#5", .56), (8, 2.5, .5, "A4", .46), (8, 3, 1, "C#5", .52),
    (9, 1, 2, "F#5", .64), (9, 3, 1, "E5", .52),
    (10, 1, 1.5, "D5", .56), (10, 2.5, .5, "C#5", .48), (10, 3, 1, "B4", .48),
    (11, 1, 1, "B4", .48), (11, 2, 2, "A4", .44),
]
# Piano left hand: flowing eighths, pedal changes with the harmony
PIANO_LH = {
    4: "D2 A2 E3 F#3 A3 F#3",
    5: "B1 F#2 C#3 D3 A3 D3",
    6: "G1 D2 A2 B2 F#3 B2",
    7: "A1 E2 B2 D3 C#3 E3",
    8: "F#2 C#3 E3 A3 E3 C#3",
    9: "B1 F#2 C#3 D3 A3 D3",
    10: "E2 B2 F#3 G3 D4 G3",
    11: "A1 E2 G2 C#3 E3 G3",
}
# Piano "oom-pah-pah" chords on beats 2 and 3 in the waltz section
PIANO_WALTZ = [
    (12, 2, "A3 D4 F#4"), (12, 3, "A3 D4 F#4"), (13, 2, "B3 D4 F#4"), (13, 3, "B3 D4 F#4"),
    (14, 2, "A3 C#4 E4"), (14, 3, "A3 C#4 E4"), (15, 2, "A3 C#4 E4"), (15, 3, "A3 C#4 E4"),
    (16, 2, "A3 D4 F#4"), (16, 3, "A3 C#4 E4"),
]
PIANO_END = [(25, 1, 6.0, "E2", .30), (25, 1, 6.0, "B2", .22)]

# Violins (bar, beat, beats, note, vel, [swell])
VIOLINS = [
    # A2: soft unison doubling of the piano theme
    (8, 1, 1.5, "C#5", .30), (8, 2.5, .5, "A4", .26), (8, 3, 1, "C#5", .30),
    (9, 1, 2, "F#5", .36), (9, 3, 1, "E5", .30),
    (10, 1, 1.5, "D5", .32), (10, 2.5, .5, "C#5", .28), (10, 3, 1, "B4", .30),
    (11, 1, 1, "B4", .30), (11, 2, 2, "A4", .28),
    # theme B over the lilting waltz
    (13, 1, 1, "B4", .48), (13, 2, 2, "F#5", .55),
    (14, 1, 1.5, "E5", .56), (14, 2.5, .5, "D5", .50), (14, 3, 1, "C#5", .52),
    (15, 1, 1, "A4", .55), (15, 2, 2, "E5", .62),
    (16, 1, 1.5, "F#5", .66), (16, 2.5, .5, "E5", .60), (16, 3, 1, "C#5", .60),
    (17, 1, 3, "B4", .55, (1.0, 0.5, 0.42, 0.7)),     # breathe under the grand whistle
    # rising build (motif rhythm: dotted quarter, eighth, quarter)
    (18, 1, 1.5, "G4", .55), (18, 2.5, .5, "B4", .55), (18, 3, 1, "E5", .60),
    (19, 1, 1.5, "D5", .62), (19, 2.5, .5, "F#5", .62), (19, 3, 1, "A5", .68),
    (20, 1, 1.5, "F#5", .70), (20, 2.5, .5, "G#5", .72), (20, 3, 1, "A5", .78),
    # climax in E major
    (21, 1, 1.5, "B5", .90), (21, 2.5, .5, "G#5", .84), (21, 3, 1, "B5", .88),
    (22, 1, 2, "E6", .98), (22, 3, 1, "D#6", .90),
    (23, 1, 3.6, "E6", .85, (1.0, 0.55, 0.25)),
]
# Second violins double an octave lower from bar 14
VIOLINS2_FROM_BAR = 14

CELLOS = [
    (8, 1, 1, "E3", .34), (8, 2, 1, "F#3", .34), (8, 3, 1, "A3", .36),
    (9, 1, 2, "D4", .40), (9, 3, 1, "C#4", .36),
    (10, 1, 1.5, "B3", .38), (10, 2.5, .5, "A3", .34), (10, 3, 1, "G3", .36),
    (11, 1, 1, "A3", .36), (11, 2, 2, "G3", .38),
    (12, 1, 3, "F#3", .36),
    (13, 1, 2, "D4", .42), (13, 3, 1, "B3", .40),
    (14, 1, 3, "C#4", .44),
    (15, 1, 1, "C#4", .44), (15, 2, 1, "B3", .42), (15, 3, 1, "A3", .44),
    (16, 1, 2, "B3", .46), (16, 3, 1, "A3", .46),
    (17, 1, 3, "G3", .44, (1.0, 0.5, 0.45, 0.7)),
    (18, 1, 2, "E3", .48), (18, 3, 1, "F#3", .50), (19, 1, 2, "G3", .54), (19, 3, 1, "A3", .58),
    (20, 1, 3, "B3", .64, (0.8, 1.0)),
    (21, 1, 1, "G#3", .80), (21, 2, 1, "A3", .78), (21, 3, 1, "B3", .80),
    (22, 1, 2, "C#4", .85), (22, 3, 1, "A3", .82),
    (23, 1, 3.5, "G#3", .72, (1.0, 0.5, 0.3)),
]

HORNS = [
    (15, 1, 3, "C#4 E4", .30, (0.6, 1.0)),
    (16, 1, 2, "D4 F#4", .36), (16, 3, 1, "C#4 E4", .38),
    (17, 1, 3, "B3 D4", .36, (1.0, 0.35, 0.3, 0.5)),
    (18, 1, 1.5, "G3", .45), (18, 2.5, .5, "B3", .45), (18, 3, 1, "E4", .50),
    (19, 1, 1.5, "D4", .52), (19, 2.5, .5, "F#4", .52), (19, 3, 1, "A4", .58),
    (20, 1, 1.5, "F#4", .62), (20, 2.5, .5, "G#4", .64), (20, 3, 1, "A4", .70),
    (21, 1, 1.5, "B4", .85), (21, 2.5, .5, "G#4", .80), (21, 3, 1, "B4", .85),
    (22, 1, 2, "E5", .95), (22, 3, 1, "D#5", .88),
    (23, 1, 3, "E5", .80, (1.0, 0.5, 0.2)),
]
LOW_BRASS = [
    (20, 1, 2, "B2 F#3", .40, (0.5, 1.0)), (20, 3, 1, "B2 A3", .50),
    (21, 1, 3, "E2 B2 E3", .70),
    (22, 1, 2, "A2 E3", .72), (22, 3, 1, "B2 F#3", .75),
    (23, 1, 3.5, "E2 B2 E3", .68, (1.0, 0.45, 0.15)),
]

PIZZ = [
    (12, 1, "D2", .55), (12, 3, "A2", .40), (13, 1, "G2", .55), (13, 3, "D3", .40),
    (14, 1, "A2", .56), (14, 3, "E3", .42), (15, 1, "F#2", .57), (15, 3, "C#3", .42),
    (16, 1, "B2", .58), (16, 3, "A2", .48),
    (18, 1, "E2", .55), (18, 3, "F#2", .45), (19, 1, "G2", .58), (19, 3, "A2", .48),
    (20, 1, "B1", .62),
]


def _seq(bar, notes, vel, start=1.0, step=0.5):
    return [(bar, start + i * step, p, vel * (1.0 if i == 0 else 0.88), 0.0) for i, p in enumerate(notes.split())]


def _gliss(bar, beat, span, notes, vel):
    ns = notes.split()
    return [(bar, beat + span * i / len(ns), p, vel * (0.75 + 0.25 * i / len(ns)), 0.0) for i, p in enumerate(ns)]


def _roll(bar, beat, notes, vel, spread):
    return [(bar, beat, p, vel, i * spread) for i, p in enumerate(notes.split())]


# Harp: (bar, beat, note, vel, extra seconds offset)
HARP = (
    _seq(3, "A2 E3 A3 D4 E4 G4", .34)
    + _seq(12, "D3 A3 D4 F#4 A4 F#4", .40) + _seq(13, "G2 D3 B3 D4 F#4 D4", .42)
    + _seq(14, "A2 E3 A3 C#4 E4 C#4", .44) + _seq(15, "F#2 C#3 A3 C#4 E4 C#4", .46)
    + _seq(16, "B2 F#3 B3 D4 C#4 E4", .48)
    + _roll(17, 1, "G2 D3 G3 B3 D4 F#4 A4 B4 D5", .30, 0.11)
    + _seq(18, "E3 B3 D4 F#4 G4 B4", .46) + _seq(19, "G3 D4 F#4 B4 A4 C#5", .50)
    + _seq(20, "B3 E4 F#4 B4", .54)
    + _gliss(20, 3, 1.0, "E3 F#3 G#3 A3 B3 C#4 D#4 E4 F#4 G#4 A4 B4 C#5 D#5 E5 F#5 G#5 A5 B5 C#6 D#6", .55)
    + [(21, 1, "E6", .6, 0.0)]
    + _seq(21, "E2 B2 G#3 E4 G#4 B4", .55, start=1.5)[:5]
    + _roll(22, 1, "A2 E3 A3 C#4 E4 G#4 C#5", .55, 0.05) + _roll(22, 3, "B2 F#3 A3 D#4 F#4 B4", .55, 0.05)
    + _roll(23, 1, "E2 B2 E3 G#3 B3 E4 G#4 B4 E5", .52, 0.06)
    + _seq(24, "E2 A2 E3 C#4 E4 F#4", .28)
    + _roll(25, 1, "E2 B2 F#3 G#3 B3 E4 F#4 G#4 B4 E5", .36, 0.09)
)

# Celesta / glockenspiel: (bar, beat, note, vel)
CELESTA = [
    (0, 1, "F#5", .30), (0, 2, "A5", .28), (0, 3, "E6", .30),
    (1, 1, "D6", .34), (1, 3, "B5", .28),
    (2, 1, "B5", .30), (2, 1.5, "F#5", .26),
    (3, 2.5, "E6", .26), (3, 3, "C#6", .30),
    (7, 2, "A5", .26), (7, 2.5, "D6", .26), (7, 3, "C#6", .28),
    (9, 2, "A6", .22), (9, 2.5, "F#6", .20),
    (11, 3, "E6", .24),
    (13, 2, "F#6", .24), (15, 2, "E6", .24),
    (23, 1, "E5", .34), (23, 1.5, "G#5", .34), (23, 2, "B5", .36), (23, 2.5, "E6", .38),
    (23, 3, "F#6", .36), (23, 3.5, "G#6", .38),
    (24, 1, "B5", .36), (24, 2.5, "G#5", .30), (24, 3, "B5", .32),
    (25, 1, "E6", .36),
]
GLOCK = [
    (21, 1, "B6", .40), (21, 2.5, "G#6", .34), (21, 3, "B6", .38),
    (22, 1, "E7", .45), (22, 3, "D#7", .38), (23, 1, "E7", .40),
    (23, 3.5, "B6", .22), (25, 1, "B6", .24), (25, 1.5, "E7", .20),
]

# Timpani: rolls (start bar, beat, end bar, beat, note, vel0, vel1) and hits (bar, beat, note, vel)
TIMP_ROLLS = [(20, 1, 21, 1, "B2", .15, .72), (22, 3, 23, 1, "B2", .35, .78)]
TIMP_HITS = [(21, 1, "E2", .95), (22, 1, "E2", .70), (23, 1, "E2", .85)]
BASS_DRUM = [(21, 1, .80), (23, 1, .60)]

# =============================================================================
# Music rendering
# =============================================================================

STR_PAD = dict(voices=6, detune=9.0, attack=0.55, release=1.4, vib_depth=7.0, vib_rate=5.0, cutoff=2500, width=1.3, pan=0.0)
STR_VLN = dict(voices=4, detune=6.0, attack=0.16, release=0.7, vib_depth=13.0, vib_rate=5.6, cutoff=3400, width=0.45, pan=-0.2)
STR_VLN2 = dict(voices=4, detune=6.0, attack=0.18, release=0.7, vib_depth=11.0, vib_rate=5.4, cutoff=3000, width=0.4, pan=0.0)
STR_VC = dict(voices=4, detune=6.0, attack=0.2, release=0.8, vib_depth=11.0, vib_rate=5.2, cutoff=2200, width=0.35, pan=0.3)
STR_CB = dict(voices=3, detune=5.0, attack=0.32, release=1.0, vib_depth=5.0, vib_rate=4.8, cutoff=650, width=0.3, pan=0.22)

# bus -> (gain dB, hall reverb send)
MUSIC_BUSES = {
    "strings": (-14.0, 0.26),
    "brass": (-13.0, 0.32),
    "piano": (-7.0, 0.22),
    "harp": (-12.0, 0.34),
    "bells": (-10.0, 0.45),
    "perc": (-10.0, 0.36),
}


def build_harmony(tm):
    segs = []
    for i, (bar, beat, bass, pad, pv, bv) in enumerate(HARMONY):
        nb, nbeat = (HARMONY[i + 1][0], HARMONY[i + 1][1]) if i + 1 < len(HARMONY) else HARMONY_END
        segs.append(dict(t0=tm.at(bar, beat), t1=tm.at(nb, nbeat), bass=bass.split(), pad=pad.split(),
                         pv=pv, bv=bv, pcs=sorted({midi_of(p) % 12 for p in (bass + " " + pad).split()})))
    return segs


def pcs_at(segs, t):
    for s in segs:
        if s["t0"] <= t < s["t1"]:
            return s["pcs"]
    return segs[0]["pcs"] if t < segs[0]["t0"] else segs[-1]["pcs"]


def merge_ties(segs, key, vkey):
    """Common tones between successive chords are held, not re-bowed."""
    active, notes = {}, []
    for s in segs:
        cur = s[key]
        for p in list(active):
            if p not in cur:
                notes.append(active.pop(p))
        for p in cur:
            if p in active and abs(active[p]["t1"] - s["t0"]) < 1e-6:
                active[p]["t1"] = s["t1"]
                active[p]["bp"].append((s["t0"], s[vkey]))
            else:
                active[p] = dict(p=p, t0=s["t0"], t1=s["t1"], bp=[(s["t0"], s[vkey])])
    notes.extend(active.values())
    return notes


def tie_swell(nt, t0, dur, final_t=None, final_level=0.45):
    """Dynamics curve (relative to the first segment) for a tied note, sampled evenly over its length."""
    ts = t0 + np.linspace(0.0, dur, 40)
    v0 = nt["bp"][0][1]
    vals = np.full(ts.shape, v0)
    for (ta, va), (tb, vb) in zip(nt["bp"][:-1], nt["bp"][1:]):
        vals += (vb - va) * np.clip((ts - tb) / 0.7 + 0.5, 0.0, 1.0)
    if final_t is not None:
        vals *= np.interp(ts, [final_t, ts[-1]], [1.0, final_level], left=1.0)
    if len(nt["bp"]) == 1 and final_t is None:
        return None
    return list(vals / v0)


def render_music(mix, tm, ev, rng, segs):
    def T(bar, beat):
        return tm.at(bar, beat)

    def hum(s=0.008):
        return float(np.clip(rng.normal(0, s), -2.5 * s, 2.5 * s))

    music_t0 = segs[0]["t0"]
    final_t = segs[-1]["t0"]

    # ---- string pad (tied voice-leading) and basses
    for key, vkey, preset in (("pad", "pv", STR_PAD), ("bass", "bv", STR_CB)):
        for nt in merge_ties(segs, key, vkey):
            first = nt["t0"] <= music_t0 + 1e-6
            att = 1.8 if first else preset["attack"]
            t0 = nt["t0"] - (0.6 if first else 0.0) + hum(0.012)
            dur = nt["t1"] - t0 + 0.12
            is_final = nt["t1"] >= segs[-1]["t1"] - 1e-6
            sw = tie_swell(nt, t0, dur, final_t=final_t if is_final else None)
            x = string_note(nhz(nt["p"]), dur, nt["bp"][0][1], rng, **dict(preset, attack=att), swell=sw)
            mix.add("strings", x, t0)

    # ---- melodic strings
    def str_line(notes, preset, octave=0, vscale=1.0, from_bar=None):
        for nt in notes:
            bar, beat, beats, name, vel = nt[:5]
            if from_bar is not None and bar < from_bar:
                continue
            sw = nt[5] if len(nt) > 5 else None
            t0 = T(bar, beat) + hum(0.006)
            t1 = T(bar, beat + beats)
            f = nhz(name) * 2.0 ** octave
            x = string_note(f, t1 - t0 + 0.09, vel * vscale, rng, **preset, swell=sw)
            mix.add("strings", x, t0)

    str_line(VIOLINS, STR_VLN)
    str_line(VIOLINS, STR_VLN2, octave=-1, vscale=0.62, from_bar=VIOLINS2_FROM_BAR)
    str_line(CELLOS, STR_VC)

    # ---- brass
    for nt in HORNS:
        bar, beat, beats, names, vel = nt[:5]
        sw = nt[5] if len(nt) > 5 else None
        t0 = T(bar, beat) + hum(0.008)
        t1 = T(bar, beat + beats)
        for name in names.split():
            x = brass_note(nhz(name), t1 - t0 + 0.06, vel, rng, players=2, dark=1.0, swell=sw, pan=-0.12)
            mix.add("brass", x, t0)
    for nt in LOW_BRASS:
        bar, beat, beats, names, vel = nt[:5]
        sw = nt[5] if len(nt) > 5 else None
        t0 = T(bar, beat) + hum(0.008)
        t1 = T(bar, beat + beats)
        for name in names.split():
            x = brass_note(nhz(name), t1 - t0 + 0.06, vel, rng, players=2, dark=1.25, attack=0.3, swell=sw, pan=0.18)
            mix.add("brass", x, t0, gain=0.8)

    # ---- piano
    pedal_pts = sorted({s["t0"] for s in segs} | {T(b, 1) for b in range(0, 28)})

    def pedal_end(t):
        for p in pedal_pts:
            if p > t + 0.05:
                return p
        return t + 3.0

    def piano(t0, name, dur, vel):
        f = nhz(name)
        x = piano_note(f, dur, vel * float(np.clip(rng.normal(1, 0.04), 0.85, 1.12)), rng)
        pan = 0.05 + float(np.clip((midi_of(name) - 62) / 60.0, -0.3, 0.3))
        mix.add("piano", x, t0, pan=pan)

    for bar, beat, beats, name, vel in PIANO_RH:
        t0 = T(bar, beat) + hum(0.007)
        end = max(T(bar, beat + beats), pedal_end(t0)) + 0.05
        piano(t0, name, end - t0, vel)
        if bar >= 8:  # A2: melody in octaves
            piano(t0 + 0.004, name[:-1] + str(int(name[-1]) - 1), end - t0, vel * 0.55)
    for bar, notes in PIANO_LH.items():
        for i, name in enumerate(notes.split()):
            t0 = T(bar, 1 + 0.5 * i) + hum(0.009)
            v = (0.34 if i == 0 else 0.25) * (1.15 if bar >= 8 else 1.0)
            piano(t0, name, pedal_end(t0) + 0.05 - t0, v)
    for bar, beat, notes in PIANO_WALTZ:
        t0 = T(bar, beat) + hum(0.007)
        d = T(bar, beat + 0.75) - t0
        for name in notes.split():
            piano(t0 + rng.uniform(0, 0.006), name, d, 0.24 if beat == 2 else 0.21)
    for bar, beat, beats, name, vel in PIANO_END:
        t0 = T(bar, beat)
        piano(t0, name, T(bar, beat + beats) - t0, vel)

    # ---- harp and pizzicato
    for bar, beat, name, vel, off in HARP:
        t0 = T(bar, beat) + off + hum(0.005)
        f = nhz(name)
        x = pluck_note(f, vel, rng, bright=0.45 + 0.3 * vel)
        pan = -0.35 + float(np.clip((midi_of(name) - 60) / 60.0, -0.25, 0.25))
        mix.add("harp", x, t0, pan=pan)
    for bar, beat, name, vel in PIZZ:
        t0 = T(bar, beat) + hum(0.006)
        x = pluck_note(nhz(name), vel, rng, tau0=0.38, bright=0.25, pos=0.35, nmax=10, length=1.6)
        x = filt(x, 2, 1600, "low")
        mix.add("strings", x, t0, pan=0.28, gain=0.55)

    # ---- celesta, glockenspiel and the closing shimmer
    for bar, beat, name, vel in CELESTA:
        t0 = T(bar, beat) + hum(0.005)
        mix.add("bells", celesta_note(nhz(name), vel, rng), t0, pan=0.32)
    for bar, beat, name, vel in GLOCK:
        t0 = T(bar, beat) + hum(0.004)
        mix.add("bells", glock_note(nhz(name), vel, rng), t0, pan=0.18, gain=0.8)
    t = T(23, 2)
    t_end = ev["fade_out_end"] - 2.5
    i = 0
    while t < t_end:
        pcs = pcs_at(segs, t)
        cands = [m for m in range(84, 101) if m % 12 in pcs and m % 12 in (4, 6, 8, 11)] or [88]
        m = int(rng.choice(cands))
        prog = (t - T(23, 1)) / max(t_end - T(23, 1), 1e-3)
        vel = float(rng.uniform(0.07, 0.17)) * (1 - 0.5 * prog)
        if i % 2 == 0:
            mix.add("bells", celesta_note(hz(m), vel, rng), t, pan=float(rng.uniform(-0.6, 0.7)))
        else:
            mix.add("bells", glock_note(hz(m), vel * 0.8, rng), t, pan=float(rng.uniform(-0.6, 0.7)))
        t += float(rng.exponential(0.32 + 0.5 * prog)) + 0.08
        i += 1

    # ---- timpani / bass drum (climax only)
    for b0, be0, b1, be1, name, v0, v1 in TIMP_ROLLS:
        ta, tb = T(b0, be0), T(b1, be1)
        f = nhz(name)
        t = ta
        k = 0
        while t < tb - 0.03:
            x = (t - ta) / (tb - ta)
            v = (v0 + (v1 - v0) * x ** 1.6) * float(rng.uniform(0.88, 1.08)) * (1.0 if k % 2 == 0 else 0.9)
            mix.add("perc", timpani_hit(f, v, rng, length=1.6) * 0.55, t, pan=0.05)
            t += 1.0 / (11.0 + 5.0 * x) + float(rng.uniform(-0.006, 0.006))
            k += 1
    for bar, beat, name, vel in TIMP_HITS:
        mix.add("perc", timpani_hit(nhz(name), vel, rng), T(bar, beat), pan=0.05)
    for bar, beat, vel in BASS_DRUM:
        mix.add("perc", bass_drum(vel, rng), T(bar, beat) + 0.003, pan=0.0)


def process_music(mix, ev):
    """EQ each music bus, return (dry, hall_send) stereo arrays."""
    n = mix.n
    dry = np.zeros((2, n), np.float32)
    send = np.zeros((2, n), np.float32)
    eqs = {
        "strings": [peaking_sos(300, -1.5, 0.9), peaking_sos(2900, 1.5, 1.0), highshelf_sos(8000, -3.0)],
        "brass": [peaking_sos(500, 1.0, 0.9), highshelf_sos(4500, -4.0)],
        "piano": [highshelf_sos(8000, -2.0)],
        "harp": [],
        "bells": [highshelf_sos(9000, -3.0)],
        "perc": [],
    }
    for name, (gdb, snd) in MUSIC_BUSES.items():
        if name not in mix.buses:
            continue
        x = mix.buses[name].astype(np.float64)
        for sos in eqs.get(name, []):
            x = signal.sosfilt(sos, x, axis=1)
        x *= db(gdb + ev["mix"]["music_db"])
        dry += x.astype(np.float32)
        send += (x * snd).astype(np.float32)
    return dry, send


# =============================================================================
# Sound design
# =============================================================================


def dist_gain(d, ref=12.0):
    return (ref / np.maximum(d, ref)) ** 0.8


def dist_cutoff(d):
    return np.clip(16000.0 * (8.0 / np.maximum(d, 1.0)) ** 0.55, 350.0, 15000.0)


def steam_whistle(chord_hz, dur, rng, bright=1.0, rise_cents=55.0, vib_cents=9.0, breath=0.6):
    """Three-chime steam whistle: breathy onset, pitch rise, vibrato, valve close sag. Stereo."""
    n = int((dur + 0.8) * SR)
    t = np.arange(n) / SR
    opening = smoothstep(t / 0.2)
    close = 1.0 - smoothstep((t - (dur - 0.12)) / 0.4)
    press = opening * close * (1.0 + 0.04 * smooth_noise(n, 2.0, rng))
    out = np.zeros((2, n))
    levels = [0.9, 1.0, 0.8, 0.7, 0.7]
    for i, f in enumerate(chord_hz):
        delay = 0.012 * i + rng.uniform(0, 0.02)
        td = np.clip(t - delay, 0.0, None)
        cents = (-rise_cents * np.exp(-td / 0.22)
                 - 35.0 * (1.0 - close)
                 + vib_cents * np.clip((td - 0.35) / 0.5, 0, 1) * np.sin(2 * np.pi * rng.uniform(4.8, 5.6) * t + rng.uniform(0, 6.3))
                 + 3.0 * smooth_noise(n, 6.0, rng))
        ph = 2 * np.pi * np.cumsum(f * np.exp2(cents / 1200.0)) / SR
        tone_env = smoothstep((td - 0.03) / 0.3) * close * (1.0 + 0.04 * smooth_noise(n, 3.0, rng))
        bloom = tone_env ** 1.5
        tone = (np.sin(ph) + 0.26 * np.sin(2 * ph + 0.4)
                + bright * (0.36 * bloom * np.sin(3 * ph + 1.1) + 0.08 * bloom * np.sin(4 * ph + 0.3)
                            + 0.12 * bloom ** 2 * np.sin(5 * ph + 0.7) + 0.04 * bloom ** 2 * np.sin(7 * ph)))
        nb = filt(rng.standard_normal(n), 2, (f * 0.88, f * 1.14), "band")
        nb /= np.sqrt(np.mean(nb ** 2)) + 1e-9
        breath_env = (0.9 * np.exp(-td / 0.12) * smoothstep(td / 0.02) + 0.2) * opening * close
        chime = (0.9 * tone * tone_env + breath * 0.32 * nb * breath_env) * levels[i % len(levels)]
        gl, gr = pan_gains((i - 1) * 0.15)
        out[0] += gl * chime
        out[1] += gr * chime
    hiss_env = (0.55 * np.exp(-t / 0.15) * smoothstep(t / 0.01) + 0.07 * press
                + 0.25 * np.exp(-np.clip(t - dur, 0, None) / 0.2) * smoothstep((t - dur + 0.1) / 0.1))
    for c in range(2):
        out[c] += breath * 0.5 * filt(rng.standard_normal(n), 2, (1800, 9000), "band") * hiss_env
    out = filt(out, 2, 5500 + 3000 * bright, "low")
    end_fade(out, 50.0)
    return out / len(chord_hz) * 0.72


def render_whistles(mix, ev, rng):
    chord = [nhz(p) for p in ev["whistle_chord"]]
    wg = db(ev["mix"]["whistle_db"])
    for name, w in ev["whistles"].items():
        if not w.get("enabled", True):
            continue
        t0, dur, d = float(w["t"]), float(w["dur"]), float(w["distance_m"])
        fs = [f * 2.0 ** (float(w.get("transpose", 0)) / 12.0) for f in chord]
        far = float(np.clip(math.log10(max(d, 20.0) / 20.0) / 2.2, 0.0, 1.0))
        x = steam_whistle(fs, dur, rng, bright=1.0 - 0.6 * far, rise_cents=55.0 - 15 * far,
                          vib_cents=9.0 - 3 * far, breath=0.6 - 0.25 * far)
        x = filt(x, 2, float(dist_cutoff(d)), "low")
        g = db(float(w["gain_db"])) * wg
        if d > 400:  # long echoes off the far shore
            ex = np.zeros((2, x.shape[1] + int(2.2 * SR)))
            ex[:, :x.shape[1]] += x
            for dl, eg, pn, fc in ((0.42, 0.34, 0.5, 2200), (0.95, 0.22, -0.6, 1500), (1.65, 0.12, 0.3, 1000)):
                i = int(dl * SR)
                e = filt(x.mean(axis=0), 2, fc, "low") * eg
                gl, gr = pan_gains(np.clip(w["pan"] + pn, -1, 1))
                ex[0, i:i + len(e)] += gl * e
                ex[1, i:i + len(e)] += gr * e
            x = ex
        mix.add("whistle", x, t0, pan=float(w["pan"]), gain=g)
        mix.add("sky", x, t0, pan=float(w["pan"]), gain=g * (0.55 + 0.6 * far))
        if name == "grand":
            mix.add("hall_sfx", x, t0, pan=float(w["pan"]), gain=g * 0.25)


def train_motion(ev, dur):
    tr = ev["train"]
    dt = 0.0005
    tg = np.arange(0.0, dur + 1.0, dt)
    v = interp_kf(tr["speed_profile_mps"], tg)
    x = np.concatenate([[0.0], np.cumsum(v[:-1] * dt)])
    rate = tr["beats_per_rev"] * v / (math.pi * tr["wheel_diameter_m"])
    ph = np.concatenate([[0.0], np.cumsum(rate[:-1] * dt)])
    return tg, v, x, rate, ph


def chuff_sound(rng, interval, strength, heavy, cutoff):
    d = float(np.clip(1.25 * interval, 0.045, 0.22)) * (1.0 + 0.6 * heavy)
    n = int((3.0 * d + 0.03) * SR)
    t = np.arange(n) / SR
    att = 0.003 + 0.004 * rng.random()
    env = smoothstep(t / att) * np.exp(-t / (0.38 * d))
    c = rng.uniform(550, 1000) * (1.0 - 0.3 * heavy)
    nb = filt(rng.standard_normal(n), 2, (c * 0.45, c * 2.4), "band") * 2.0
    hiss = filt(rng.standard_normal(n), 2, 3000, "high") * np.exp(-t / (0.22 * d)) * smoothstep(t / att) * 0.22
    fb = rng.uniform(80, 100) * (1.0 - 0.18 * heavy)
    body = np.sin(2 * np.pi * fb * t) * np.exp(-t / (0.03 + 0.03 * heavy)) * smoothstep(t / 0.004) * (0.35 + 0.4 * heavy)
    x = strength * (nb * env + hiss + body)
    x = filt(x, 2, float(cutoff), "low")
    return end_fade(x, 3.0)


def render_chuffs(mix, ev, rng, motion):
    tr = ev["train"]
    tg, v, xpos, rate, ph = motion
    k_all = np.arange(1, int(ph[-1]))
    tb_all = np.interp(k_all, ph, tg)
    pat = tr["chuff_strength_pattern"]
    heavy_pat = [1.3, 0.55, 0.9, 0.5]
    jit = float(tr["chuff_timing_jitter"])
    g0 = db(float(tr.get("chuff_gain_db", 0.0)) + ev["mix"]["sfx_db"]) * 0.45
    count = 0
    for k, tb in zip(k_all, tb_all):
        if not any(a <= tb < b for a, b in tr["chuff_windows"]):
            continue
        lvl = float(interp_kf(tr["chuff_level"], tb))
        if lvl <= 1e-3:
            continue
        if rng.random() < float(interp_kf(tr["thin_out"], tb)):
            continue
        r = float(np.interp(tb, tg, rate))
        hv = float(interp_kf(tr["heavy"], tb))
        i = int(k) % 4
        s = (pat[i % len(pat)] * (1 - hv) + heavy_pat[i] * hv) * float(np.clip(rng.normal(1, 0.07), 0.8, 1.2))
        t = tb + float(np.clip(rng.normal(0, jit), -2 * jit, 2 * jit)) / r
        d = float(interp_kf(tr["distance_m"], t))
        x = chuff_sound(rng, 1.0 / r, s, hv, dist_cutoff(d))
        g = g0 * lvl * float(dist_gain(d))
        pan = float(interp_kf(tr["pan"], t))
        mix.add("chuff", x, t, pan=pan, gain=g)
        mix.add("hall_sfx", x, t, pan=pan, gain=g * 0.22)
        mix.add("sky", x, t, pan=pan, gain=g0 * lvl * float(dist_gain(d)) ** 0.55 * 0.3)
        count += 1
    return count


def rail_click(rng, kind, cutoff):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    tick = filt(rng.standard_normal(n), 2, (1500, 5500), "band") * np.exp(-t / 0.003) * 0.9
    ring = np.zeros(n)
    base = (1320, 2710, 4170) if kind == 0 else (1180, 2460, 3890)
    for f, a, tau in zip(base, (0.30, 0.18, 0.10), (0.035, 0.022, 0.014)):
        ring += a * np.sin(2 * np.pi * f * rng.uniform(0.97, 1.03) * t + rng.uniform(0, 6.3)) * np.exp(-t / tau)
    thump = np.sin(2 * np.pi * (105.0 if kind == 0 else 88.0) * t) * np.exp(-t / 0.022) * (0.6 if kind == 0 else 0.75)
    x = tick + ring * smoothstep(t / 0.0008) + thump * smoothstep(t / 0.002)
    x = filt(x, 2, float(cutoff), "low")
    return end_fade(x, 5.0)


def render_rails(mix, ev, rng, motion):
    r = ev["rails"]
    tr = ev["train"]
    tg, v, xpos, rate, ph = motion
    t_a, t_b = float(r["start"]), float(r["end"])
    fade = float(r.get("fade_out_s", 0.3))
    S = float(r["joint_spacing_m"])
    gap = float(r["bogie_spacing_m"])
    g0 = db(ev["mix"]["sfx_db"]) * 0.32
    events = []
    for kind, off in ((0, 0.0), (1, gap)):
        xo = xpos - off
        k0 = math.ceil(np.interp(t_a, tg, xo) / S)
        k1 = math.floor(np.interp(t_b + fade, tg, xo) / S)
        for kk in range(k0, k1 + 1):
            events.append((float(np.interp(kk * S, xo, tg)), kind))
    events.sort()
    for t, kind in events:
        if t < t_a or t > t_b + fade:
            continue
        fg = 1.0 - smoothstep((t - t_b) / max(fade, 1e-3))
        t += float(rng.uniform(-0.003, 0.003))
        d = float(interp_kf(tr["distance_m"], t))
        g = g0 * db(float(interp_kf(r["gain_db"], t))) * fg * float(rng.uniform(0.82, 1.0))
        pan = float(interp_kf(r["pan"], t))
        x = rail_click(rng, kind, min(float(dist_cutoff(d)) * 0.9, 8000.0))
        mix.add("rails", x, t, pan=pan, gain=g)
        mix.add("hall_sfx", x, t, pan=pan, gain=g * 0.25)
    # soft rolling roar under the clicks
    n = int((t_b + fade - t_a) * SR)
    if n > 0:
        tt = t_a + np.arange(n) / SR
        g = np.array([db(x_) for x_ in interp_kf(r["gain_db"], tt[::480])])
        g = np.interp(tt, tt[::480], g) * (1.0 - smoothstep((tt - t_b) / max(fade, 1e-3)))
        g *= smoothstep((tt - t_a) / 1.5)
        roar = filt(rng.standard_normal(n), 2, (140, 900), "band")
        d = interp_kf(tr["distance_m"], tt[::480])
        roar = filt(roar, 1, float(np.median(dist_cutoff(d))), "low")
        pan = interp_kf(r["pan"], tt)
        mix.add("rails", roar * g * g0 * 0.22, t_a, pan=pan)


def render_coast(mix, ev, rng):
    c = ev["coast_hiss"]
    tr = ev["train"]
    t_a, t_b = float(c["start"]), float(c["end"])
    n = int((t_b - t_a) * SR)
    tt = t_a + np.arange(n) / SR
    g = db(ev["mix"]["sfx_db"]) * 0.05
    env = np.interp(tt, tt[::240], [db(x) for x in interp_kf(c["gain_db"], tt[::240])])
    hiss = filt(rng.standard_normal(n), 2, (2200, 9500), "band") + 0.4 * filt(rng.standard_normal(n), 2, (900, 2400), "band")
    hiss *= 1.0 + 0.25 * smooth_noise(n, 9.0, rng)
    pan = interp_kf(tr["pan"], tt)
    mix.add("coast", hiss * env * g, t_a, pan=pan)
    mix.add("hall_sfx", hiss * env * g * 0.3, t_a, pan=pan)
    # pass-by air: band of noise sliding down as the train passes the platform
    tp = float(c["pass_by_t"])
    nfft, hop = 1024, 256
    L = 8.0
    n2 = int(L * SR)
    nfr = n2 // hop + 6
    times = np.arange(nfr) * hop / SR + (tp - L / 2)
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    lf = np.log2(np.maximum(freqs, 1.0))
    centre = np.log2(320.0) + (np.log2(950.0) - np.log2(320.0)) * (0.5 - 0.5 * np.tanh((times - tp) / 0.5))
    amp = np.exp(-0.5 * ((times - tp) / 1.25) ** 2)
    mag = amp[:, None] * np.exp(-0.5 * ((lf[None, :] - centre[:, None]) / 1.1) ** 2)
    air = spectral_noise(mag, rng, nfft, hop, n2)
    tt2 = (tp - L / 2) + np.arange(n2) / SR
    pan2 = interp_kf(tr["pan"], tt2)
    ga = g * db(float(c["pass_by_gain_db"])) * 1.6
    mix.add("coast", air * ga, tp - L / 2, pan=pan2)
    mix.add("hall_sfx", air * ga * 0.25, tp - L / 2, pan=pan2)


def droplet(f_end, amp, tau):
    n = int(tau * 7 * SR)
    t = np.arange(n) / SR
    f = f_end * (0.6 + 0.4 * (1.0 - np.exp(-t / 0.01)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return end_fade(amp * smoothstep(t / 0.0012) * np.exp(-t / tau) * np.sin(ph), 2.0)


def render_splashes(mix, ev, rng, segs):
    g0 = db(ev["mix"]["sfx_db"]) * 0.13
    for sp in ev["fish_splashes"]:
        t0 = float(sp["t"] if isinstance(sp, dict) else sp)
        pan = float(sp.get("pan", 0.0)) if isinstance(sp, dict) else float(rng.uniform(-0.5, 0.5))
        pcs = pcs_at(segs, t0)
        notes = [hz(m) for m in range(85, 98) if m % 12 in pcs] or [hz(93)]
        n = int(1.3 * SR)
        out = np.zeros(n)
        t = np.arange(n) / SR
        m = int(0.4 * SR)
        tm_ = t[:m]
        out[:m] += 0.5 * filt(rng.standard_normal(m), 2, (1500, 9000), "band") * smoothstep(tm_ / 0.003) * np.exp(-tm_ / 0.05)
        out[:m] += 0.3 * filt(rng.standard_normal(m), 2, (380, 1500), "band") * smoothstep(tm_ / 0.004) * np.exp(-tm_ / 0.035)
        dm = droplet(float(rng.choice(notes[:5])), 0.55, 0.045)
        out[:len(dm)] += dm
        for _ in range(int(rng.integers(5, 8))):
            dt = float(rng.uniform(0.06, 0.85))
            f = float(rng.choice(notes))
            dr = droplet(f, 0.28 * float(rng.uniform(0.35, 1.0)) * math.exp(-dt / 0.6), float(rng.uniform(0.012, 0.03)))
            i = int(dt * SR)
            k = min(len(dr), n - i)
            out[i:i + k] += dr[:k]
            q = min(int(0.01 * SR), n - i)
            out[i:i + q] += 0.06 * filt(rng.standard_normal(q), 2, 4000, "high") * np.exp(-np.arange(q) / (0.0015 * SR))
        out = end_fade(out, 20.0)
        mix.add("sfx", out, t0, pan=pan, gain=g0)
        mix.add("hall_sfx", out, t0, pan=pan, gain=g0 * 0.35)
        mix.add("sky", out, t0, pan=pan, gain=g0 * 0.2)


def render_meteors(mix, ev, rng, segs):
    g0 = db(ev["mix"]["sfx_db"]) * 0.045
    for me in ev["meteors"]:
        t0 = float(me["t"] if isinstance(me, dict) else me)
        pa = float(me.get("pan_from", -0.5)) if isinstance(me, dict) else -0.5
        pb = float(me.get("pan_to", 0.5)) if isinstance(me, dict) else 0.5
        L = float(me.get("dur", 1.7)) if isinstance(me, dict) else 1.7
        nfft, hop = 1024, 256
        n = int(L * SR)
        nfr = n // hop + 6
        times = np.arange(nfr) * hop / SR
        x = np.clip(times / L, 0, 1)
        centre = np.log2(8500.0) + (np.log2(2400.0) - np.log2(8500.0)) * smoothstep(x)
        amp = smoothstep(times / 0.35) * (1.0 - smoothstep((times - 0.45) / (L - 0.45)))
        freqs = np.fft.rfftfreq(nfft, 1 / SR)
        lf = np.log2(np.maximum(freqs, 1.0))
        mag = amp[:, None] * np.exp(-0.5 * ((lf[None, :] - centre[:, None]) / 0.45) ** 2)
        sw = spectral_noise(mag, rng, nfft, hop, n).astype(np.float64)
        pcs = pcs_at(segs, t0 + 0.3)
        tones = [hz(m) for m in range(91, 103) if m % 12 in pcs][:3]
        for f in tones:
            gr_ = sine_grain(f, L, 0.25, rng, trem=13.0)
            sw[:len(gr_)] += 0.06 * gr_
        tt = np.arange(n) / SR
        pan = pa + (pb - pa) * smoothstep(tt / L)
        mix.add("sfx", sw, t0, pan=pan, gain=g0)
        mix.add("sky", sw, t0, pan=pan, gain=g0 * 0.9)


def render_ambience(mix, ev, rng, N, segs, key_change_t):
    amb = ev["ambience"]
    nfft, hop = 2048, 512
    nfr = N // hop + nfft // hop + 2
    times = np.arange(nfr) * hop / SR
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    f = np.maximum(freqs, 1.0)
    lf = np.log2(f)
    base = ((f / (f + 30.0)) ** 2 / (1.0 + (f / 520.0) ** 2.4)).astype(np.float32)
    go = db(float(amb["ocean_db"]) + ev["mix"]["ambience_db"]) * 0.11
    for ch in range(2):
        slow = 0.7 + 0.3 * smooth_noise(nfr, 0.15, rng, sr=SR / hop)
        mag = np.outer(slow * 0.35, base).astype(np.float32)
        t = float(rng.uniform(0.0, 1.5))
        while t < times[-1] + 2.0:
            a = rng.uniform(0.45, 1.0)
            r = rng.uniform(0.35, 0.9)
            d = rng.uniform(0.8, 2.0)
            fc = rng.uniform(280, 850)
            sg = rng.uniform(0.8, 1.3)
            fz = rng.uniform(0.0, 0.1)
            spec = np.exp(-0.5 * ((lf - np.log2(fc)) / sg) ** 2) + fz * np.exp(-0.5 * ((lf - np.log2(3200)) / 0.9) ** 2)
            i0 = int(np.searchsorted(times, t - r))
            i1 = int(np.searchsorted(times, t + 6 * d))
            tt = times[i0:i1]
            e = np.where(tt < t, smoothstep((tt - (t - r)) / r), np.exp(-(tt - t) / d)) * a
            mag[i0:i1] += np.outer(e, spec).astype(np.float32)
            t += float(rng.uniform(1.4, 4.0))
        x = spectral_noise(mag, rng, nfft, hop, N)
        del mag
        side = np.zeros((2, N), np.float32)
        side[ch] = x * go
        mix.add("amb", side, 0.0)
        mix.add("amb_sky", side * 0.15, 0.0)
    # starry shimmer: faint air + twinkles tuned to the key
    gs = db(float(amb["shimmer_db"]) + ev["mix"]["ambience_db"])
    for ch in range(2):
        air = filt(rng.standard_normal(N), 2, (5500, 12000), "band") * (0.6 + 0.4 * smooth_noise(N, 0.2, rng))
        side = np.zeros((2, N), np.float32)
        side[ch] = air * 0.006 * gs
        mix.add("amb_sky", side, 0.0)
        mix.add("amb", side * 0.4, 0.0)
    t = float(rng.uniform(0.3, 1.0))
    D = N / SR
    while t < D:
        pent = (2, 4, 6, 9, 11) if t < key_change_t else (4, 6, 8, 11, 1)
        cands = [m for m in range(91, 105) if m % 12 in pent]
        m = int(rng.choice(cands))
        g = gs * 0.012 * float(rng.uniform(0.3, 1.0))
        x = sine_grain(hz(m), float(rng.uniform(1.0, 2.4)), float(rng.uniform(0.02, 0.08)), rng)
        p = float(rng.uniform(-0.9, 0.9))
        mix.add("amb_sky", x, t, pan=p, gain=g)
        mix.add("amb", x, t, pan=p, gain=g * 0.3)
        t += float(rng.exponential(0.6)) + 0.05


# =============================================================================
# Master
# =============================================================================


def envelope_rms(x, win_s):
    p = np.mean(x.astype(np.float64) ** 2, axis=0)
    w = max(int(win_s * SR), 1)
    return np.sqrt(uniform_filter1d(p, w, mode="nearest"))


def limiter(x, thr):
    pk = np.max(np.abs(x), axis=0).astype(np.float64)
    need = np.maximum(pk / thr, 1.0)
    grdb = 20.0 * np.log10(need)
    S = int(0.015 * SR)
    held = maximum_filter1d(grdb, size=4 * S + 1)
    sm = uniform_filter1d(uniform_filter1d(held, S), S)
    return x * (10.0 ** (-sm / 20.0)), float(grdb.max())


def report(mix, ev, extra):
    shots = ev["shots"]
    names = sorted(set(list(mix.buses.keys()) + list(extra.keys())))
    print("\nRMS dBFS by shot (pre-normalisation, pre-master gain):")
    print("%-10s" % "bus" + "".join("%7s" % s for s in shots))
    for nm in names:
        x = extra.get(nm, mix.buses.get(nm))
        row = "%-10s" % nm
        for s, (a, b) in shots.items():
            seg = x[:, int(a * SR):int(b * SR)].astype(np.float64)
            r = math.sqrt(np.mean(seg ** 2)) + 1e-12
            row += "%7.1f" % (20 * math.log10(r))
        print(row)


def render(ev, out_path, do_report=False):
    t_start = time.time()
    dur = float(ev["duration"])
    N = int(round(dur * SR))
    seed = int(ev.get("seed", 1717))
    mix = Mixer(N)

    bpb = int(ev["music"].get("beats_per_bar", 3))
    anchors = [(float(b), resolve(ev, v)) for b, v in ev["music"]["anchors"]]
    tm = TempoMap(anchors, bpb)
    segs = build_harmony(tm)
    print("tempo map (bar: time, bpm):")
    for b in range(0, 26):
        t0, t1 = tm.at(b, 1), tm.at(b + 1, 1)
        print("  bar %2d  %6.2fs  %5.1f bpm" % (b, t0, 60.0 * bpb / (t1 - t0)))

    render_music(mix, tm, ev, np.random.default_rng(seed + 1), segs)
    print("music rendered        %6.1fs" % (time.time() - t_start))
    render_whistles(mix, ev, np.random.default_rng(seed + 2))
    motion = train_motion(ev, dur)
    nch = render_chuffs(mix, ev, np.random.default_rng(seed + 3), motion)
    render_rails(mix, ev, np.random.default_rng(seed + 4), motion)
    render_coast(mix, ev, np.random.default_rng(seed + 5))
    render_splashes(mix, ev, np.random.default_rng(seed + 6), segs)
    render_meteors(mix, ev, np.random.default_rng(seed + 7), segs)
    print("sound design rendered %6.1fs  (%d chuffs)" % (time.time() - t_start, nch))
    render_ambience(mix, ev, np.random.default_rng(seed + 8), N, segs, tm.at(21, 1))
    print("ambience rendered     %6.1fs" % (time.time() - t_start))

    music_dry, music_send = process_music(mix, ev)

    # music breathes under the grand whistle
    gw = ev["whistles"].get("grand")
    if gw and gw.get("enabled", True):
        tt = np.arange(N) / SR
        t0, d = float(gw["t"]), float(gw["dur"])
        shape = smoothstep((tt - (t0 - 0.25)) / 0.4) * (1.0 - smoothstep((tt - (t0 + d - 0.2)) / 0.9))
        gduck = 1.0 - (1.0 - db(-float(ev["music"]["duck_under_grand_whistle_db"]))) * shape
        music_dry *= gduck.astype(np.float32)
        music_send *= gduck.astype(np.float32)

    # ambience ducks under the music
    menv = envelope_rms(music_dry, 0.6)
    ref = np.percentile(menv, 97) + 1e-9
    amt = np.clip(menv / ref, 0.0, 1.0) ** 1.5
    duck = (10.0 ** (-float(ev["ambience"]["duck_db"]) * amt / 20.0)).astype(np.float32)
    duck = uniform_filter1d(duck, int(0.3 * SR), mode="nearest")
    amb = mix.bus("amb") * duck
    amb_sky = mix.bus("amb_sky") * duck

    rng_ir = np.random.default_rng(seed + 9)
    hall = make_ir(rng_ir, t60=2.7, length=4.5, predelay=0.022, hf_damp=0.55)
    sky = make_ir(rng_ir, t60=5.2, length=8.0, predelay=0.045, hf_damp=0.45, lf_boost=1.05)
    hall_in = music_send + mix.bus("hall_sfx")
    sky_in = mix.bus("sky") + amb_sky
    wet_hall = convolve_stereo(hall_in, hall)
    wet_sky = convolve_stereo(sky_in, sky)
    print("reverbs               %6.1fs" % (time.time() - t_start))

    sfx = mix.bus("sfx") + mix.bus("chuff") + mix.bus("rails") + mix.bus("coast")
    master = (music_dry + wet_hall + sfx + mix.bus("whistle") + amb + wet_sky).astype(np.float64)
    if do_report:
        report(mix, ev, {"music_dry": music_dry, "wet_hall": wet_hall, "wet_sky": wet_sky,
                         "amb_ducked": amb, "MASTER": master})

    # DC / rumble, fades
    master = signal.sosfilt(butter_sos(2, 22.0, "high"), master, axis=1)
    tt = np.arange(N) / SR
    fin = smoothstep(tt / 1.2)
    fa, fb = float(ev["fade_out_start"]), float(ev["fade_out_end"])
    fout = np.cos(0.5 * np.pi * np.clip((tt - fa) / max(fb - fa, 1e-3), 0.0, 1.0)) ** 1.5
    fout[tt >= fb] = 0.0
    master *= fin * fout

    # gentle peak limiting, then normalise to the target peak
    peak = float(np.max(np.abs(master)))
    master, grmax = limiter(master, peak * db(-float(ev["mix"]["limiter_db"])))
    peak2 = float(np.max(np.abs(master)))
    target = db(float(ev["mix"]["peak_dbfs"]))
    master *= target / peak2
    master -= np.mean(master, axis=1, keepdims=True) * (fout > 0)  # residual DC (tiny)
    master *= fout
    rng_d = np.random.default_rng(seed + 10)
    dither = (rng_d.random(master.shape) - rng_d.random(master.shape)) / 32768.0
    pcm = np.clip(np.round((master + dither * (fout > 0)) * 32767.0), -32767, 32767).astype(np.int16)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    wavfile.write(out_path, SR, pcm.T.copy())
    print("limiter max reduction %.1f dB; wrote %s  (%.1fs)" % (grmax, out_path, time.time() - t_start))
    return pcm


def verify(path, expect_s, shots=None):
    sr, d = wavfile.read(path)
    frames = d.shape[0]
    x = d.astype(np.float64) / 32768.0
    peak = 20 * math.log10(np.max(np.abs(x)) + 1e-12)
    rms = 20 * math.log10(math.sqrt(np.mean(x ** 2)) + 1e-12)
    dc = np.mean(x, axis=0)
    tail = x[int(71.5 * sr):] if frames > int(71.5 * sr) else x[-1:]
    print("verify: %d Hz, %s, %d ch, %d frames = %.4f s (expected %.4f s)"
          % (sr, d.dtype, d.shape[1], frames, frames / sr, expect_s))
    print("        peak %.2f dBFS, RMS %.1f dBFS, DC L/R %.2e/%.2e, max |x| after fade end %.1e"
          % (peak, rms, dc[0], dc[1], np.max(np.abs(tail))))
    if shots:
        print("        RMS dBFS by shot: " + "  ".join(
            "%s %.1f" % (k, 20 * math.log10(math.sqrt(np.mean(x[int(a * sr):int(b * sr)] ** 2)) + 1e-12))
            for k, (a, b) in shots.items()))
    ok = sr == SR and d.dtype == np.int16 and d.shape[1] == 2 and frames == int(round(expect_s * SR))
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", default=DEFAULT_EVENTS_PATH)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    ev = load_events(args.events)
    render(ev, args.out, do_report=args.report)
    ok = verify(args.out, float(ev["duration"]), ev["shots"])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
