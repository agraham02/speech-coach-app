"""Real read speech (LibriSpeech clips shipped as librosa examples, public
domain LibriVox recordings) in the same layout as synth.py, so
compare_pitch.py can score it.

There is no true f0 for real speech. The reference is the consensus of two
established trackers on the CLEAN clip: Praat autocorrelation and librosa
pYIN. Frames where both say voiced and agree within 50 cents get that pitch;
frames where both say unvoiced are unvoiced; the rest are not scored. The
same reference is used for the degraded ("phone") copy.

    LIBROSA_DATA_DIR=... python -I prep_real.py OUT_DIR
"""

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth  # noqa: E402

FS = 16000


def consensus(x):
    import librosa
    import parselmouth
    p = parselmouth.Sound(x, sampling_frequency=FS).to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=500)
    praat_t = p.xs()
    praat_f = p.selected_array["frequency"]
    f0, vflag, _ = librosa.pyin(x.astype(np.float32), fmin=60, fmax=500, sr=FS, frame_length=1024, hop_length=160, center=True)
    n = int(len(x) / FS / 0.01)
    out = []
    for i in range(n):
        tc = i * 0.01 + 0.005
        j = int(np.argmin(np.abs(praat_t - tc))) if len(praat_t) else -1
        a = praat_f[j] if j >= 0 and abs(praat_t[j] - tc) < 0.006 else 0.0
        k = int(round(tc / 0.01))
        b = f0[k] if k < len(f0) and vflag[k] and np.isfinite(f0[k]) else 0.0
        if a > 0 and b > 0:
            out.append(float(np.sqrt(a * b)) if abs(1200 * np.log2(a / b)) < 50 else None)
        elif a == 0 and b == 0:
            out.append(0.0)
        else:
            out.append(None)
    return out


def main():
    import librosa
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    manifest = []
    for key in ["libri1", "libri2", "libri3"]:
        y, _ = librosa.load(librosa.ex(key), sr=FS, mono=True)
        y = y.astype(np.float64)
        # Normalise the active level to -24 dBFS, like the iPhone samples.
        frame = 320
        e = np.array([np.mean(y[i:i + frame] ** 2) for i in range(0, len(y) - frame, frame)])
        active = e > np.percentile(e, 30)
        y = y / np.sqrt(np.mean(e[active])) * 10 ** (-24 / 20)
        f0 = consensus(y)
        truth = {"hop_s": 0.01, "f0": f0, "kind": [1 if (v or 0) > 0 else 0 for v in f0], "level_db": [None] * len(f0)}
        rng = np.random.default_rng(7)
        mask = np.repeat(active, frame)
        mask = np.pad(mask, (0, max(0, len(y) - len(mask))))[: len(y)]
        noisy = synth.add_noise(synth.add_reverb(y, 0.35, rng), 25, rng, mask)
        variants = {"clean": y, "phone": synth.aac_roundtrip(synth.highpass(noisy), out_dir, key)}
        for cond, sig in variants.items():
            stem = f"{key}__{cond}"
            sig.astype(np.float32).tofile(os.path.join(out_dir, stem + ".f32"))
            with open(os.path.join(out_dir, stem + ".truth.json"), "w") as f:
                json.dump({**truth, "take": key, "condition": cond, "fs": FS}, f)
            manifest.append(stem)
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f)
    print("wrote", manifest)


if __name__ == "__main__":
    main()
