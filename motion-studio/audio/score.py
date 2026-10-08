"""Synthesized score + SFX for the 15s reel. 120 BPM, A minor.

Everything here is generated from code: no samples. Deterministic (seeded noise).
Writes audio/score.wav at -14 LUFS integrated.
"""
import json
import os
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 15.0
BPM = 120
BEAT = 60 / BPM
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def note(name):
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3,
             "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + (octave - 4) * 12) / 12)


def place(sig, t, gain=1.0, pan=0.0):
    """Mix a mono or (n,2) signal into the bus at time t (seconds)."""
    i = int(round(t * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        lg = np.cos((pan + 1) * np.pi / 4)
        rg = np.sin((pan + 1) * np.pi / 4)
        sl, sr_ = sig * lg, sig * rg
    else:
        sl, sr_ = sig[:, 0], sig[:, 1]
    n = min(len(sl), N - i)
    L[i:i + n] += sl[:n] * gain
    R[i:i + n] += sr_[:n] * gain


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def lp_sweep(x, cut):
    """Two cascaded one-pole lowpasses with a per-sample cutoff."""
    a = 1 - np.exp(-2 * np.pi * cut / SR)
    y = np.zeros_like(x)
    z1 = z2 = 0.0
    for i in range(len(x)):
        z1 += a[i] * (x[i] - z1)
        z2 += a[i] * (z1 - z2)
        y[i] = z2
    return y


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (t * freq * (1 + detune)) % 1.0
    return 2 * ph - 1


# ---------------------------------------------------------------- instruments
def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.16)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.003) * 0.4
    return np.tanh((body + click) * 1.6) * gain


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        e += (t >= off) * np.exp(-np.clip(t - off, 0, None) / 0.008) * (0.7 + 0.15 * k)
    e += (t >= 0.03) * np.exp(-np.clip(t - 0.03, 0, None) / 0.09) * 0.6
    return noise * e


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500, 4) * np.exp(-t / (0.07 if open_ else 0.014))


def pluck(freq, dur=0.4, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h in range(1, 9):
        s += np.sin(2 * np.pi * freq * h * t) / h * np.exp(-t * (3 + h * 5 / bright))
    s += 0.3 * np.sin(2 * np.pi * freq * 2.001 * t) * np.exp(-t * 9)
    return s * np.clip(t / 0.002, 0, 1) * 0.5


def bell(freq, dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t) * np.exp(-t * 3)
         + 0.5 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6)
         + 0.25 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 11))
    return s * np.clip(t / 0.002, 0, 1) * 0.4


def bass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = saw(freq, n) * 0.6 + np.sin(2 * np.pi * freq * t)
    s = lp_sweep(s, 300 + 2400 * np.exp(-t / 0.05))
    return np.tanh(s * 1.5) * np.exp(-t / 0.25) * np.clip(t / 0.003, 0, 1)


def pad(freqs, dur, cutoff=1800):
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for f in freqs:
        for k, d in enumerate([-0.006, 0.0, 0.007]):
            s = saw(f, n, d)
            pan = (k - 1) * 0.6
            out[:, 0] += s * np.cos((pan + 1) * np.pi / 4)
            out[:, 1] += s * np.sin((pan + 1) * np.pi / 4)
    out[:, 0] = lp(out[:, 0], cutoff)
    out[:, 1] = lp(out[:, 1], cutoff)
    return out / (len(freqs) * 3)


def whoosh(dur, rising=True, f0=300, f1=6000):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep a band through by processing in blocks
    blk = 1024
    fr = np.geomspace(f0, f1, (n + blk - 1) // blk) if rising else np.geomspace(f1, f0, (n + blk - 1) // blk)
    for b in range(len(fr)):
        s = slice(b * blk, min(n, (b + 1) * blk))
        lo = fr[b] * 0.7
        hi = min(fr[b] * 1.4, SR / 2 - 100)
        out[s] = bp(x[max(0, s.start - 2048):s.stop], lo, hi)[-(s.stop - s.start):]
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2 if not rising else (t / dur) ** 2.2
    st = np.zeros((n, 2))
    pan = np.linspace(-0.8, 0.8, n)
    st[:, 0] = out * shape * np.cos((pan + 1) * np.pi / 4)
    st[:, 1] = out * shape * np.sin((pan + 1) * np.pi / 4)
    return st


def impact(gain=1.0, size=1.0):
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    f = 30 + 90 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.5 * size))
    crack = hp(rng.standard_normal(n), 1500) * np.exp(-t / 0.04) * 0.6
    crash = hp(rng.standard_normal(n), 4000) * np.exp(-t / (0.6 * size)) * 0.25
    return np.tanh((boom * 1.2 + crack + crash) * 1.3) * gain


