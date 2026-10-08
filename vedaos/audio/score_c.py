"""Film C score: 30s, 120 BPM, D major, warm electronic. Synthesized in code, deterministic.

Reads films/c/cues.json for every hit. Mixes voice stems from audio/voice/<id>.wav when present
(render them on the Mac with Veda's real Kokoro voice: audio/make_voice.py). Without stems the
voice slots stay empty and the on-screen type carries the lines.

Writes audio/c.wav (-14 LUFS, ~-1 dBTP ceiling) and audio/envelope.json (60 fps RMS of Veda's
voice, used by the film to drive the orb's 'speaking' state — the product does the same thing).
"""
import json
import os
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CUES = json.load(open(os.path.join(ROOT, "films/c/cues.json")))
DUR = CUES["duration"]
BEAT = 60 / CUES["bpm"]
N = int(SR * DUR)
rng = np.random.default_rng(11)

bus = {k: np.zeros((N, 2)) for k in ("drums", "music", "stab", "fx", "voice")}


def note(name):
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3,
             "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    return 440.0 * 2 ** ((names[name[:-1]] + (int(name[-1]) - 4) * 12) / 12)


def pan2(sig, pan):
    if sig.ndim == 2:
        return sig
    return np.stack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)], 1)


def tail(sig, ms=12):
    n = min(len(sig), int(ms * SR / 1000))
    if n > 1:
        f = np.linspace(1, 0, n) ** 2
        sig = sig.copy()
        sig[-n:] = sig[-n:] * (f[:, None] if sig.ndim == 2 else f)
    return sig


def place(b, sig, t, gain=1.0, pan=0.0):
    sig = tail(sig)
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    s = pan2(sig, pan) * gain
    if i < 0:
        s, i = s[-i:], 0
    n = min(len(s), N - i)
    bus[b][i:i + n] += s[:n]


def sos(kind, f, order=2):
    return butter(order, f, kind, fs=SR, output="sos")


def lp(x, f, o=2): return sosfilt(sos("low", f, o), x, axis=0)
def hp(x, f, o=2): return sosfilt(sos("high", f, o), x, axis=0)
def bp(x, lo, hi, o=2): return sosfilt(sos("band", [lo, hi], o), x, axis=0)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


# ---------------------------------------------------------------- instruments
def kick(g=1.0, phone=True):
    if phone:  # a parallel saturated copy with 100-400 Hz harmonics so the beat survives phone speakers
        return kick(g, False) + 0.22 * np.tanh(hp(kick(g, False), 100) * 4) * g
    t = tt(0.5)
    f = 48 + 95 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = lp(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.3) * g


def rim():
    t = tt(0.12)
    s = np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012) + bp(rng.standard_normal(len(t)), 2000, 6000) * np.exp(-t / 0.006) * 0.6
    return s * 0.5


def shaker(acc=1.0):
    t = tt(0.09)
    env = np.minimum(t / 0.012, 1) * np.exp(-t / 0.03)
    return bp(rng.standard_normal(len(t)), 5000, 11000) * env * acc


def epiano(freq, dur=1.2, vel=1.0):
    """FM electric piano: 1:1 carrier/modulator with a decaying index + a tine partial."""
    t = tt(dur)
    idx = 1.6 * vel * np.exp(-t / 0.25) + 0.2
    mod = np.sin(2 * np.pi * freq * t) * idx
    s = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / 0.9)
    s += 0.18 * np.sin(2 * np.pi * freq * 7.1 * t) * np.exp(-t / 0.05) * vel
    return s * np.minimum(t / 0.003, 1) * 0.35


def chord(names, dur=1.2, vel=1.0, spread=0.6):
    out = np.zeros((int(dur * SR), 2))
    for k, nm in enumerate(names):
        p = (k / max(1, len(names) - 1) - 0.5) * spread
        out += pan2(epiano(note(nm), dur, vel), p)
    return out


def pad(names, dur, cutoff=1600, attack=0.4):
    t = tt(dur)
    out = np.zeros((len(t), 2))
    for nm in names:
        f = note(nm)
        for k, d in enumerate((-0.005, 0.0, 0.006)):
            ph = (t * f * (1 + d)) % 1.0
            out += pan2(2 * ph - 1, (k - 1) * 0.7)
    out = lp(out, cutoff)
    env = np.minimum(t / attack, 1) * np.minimum((dur - t) / 0.3, 1).clip(0, 1)
    return out * env[:, None] / (len(names) * 3)


