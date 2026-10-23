"""Sustained-vowel check: the same voice-quality measures on a held "aah"
(4 s), the standard clinical task, instead of running speech.

    python -I sustained_vowel.py OUT_JSON
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import synth  # noqa: E402
from voice_quality import praat_quality  # noqa: E402

FS = 16000


def vowel(jitter, shimmer, tremor_cents, seed, f0=110.0, dur=4.0):
    rng = np.random.default_rng(seed)
    n = int(dur * FS)
    t = np.arange(n) / FS
    track = f0 * 2 ** ((tremor_cents / 1200) * np.sin(2 * np.pi * 5.5 * t))
    src, _ = synth.glottal_source(track, rng, jitter=jitter, shimmer=shimmer)
    v = synth.vocal_tract(src, "a", False)
    env = synth.envelope(n, 0.1, 0.2)
    v = v / np.sqrt(np.mean(v ** 2)) * env * 10 ** (-24 / 20)
    return np.concatenate([np.zeros(FS // 2), v, np.zeros(FS // 2)])


def tremor_from_praat(x):
    import parselmouth
    p = parselmouth.Sound(x, sampling_frequency=FS).to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=500)
    f = p.selected_array["frequency"]
    f = f[f > 0]
    st = 12 * np.log2(f / np.median(f))
    st = st - np.polyval(np.polyfit(np.arange(len(st)), st, 2), np.arange(len(st)))
    spec = np.abs(np.fft.rfft(st * np.hanning(len(st)))) ** 2
    freqs = np.fft.rfftfreq(len(st), 0.01)
    band = (freqs >= 4) & (freqs <= 8)
    peak = freqs[band][np.argmax(spec[band])]
    depth = np.sqrt(2) * np.std(st) * 100  # cents, peak of a sine with that SD
    return {"tremorShare": float(spec[band].sum() / spec[(freqs >= 1) & (freqs <= 15)].sum()), "peakHz": float(peak), "depthCents": float(depth)}


def main():
    out_json = sys.argv[1]
    workdir = os.path.dirname(out_json)
    rows = []
    for jit, shim, trem in [(0.003, 0.02, 0), (0.01, 0.02, 0), (0.02, 0.02, 0), (0.03, 0.02, 0),
                            (0.005, 0.08, 0), (0.005, 0.15, 0), (0.005, 0.03, 15), (0.005, 0.03, 40), (0.005, 0.03, 80)]:
        x = vowel(jit, shim, trem, seed=int(jit * 1000 + shim * 100 + trem))
        rng = np.random.default_rng(1)
        truth = {"kind": [1] * (len(x) // 160)}
        phone = synth.phone_chain(x, truth, rng, workdir, "sv")
        row = {"jitterSdPct": jit * 100, "shimmerSdPct": shim * 100, "tremorCents": trem,
               "clean": {**praat_quality(x), **tremor_from_praat(x)},
               "phone": {**praat_quality(phone), **tremor_from_praat(phone)}}
        rows.append(row)
        print(json.dumps({k: (round(v, 2) if isinstance(v, float) else v) for k, v in row.items() if k != "clean" and k != "phone"}),
              {c: {k: round(v, 2) for k, v in row[c].items()} for c in ("clean", "phone")}, flush=True)
    with open(out_json, "w") as f:
        json.dump(rows, f, indent=1)


if __name__ == "__main__":
    main()