def tick():
    n = int(0.02 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.002)


# ---------------------------------------------------------------- arrangement
CHORDS = {  # bar start -> chord tones
    2: ["A2", "A3", "C4", "E4", "B4"],
    4: ["F2", "F3", "A3", "C4", "E4"],
    6: ["C2", "C3", "E3", "G3", "D4"],
    8: ["G2", "G3", "B3", "D4", "A4"],
    10: ["F2", "F3", "A3", "C4", "G4"],
    11: ["G2", "G3", "B3", "D4", "A4"],
}
pad_bus = np.zeros((N, 2))
side = np.ones(N)  # sidechain envelope

# Bar 1 (0-2): bouncing ball pings, rising
for k, nm in enumerate(["A4", "C5", "E5", "A5"]):
    place(pluck(note(nm), 0.6, 1.4), k * BEAT, 0.9, pan=-0.5 + k * 0.33)
    place(kick(0.35), k * BEAT, 0.6)  # soft thud of the ball landing
dr = pad([note("A2"), note("E3"), note("A3")], 2.2, 900)
dr *= np.linspace(0, 1, len(dr))[:, None] ** 1.5
pad_bus[:len(dr)] += dr * 0.5
place(whoosh(1.0, True, 400, 9000), 1.0, 0.55)

# Bars 2-5 + montage bar: groove
kicks = [2.0 + i * BEAT for i in range(20)]  # 2.0 .. 11.5
for tk in kicks:
    place(kick(), tk, 0.95)
    i = int(tk * SR)
    m = min(int(0.3 * SR), N - i)
    side[i:i + m] = np.minimum(side[i:i + m], 1 - 0.75 * np.exp(-np.arange(m) / SR / 0.09))
for b in range(2, 12, 2):
    for beat in (1, 3):
        place(clap(), b + beat * BEAT, 0.55, pan=0.05)
for i in range(int(2.0 / 0.125), int(11.0 / 0.125)):
    t = i * 0.125
    place(hat(open_=(i % 4 == 2)), t, 0.22 if i % 2 else 0.12, pan=0.35)

for b, tones in CHORDS.items():
    if b >= 10:
        continue
    p = pad([note(x) for x in tones[1:]], 2.0, 2200)
    s = int(b * SR)
    pad_bus[s:s + len(p)] += p * 0.55
    root = note(tones[0])
    for e in range(4):
        place(bass(root, 0.24), b + e * BEAT + BEAT / 2, 0.55)
    # 16th arp
    arp = tones[2:] + tones[2:][::-1][1:-1]
    for j in range(16):
        place(pluck(note(arp[j % len(arp)]) * 2, 0.22, 0.8),
              b + j * 0.125, 0.16, pan=np.sin(j) * 0.6)

# transitions
place(whoosh(0.5, True, 300, 7000), 3.5, 0.45)      # S2 -> S3 wipe
place(whoosh(1.0, True, 200, 9000), 5.0, 0.55)      # zoom into cell
place(whoosh(1.0, True, 150, 10000), 7.0, 0.6)      # tunnel acceleration
place(impact(0.7, 0.7), 8.0, 0.8)                   # tunnel flash
place(impact(0.5, 0.5), 2.0, 0.8)                   # ball fills screen
# easing lanes: arrival chimes
for k, nm in enumerate(["E5", "G5", "B5", "D6", "E6"]):
    place(bell(note(nm), 0.8), 9.0 + k * 0.02, 0.25, pan=-0.6 + k * 0.3)