def sub(freq, dur):
    t = tt(dur)
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t) + 0.15 * np.sin(6 * np.pi * freq * t)
    return np.tanh(s * 2.2) / np.tanh(2.2) * np.minimum(t / 0.005, 1) * np.exp(-t / 0.6)


def pluck(freq, dur=0.35):
    t = tt(dur)
    s = sum(np.sin(2 * np.pi * freq * h * t) / h * np.exp(-t * (6 + 6 * h)) for h in range(1, 7))
    return s * np.minimum(t / 0.002, 1) * 0.4


def shimmer(names, dur=2.0):
    t = tt(dur)
    s = np.zeros(len(t))
    for k, nm in enumerate(names):
        f = note(nm) * 2
        s += np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 5.5 * t + k)) * 0.5
    env = np.minimum(t / 0.6, 1) * np.exp(-np.clip(t - 0.6, 0, None) / 0.8)
    return pan2(s * env * 0.12, 0.0) + pan2(np.roll(s, 900) * env * 0.08, 0.6)


def whoosh(dur, f0=300, f1=7000, shape="rise"):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    fr = np.geomspace(f0, f1, (n + blk - 1) // blk)
    for b in range(len(fr)):
        a, e = b * blk, min(n, (b + 1) * blk)
        lo, hi = fr[b] * 0.7, min(fr[b] * 1.4, SR / 2 - 200)
        out[a:e] = bp(x[max(0, a - 2048):e], lo, hi)[-(e - a):]
    u = t / dur
    env = u ** 2.2 if shape == "rise" else np.sin(np.pi * u) ** 2
    pan = np.linspace(-0.7, 0.7, n)
    return np.stack([out * env * np.cos((pan + 1) * np.pi / 4), out * env * np.sin((pan + 1) * np.pi / 4)], 1)


def swell(names, dur):
    """reversed pad: a breath in toward a downbeat"""
    p = pad(names, dur, 3000, attack=0.01)
    return p[::-1] * np.linspace(0, 1, len(p))[:, None] ** 2


def impact(g=1.0, size=1.0):
    t = tt(2.0)
    f = 44 + 70 * np.exp(-t / 0.07)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.45 * size))
    air = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / (0.35 * size)) * 0.12
    return np.tanh((boom + air) * 1.2) * g


def hat_open():
    t = tt(0.25)
    return hp(rng.standard_normal(len(t)), 7000, 4) * np.exp(-t / 0.08)


def rev_cymbal(dur=0.5):
    t = tt(dur)
    s = hp(rng.standard_normal(len(t)), 5000) * np.exp(-t / 0.18)
    return s[::-1] * 0.6


def air(dur=0.25, tau=0.05):
    """bright, fast transient: makes a visual hit audible within a frame"""
    t = tt(dur)
    return hp(rng.standard_normal(len(t)), 3500) * np.minimum(t / 0.0008, 1) * np.exp(-t / tau)


def clap():
    t = tt(0.3)
    noise = bp(rng.standard_normal(len(t)), 900, 5000)
    e = sum((t >= o) * np.exp(-np.clip(t - o, 0, None) / 0.006) for o in (0, 0.01, 0.02))
    e = e + (t >= 0.025) * np.exp(-np.clip(t - 0.025, 0, None) / 0.09) * 0.6
    return noise * e * 0.7


def chime(freq, dur=1.4):
    t = tt(dur)
    s = (np.sin(2 * np.pi * freq * t) * np.exp(-t * 2.5) + 0.4 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6)
         + 0.2 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 10))
    return s * np.minimum(t / 0.002, 1) * 0.35


# ---------------------------------------------------------------- harmony
PROG = {  # one chord per bar (2s): Dmaj9 – Bm11 – Gmaj7 – A6sus
    0: ["D3", "F#3", "A3", "C#4", "E4"],
    1: ["B2", "D3", "F#3", "A3", "E4"],
    2: ["G2", "B2", "D3", "F#3", "A3"],
    3: ["A2", "C#3", "E3", "F#3", "B3"],
}
ROOT_NOTE = {0: "D2", 1: "B1", 2: "G1", 3: "A1"}


