"""Measure the beat grid from audio/score.wav (spectral-flux onsets + autocorrelation tempo).

librosa-free: numpy only. Writes audio/beats.json:
  { bpm, period, phase, beats:[...], downbeats:[...], onsets:[{t, strength}] }
"""
import json
import os
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
x, sr = sf.read(os.path.join(HERE, "score.wav"))
mono = x.mean(1)
hop, win = 256, 1024
frames = 1 + (len(mono) - win) // hop
w = np.hanning(win)
spec = np.abs(np.stack([np.fft.rfft(mono[i * hop:i * hop + win] * w) for i in range(frames)]))
logspec = np.log1p(spec * 100)
flux = np.maximum(0, np.diff(logspec, axis=0)).sum(1)
flux = np.concatenate([[0], flux])
flux /= flux.max()
ft = (np.arange(frames) * hop + win / 2) / sr

# onsets: adaptive-threshold peak picking
k = 8
thr = np.array([np.median(flux[max(0, i - k):i + k]) for i in range(frames)]) + 0.08
onsets = []
for i in range(1, frames - 1):
    if flux[i] > thr[i] and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]:
        o = {"t": round(float(ft[i]), 4), "strength": round(float(flux[i]), 3)}
        if not onsets or ft[i] - onsets[-1]["t"] > 0.05:
            onsets.append(o)
        elif o["strength"] > onsets[-1]["strength"]:  # keep the stronger of two close onsets
            onsets[-1] = o

# tempo: autocorrelation of the onset envelope in the groove section (60-180 BPM)
fps = sr / hop
env = flux - flux.mean()
ac = np.correlate(env, env, "full")[len(env) - 1:]
lags = np.arange(len(ac)) / fps
mask = (lags > 60 / 180) & (lags < 60 / 60)
period = lags[mask][np.argmax(ac[mask])]
# refine with parabolic interpolation
i = np.where(mask)[0][np.argmax(ac[mask])]
a, b, c = ac[i - 1], ac[i], ac[i + 1]
period = (i + 0.5 * (a - c) / (a - 2 * b + c)) / fps
bpm = 60 / period
# snap to a clean tempo if within 0.5 BPM
if abs(bpm - round(bpm)) < 0.5:
    bpm = float(round(bpm))
    period = 60 / bpm

# phase: maximize onset energy on the grid
phases = np.linspace(0, period, 200, endpoint=False)
scores = [np.interp(np.arange(p, ft[-1], period), ft, flux).sum() for p in phases]
phase = float(phases[int(np.argmax(scores))])
if phase > period / 2:
    phase -= period
phase = round(phase, 4)
beats = [round(phase + n * period, 4) for n in range(int((ft[-1] - phase) / period) + 1) if phase + n * period >= 0]
out = {
    "bpm": round(bpm, 3),
    "period": round(period, 5),
    "phase": phase,
    "beats": beats,
    "downbeats": beats[::4],
    "onsets": onsets,
}
json.dump(out, open(os.path.join(HERE, "beats.json"), "w"), indent=1)
print(f"bpm={out['bpm']} phase={phase}s beats={len(beats)} onsets={len(onsets)}")
