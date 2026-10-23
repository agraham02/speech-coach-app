"""Voice quality spike: can jitter, shimmer, HNR and tremor ("shakiness")
be measured from a phone recording of running speech?

    python -I voice_quality.py PITCHFINDER_NODE_MODULES OUT_JSON

Synthetic takes with known jitter / shimmer / tremor are measured with Praat
(parselmouth, the reference implementation; GPL, so offline only) on the
clean signal and after the phone chain (reverb, noise at 25 dB SNR, AAC).
Tremor is read from the proposed 10 ms pitch contour: the share of the
pitch-movement energy in the 4-8 Hz band, inside voiced runs.
"""

import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import synth  # noqa: E402

FS = 16000


def praat_quality(x):
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(x, sampling_frequency=FS)
    pp = call(snd, "To PointProcess (periodic, cc)", 60, 500)
    jitter = call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    shimmer = call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    harm = call(snd, "To Harmonicity (cc)", 0.01, 60, 0.1, 1.0)
    hnr = call(harm, "Get mean", 0, 0)
    return {"jitterPct": jitter * 100, "shimmerPct": shimmer * 100, "hnrDb": hnr}


def proposed_contour(x, pf_dir, workdir):
    path = os.path.join(workdir, "vq_tmp.f32")
    x.astype(np.float32).tofile(path)
    env = dict(os.environ, TRACKERS="proposed_yin")
    res = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "jsTrackers.mjs"), path, pf_dir],
                         capture_output=True, text=True, check=True, cwd=HERE, env=env)
    tr = json.loads(res.stdout)["trackers"]["proposed_yin"]
    return np.array([np.nan if v is None else v for v in tr["f0"]])


def tremor_index(f0, hop_s=0.01):
    """Share of pitch-movement power at 4-8 Hz inside voiced runs >= 320 ms."""
    band, total = 0.0, 0.0
    i = 0
    while i < len(f0):
        if np.isnan(f0[i]):
            i += 1
            continue
        j = i
        while j < len(f0) and not np.isnan(f0[j]):
            j += 1
        if (j - i) * hop_s >= 0.32:
            st = 12 * np.log2(f0[i:j] / np.median(f0[i:j]))
            st = st - np.polyval(np.polyfit(np.arange(len(st)), st, 2), np.arange(len(st)))
            n = 64
            spec = np.abs(np.fft.rfft(st * np.hanning(len(st)), n=max(n, len(st)))) ** 2
            freqs = np.fft.rfftfreq(max(n, len(st)), hop_s)
            band += spec[(freqs >= 4) & (freqs <= 8)].sum()
            total += spec[(freqs >= 1.5) & (freqs <= 15)].sum()
        i = j
    return band / total if total > 0 else None


def main():
    pf_dir, out_json = sys.argv[1], sys.argv[2]
    workdir = os.path.dirname(out_json)
    res = {"jitter": [], "shimmer": [], "tremor": []}
    for jit in (0.003, 0.01, 0.02, 0.03):
        x, truth = synth.make_take(seed=31, accent_st=3.0, accent_db=3.5, jitter=jit, shimmer=0.04, phrases=6)
        rng = np.random.default_rng(3)
        phone = synth.phone_chain(x, truth, rng, workdir, "vq_j")
        res["jitter"].append({"trueJitterPct": jit * 100, "clean": praat_quality(x), "phone": praat_quality(phone)})
        print("jitter", jit, res["jitter"][-1], flush=True)
    for shim in (0.02, 0.08, 0.15):
        x, truth = synth.make_take(seed=32, accent_st=3.0, accent_db=3.5, jitter=0.005, shimmer=shim, phrases=6)
        rng = np.random.default_rng(4)
        phone = synth.phone_chain(x, truth, rng, workdir, "vq_s")
        res["shimmer"].append({"trueShimmerSdPct": shim * 100, "clean": praat_quality(x), "phone": praat_quality(phone)})
        print("shimmer", shim, res["shimmer"][-1], flush=True)
    for cents in (0, 15, 40, 80):
        x, truth = synth.make_take(seed=33, accent_st=3.0, accent_db=3.5, tremor_hz=5.5, tremor_cents=cents, phrases=8)
        rng = np.random.default_rng(5)
        phone = synth.phone_chain(x, truth, rng, workdir, "vq_t")
        res["tremor"].append({
            "tremorCents": cents,
            "clean": tremor_index(proposed_contour(x, pf_dir, workdir)),
            "phone": tremor_index(proposed_contour(phone, pf_dir, workdir)),
        })
        print("tremor", cents, res["tremor"][-1], flush=True)
    with open(out_json, "w") as f:
        json.dump(res, f, indent=1)


if __name__ == "__main__":
    main()