def bar_of(t):
    return int(t // (4 * BEAT)) % 4


C = CUES
S = C["slams"]
T = C["themes"]
side = np.ones(N)


def duck(t, depth=0.7, rel=0.12):
    i = int(t * SR)
    m = min(int(0.35 * SR), N - i)
    if m > 0:
        side[i:i + m] = np.minimum(side[i:i + m], 1 - depth * np.exp(-np.arange(m) / SR / rel))


# --- 0-2: the wake: voice slot at 0.12, chime when "Veda." lands, ignition on 1.0
place("music", pad(["D3", "A3", "E4"], 2.2, 900, attack=1.2) * 0.35, 0.0, 0.8)
place("fx", chime(note("A5")), 0.75, 0.6, pan=0.1)
place("fx", swell(PROG[0], 0.9), C["ignite"] - 0.9, 0.9)
place("fx", impact(0.8, 1.2), C["ignite"], 0.8)
place("fx", air(0.4, 0.08), C["ignite"], 0.4)
place("music", shimmer(["D5", "F#5", "A5", "C#6"], 0.95), C["ignite"], 1.0)
place("stab", chord(["D4", "F#4", "A4", "C#5", "E5"], 0.95, 0.9), C["ignite"], 0.9)


# --- groove. States: layers enter one by one (kick+sub 2.0, shaker 4.0, rim 6.0).
#     After the drop: the full kit — clap on 2 and 4, an 8th-note pluck arp, octave chords on downbeats.
def groove(t0, t1, drop=False):
    n0, n1 = int(round(t0 / BEAT)), int(round(t1 / BEAT))
    for n in range(n0, n1):
        t = n * BEAT
        place("drums", kick(), t, 0.9)
        duck(t)
        if n % 2 == 1 and (drop or t >= 5.0):
            place("drums", clap() if drop else rim(), t, 0.6 if drop else 0.55, pan=0.05)
        if drop or t >= 3.0:
            for k in range(4):
                place("drums", shaker(1.0 if k == 2 else 0.55), t + k * BEAT / 4, 0.34, pan=0.35 * (-1) ** k)
        if drop:  # top layer after the drop: off-beat open hat
            place("drums", hat_open(), t + BEAT / 2, 0.22, pan=-0.2)
    for b0 in np.arange(t0, t1 - 1e-6, 4 * BEAT):
        bi = bar_of(b0)
        Lb = min(4 * BEAT, t1 - b0)
        place("music", pad(PROG[bi], Lb + 0.2, 1900, attack=0.05) * 0.8, b0, 1.0)
        for e in range(int(round(Lb / BEAT))):  # sub on the off-beats
            place("music", sub(note(ROOT_NOTE[bi]), BEAT * 0.9), b0 + e * BEAT + BEAT / 2, 0.55)
        if not drop and b0 >= 2.0:  # mid-register 8th figure: carries on a phone speaker
            tones = PROG[bi][1:]
            for j in range(int(round(Lb / (BEAT / 2)))):
                place("music", epiano(note(tones[(j * 2) % len(tones)]) * 2, 0.3, 0.5), b0 + j * BEAT / 2, 0.16, pan=0.3 * (-1) ** j)
        if drop:
            tones = PROG[bi][1:]
            for j in range(int(round(Lb / (BEAT / 2)))):
                place("music", pluck(note(tones[j % len(tones)]) * 2), b0 + j * BEAT / 2, 0.32, pan=0.5 * (-1) ** j)
            place("stab", chord([n[:-1] + str(int(n[-1]) + 1) for n in PROG[bi][1:4]], 1.0, 0.9, 0.9), b0, 0.75)


groove(2.0, C["stop"])
groove(C["drop"], C["collapse"], drop=True)
place("drums", kick(1.0), C["collapse"], 0.9)  # the groove ends ON the bar
place("fx", air(0.5, 0.15), C["collapse"], 0.3)
place("fx", impact(0.5, 0.6), 2.0, 0.6)          # the groove's entry is a hit
place("fx", air(0.3, 0.06), 2.0, 0.3)

# state cues (2-8s): one signature per state, on the un-ducked stab bus, each with an air transient
sig = {
    "idle": lambda t: (place("stab", pluck(note("D4"), 0.6), t, 1.0), place("stab", pluck(note("D5"), 0.5), t, 0.5)),
    "listening": lambda t: (place("stab", pluck(note("A4"), 0.4), t, 0.9), place("stab", pluck(note("D5"), 0.4), t + 0.06, 0.8)),
    "thinking": lambda t: [place("stab", pluck(note("F#5"), 0.12), t + k * BEAT / 4, 0.5) for k in range(3)],
    "speaking": lambda t: None,  # the voice is the cue ("I'm here.")
    "researching": lambda t: place("stab", chord(["A4", "E5", "B5"], 0.9, 0.9, 1.6), t, 0.8),
    "focus": lambda t: (place("stab", kick(0.6)[:int(0.08 * SR)], t, 0.5),
                        place("stab", chord(["D4", "A4"], 0.6, 0.8, 0.2), t, 0.8)),
}
for name, t in C["states"].items():
    sig[name](t)
    place("fx", air(0.25, 0.04), t, 0.25)
    place("fx", whoosh(0.18, 2000, 9000, "rise"), t - 0.18, 0.12)

# pull back into the app window: a rise that peaks BEFORE the slam, then the slam is a fresh hit
place("fx", whoosh(1.5, 200, 9000), C["pullback"], 0.4)
place("stab", chord(["F#4", "A4", "D5"], 0.8, 0.8, 0.6), C["category"], 0.7)
place("fx", air(0.3, 0.05), C["category"], 0.3)
place("fx", swell(PROG[0], 1.0), S["talks"] - 1.0, 0.6)

# feature slams: chord on the stab bus + air + a rise that ENDS on the hit
slam_chords = [["D4", "F#4", "A4", "E5"], ["B3", "D4", "F#4", "A4"], ["G3", "B3", "D4", "F#4"],
               ["A3", "C#4", "E4", "B4"], ["D4", "F#4", "A4", "C#5"], ["B3", "D4", "F#4", "A4"]]
for k, (name, t) in enumerate(S.items()):
    place("stab", chord(slam_chords[k], 1.0, 1.0, 0.8), t, 0.9)
    place("fx", air(0.3, 0.05), t, 0.35)
    place("fx", whoosh(0.25, 1500, 9000, "rise"), t - 0.25, 0.22)
    if name not in ("talks", "stops"):  # keep the space clear under Veda's lines
        for j, nm in enumerate(slam_chords[k][1:]):
            place("music", pluck(note(nm) * 2), t + 0.25 + j * BEAT / 2, 0.22, pan=(j - 1) * 0.4)
place("fx", impact(0.6, 0.8), S["talks"], 0.7)

# the bed closes down into the Stop (12 kHz -> 2 kHz), so the drop opens it back up
_a, _b = int(17.5 * SR), int(C["stop"] * SR)
for b in ("music", "stab"):
    seg = bus[b][_a:_b].copy()
    out = np.zeros_like(seg)
    blkn = 2048
    for j in range(0, len(seg), blkn):
        fc = 12000 * (2000 / 12000) ** (j / max(1, len(seg)))
        pre = max(0, j - 4096)
        out[j:j + blkn] = lp(seg[pre:j + blkn], fc)[j - pre:j - pre + blkn]
    bus[b][_a:_b] = out
# STOP: everything cuts at the stop — a dry kill, one beat of true silence, then the drop
g0, g1 = int(C["stop"] * SR), int(C["drop"] * SR)
for b in ("drums", "music", "stab", "fx"):
    bus[b][g0:g1] *= np.linspace(1, 0, g1 - g0)[:, None] ** 40
    bus[b][g1 - int(0.002 * SR):g1] *= 0
kill = kick(1.0)[:int(0.09 * SR)] * np.linspace(1, 0, int(0.09 * SR)) ** 2
place("fx", kill, C["stop"], 0.8)
place("fx", air(0.06, 0.012), C["stop"], 0.35)
place("fx", swell(PROG[0], 0.1)[:int(0.1 * SR)] * 0.6, C["drop"] - 0.1, 0.5)  # a 100 ms inhale into the drop
place("fx", impact(0.9, 1.0), C["drop"], 0.9)
place("fx", air(0.4, 0.08), C["drop"], 0.4)

# theme flips: the burst happens ON the beat (whoosh rises into it), plus a pill "click"
for k, (name, t) in enumerate(T.items()):
    if t > C["drop"] + 0.01:
        place("fx", whoosh(0.4, 600, 12000, "rise"), t - 0.4, 0.3)
    place("fx", air(0.3, 0.05), t, 0.3)
    place("stab", pluck(note(["F#5", "A5", "C#6"][k]), 0.3), t, 0.5)
    if t > C["drop"] + 0.01:
        place("fx", rev_cymbal(0.5), t - 0.5, 0.5)
        place("fx", impact(0.45, 0.5), t, 0.5)
    place("music", shimmer([["F#5", "A5"], ["A5", "C#6"], ["D5", "F#5"]][k], 1.8), t, 0.9)

# collapse: rising sweep + rising orb tone into the end card; a tick where the chrome cuts out
place("fx", whoosh(1.0, 300, 11000), C["collapse"], 0.45)
_tt = tt(1.0)
place("fx", np.sin(2 * np.pi * np.cumsum(220 * 2 ** (_tt * 2)) / SR) * (_tt ** 2) * 0.12, C["collapse"], 1.0)
place("fx", air(0.12, 0.02), C["collapse"] + 0.5, 0.35)
# collapse into a point, then the end card
place("fx", swell(["D3", "A3", "D4", "F#4"], 1.0), C["endcard"] - 1.0, 0.9)
place("fx", impact(1.0, 1.6), C["endcard"], 0.95)
place("music", pad(["D3", "A3", "C#4", "E4", "F#4", "A4"], DUR - C["endcard"], 2600, attack=0.02) * 1.1, C["endcard"], 1.0)
place("stab", chord(["D4", "F#4", "A4", "C#5", "E5", "A5"], 3.5, 1.0, 1.0), C["endcard"], 0.9)
place("fx", air(0.3, 0.05), C["tagline"], 0.3)
place("stab", pluck(note("A5"), 0.6), C["tagline"], 0.7)
for tb in (28.0, 29.0):
    place("stab", pluck(note("A4"), 0.6), tb, 0.35)
for k, nm in enumerate(["A5", "C#6", "E6", "F#6"]):
    place("fx", chime(note(nm), 2.0), C["tagline"] + k * BEAT / 2, 0.22, pan=0.3 - k * 0.2)

# ---------------------------------------------------------------- voice stems (optional)
env_frames = np.zeros(int(DUR * 60))
voices_found = []
lines = {}
for v in C["voice"]:
    path = os.path.join(HERE, "voice", v["id"] + ".wav")
    if not os.path.exists(path):
        continue
    x, sr = sf.read(path, always_2d=True)
    x = x.mean(1)
    if sr != SR:
        x = resample_poly(x, SR, sr)
    x = hp(x, 90)
    if v["who"] == "veda" and v["at"] < C["stop"] < v["at"] + len(x) / SR:
        cut = int((C["stop"] - v["at"]) * SR)  # the kill switch: Veda stops mid-word
        x = x[:cut] * np.concatenate([np.ones(max(0, cut - 240)), np.linspace(1, 0, min(240, cut))])
    voices_found.append(v["id"])
    lines[v["id"]] = {"at": v["at"], "dur": round(len(x) / SR, 3)}
    if v["id"] == "talks" and v["at"] + len(x) / SR > S["remembers"] - 0.1:
        print(f"WARNING: the Talks reply runs to {v['at'] + len(x) / SR:.2f}s — over the Remembers cut; re-render it faster")
    if v["who"] == "veda":  # orb drives off the raw voice, like the product (fixed reference, not normalised)
        i0 = int(v["at"] * 60)
        hopn = SR // 60
        for f in range(len(x) // hopn):
            if 0 <= i0 + f < len(env_frames):
                seg = x[f * hopn:(f + 1) * hopn]
                env_frames[i0 + f] = max(env_frames[i0 + f], min(1.0, np.sqrt(np.mean(seg ** 2)) / 0.18))
    lv = pyln.Meter(SR, block_size=0.2).integrated_loudness(np.stack([x, x], 1)) if len(x) > SR * 0.25 else -20
    place("voice", x * 10 ** ((-10 - lv) / 20), v["at"], 1.0, pan=0.0)  # each line sits at the same loudness
if len(voices_found) < len(C["voice"]):
    print(f"WARNING: voice stems missing ({len(C['voice']) - len(voices_found)} of {len(C['voice'])}) — "
          "render them on the Mac with audio/make_voice.py before the final mix")

# duck everything under the voice: a 1 ms control-rate gate with 40 ms look-ahead (no pumping, no NaN)
vabs = np.abs(bus["voice"]).max(1)
blk = int(SR / 1000)
nb = N // blk
g = (vabs[:nb * blk].reshape(nb, blk).max(1) > 10 ** (-45 / 20)).astype(float)
g = np.concatenate([g[40:], np.zeros(40)])
env = np.zeros(nb)
for i in range(1, nb):
    a = 1 - np.exp(-1 / (15 if g[i] > env[i - 1] else 100))
    env[i] = env[i - 1] + a * (g[i] - env[i - 1])
HITS = [C["ignite"], C["category"], *C["states"].values(), *S.values(), C["stop"], C["drop"], *T.values(), C["collapse"], C["endcard"], C["tagline"]]
for h in HITS:  # hits are never ducked: release fully 30 ms before every cue, hold through its attack
    i0, i1 = max(0, int((h - 0.03) * 1000)), min(nb, int((h + 0.12) * 1000))
    env[i0:i1] = 0
vduck = np.repeat(10 ** (-6 * env / 20), blk)
vduck = np.concatenate([vduck, np.full(N - len(vduck), vduck[-1] if len(vduck) else 1.0)])

# ---------------------------------------------------------------- mix
tline = np.arange(N) / SR
arc_db = np.interp(tline, [0, 2, 7.9, 9.9, 18.5, 18.99, 19.0, 25.0, 25.01, DUR], [0, -2, -1, 0, 0.5, 0.5, 2.5, 3.5, 0.5, 0.5])
bed = ((bus["drums"] * 0.9 + bus["music"] * (side[:, None] * 0.6 + 0.4)) * vduck[:, None] + bus["stab"] + bus["fx"]) * 10 ** (arc_db / 20)[:, None]
ir_n = int(1.6 * SR)
ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / SR / 0.45)[:, None]
ir = lp(ir, 5000)
wet = np.stack([fftconvolve(bed[:, c], ir[:, c])[:N] for c in range(2)], 1)
wet /= np.max(np.abs(wet)) + 1e-9
gc0, gc1 = int(C["stop"] * SR), int(C["drop"] * SR) - int(0.05 * SR)
wet[gc0:gc1] *= np.linspace(1, 0, gc1 - gc0)[:, None] ** 40  # the silence after "Stop" is really silent
wet[gc1:int(C["drop"] * SR)] *= 0
mix = bed + wet * np.max(np.abs(bed)) * 0.14 + bus["voice"]
mix = hp(mix, 30, 4)
mix -= mix.mean(0)
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = np.tanh(mix / (np.max(np.abs(mix)) + 1e-9) * 1.3)
meter = pyln.Meter(SR)
CEIL = 10 ** (-1 / 20)
for _ in range(5):
    mix *= 10 ** ((-14.0 - meter.integrated_loudness(mix)) / 20)
    tp = np.abs(resample_poly(mix, 4, 1, axis=0)).max()  # true peak, not sample peak
    if tp > CEIL:
        mix = np.tanh(mix / CEIL * 0.98) * CEIL * 0.98
sf.write(os.path.join(HERE, "c.wav"), mix.astype(np.float32), SR, subtype="PCM_24")
json.dump({"fps": 60, "rms": [round(float(v), 3) for v in env_frames], "voices": voices_found, "lines": lines},
          open(os.path.join(HERE, "envelope.json"), "w"))
tp = np.abs(resample_poly(mix, 4, 1, axis=0)).max()
print(json.dumps({"lufs": round(meter.integrated_loudness(mix), 2), "true_peak_dbtp": round(20 * np.log10(tp), 2),
                  "voices": voices_found}))
