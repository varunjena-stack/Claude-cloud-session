"""Render the film's spoken lines with Veda's real Kokoro voice — run this on the Mac where Veda lives.

    python3 audio/make_voice.py                      # Veda = af_heart, stand-in user voice = am_michael
    python3 audio/make_voice.py --veda af_bella --user am_adam
    python3 audio/make_voice.py --film c             # lines come from films/<film>/cues.json

Writes audio/voice/<id>.wav (24 kHz mono). Then re-run `python3 audio/score_c.py` and the score mixes them
in and derives the orb's speaking envelope from Veda's actual output (same idea as voice/tts.py::_rms_envelope).
Lines marked who=user are the viewer's voice: record yourself instead if you prefer (same file name, any rate).
"""
import argparse
import json
import os

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ap = argparse.ArgumentParser()
ap.add_argument("--film", default="c")
ap.add_argument("--veda", default="af_heart")
ap.add_argument("--user", default="am_michael")
ap.add_argument("--speed", type=float, default=1.0)
args = ap.parse_args()

try:  # the plain `kokoro` pip package (Veda's fallback backend)
    from kokoro import KPipeline
except ImportError as e:
    raise SystemExit("needs the kokoro package (pip install kokoro soundfile) — the one Veda already uses") from e

cues = json.load(open(os.path.join(ROOT, "films", args.film, "cues.json")))
os.makedirs(os.path.join(HERE, "voice"), exist_ok=True)
pipe = KPipeline(lang_code="a")
for v in cues["voice"]:
    voice = args.veda if v["who"] == "veda" else args.user
    chunks = [np.asarray(a) for _, _, a in pipe(v["text"], voice=voice, speed=args.speed)]
    audio = np.concatenate(chunks) if chunks else np.zeros(1)
    # trim leading/trailing silence so the cue time lands on the first syllable
    nz = np.where(np.abs(audio) > 0.01)[0]
    if len(nz):
        audio = audio[max(0, nz[0] - 240): nz[-1] + 2400]
    out = os.path.join(HERE, "voice", v["id"] + ".wav")
    sf.write(out, audio.astype(np.float32), 24000)
    print(f"{v['id']:<12} {voice:<11} {len(audio) / 24000:5.2f}s  {v['text']}")