place(bell(note("A5"), 1.0), 9.5, 0.35)
place(impact(0.35, 0.4), 9.5, 0.5)

# montage (10-12): stabs on every 8th, snare roll into the drop
for j in range(8):
    t = 10.0 + j * 0.25
    tones = CHORDS[10 if t < 11 else 11]
    st = pad([note(x) * 2 for x in tones[1:]], 0.22, 5000)
    st *= np.exp(-np.arange(len(st)) / SR / 0.06)[:, None]
    place(st, t, 2.2)
    place(bass(note(tones[0]), 0.2), t, 0.5)
    place(clap(), t, 0.35, pan=-0.2 if j % 2 else 0.2)  # crisp cut transient
    place(kick(0.5), t, 0.5)
for i in range(15):
    t = 11.0 + i * 0.0625
    place(clap(), t, 0.15 + 0.35 * (i / 15), pan=0.0)
place(whoosh(1.0, True, 300, 12000), 10.875, 0.5)
# drop silence 11.9375-12.0 carved below

# resolve (12-15)
place(impact(1.0, 1.4), 12.0, 1.0)
fin = pad([note(x) for x in ["A2", "E3", "A3", "C4", "E4", "B4"]], 3.0, 3000)
fin *= (np.exp(-np.arange(len(fin)) / SR / 2.2))[:, None]
s = int(12.0 * SR)
pad_bus[s:s + len(fin)] += fin[:N - s] * 0.75
for k, nm in enumerate(["A5", "C6", "E6", "B6"]):
    place(bell(note(nm), 1.4), 12.5 + k * 0.125, 0.45, pan=0.4 - k * 0.25)
place(pluck(note("E4"), 0.5, 2.0), 12.5, 0.9)
place(hat(True), 12.5, 0.5)
place(hat(True), 13.0, 0.5)
place(pluck(note("B4"), 0.4, 2.0), 13.0, 0.6)
for k in range(10):  # subline decode clicks
    place(tick(), 13.0 + k * 0.05, 0.5, pan=0.2)
place(pluck(note("A5"), 0.9, 1.4), 14.0, 1.0)  # the ball lands as the period
place(kick(0.4), 14.0, 0.5)
place(pluck(note("E5"), 0.8, 1.6), 14.5, 0.55)
place(hat(True), 14.5, 0.3)

# ---------------------------------------------------------------- mix
pad_bus *= side[:, None]
L += pad_bus[:, 0]
R += pad_bus[:, 1]
# carve the pre-drop gap
g0, g1 = int(11.9375 * SR), int(12.0 * SR)
L[g0:g1] *= np.linspace(1, 0, g1 - g0) ** 3
R[g0:g1] *= np.linspace(1, 0, g1 - g0) ** 3

mix = np.stack([L, R], 1)
# short synthetic room for glue
ir_n = int(1.1 * SR)
ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / SR / 0.28)[:, None]
ir[:, 0] = lp(ir[:, 0], 6000)
ir[:, 1] = lp(ir[:, 1], 6000)
wet = np.stack([fftconvolve(mix[:, c], ir[:, c])[:N] for c in range(2)], 1)
wet /= np.max(np.abs(wet)) + 1e-9
mix = mix + wet * np.max(np.abs(mix)) * 0.12

# fade tail, soft clip, loudness normalize to -14 LUFS, then peak ceiling
fade = int(0.35 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = np.tanh(mix / (np.max(np.abs(mix)) + 1e-9) * 1.4)
meter = pyln.Meter(SR)
for _ in range(4):
    lufs = meter.integrated_loudness(mix)
    mix = mix * 10 ** ((-14.0 - lufs) / 20)
    pk = np.max(np.abs(mix))
    if pk > 0.89:  # ~ -1 dBTP: compress peaks with a soft knee
        mix = np.tanh(mix / 0.89) * 0.89
lufs = meter.integrated_loudness(mix)
sf.write(os.path.join(HERE, "score.wav"), mix.astype(np.float32), SR, subtype="PCM_24")
print(json.dumps({"lufs": round(lufs, 2), "peak_dbfs": round(20 * np.log10(np.max(np.abs(mix))), 2)}))
