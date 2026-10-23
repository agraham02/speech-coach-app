"""Scores every pitch tracker against the synthetic ground truth.

    python -I compare_pitch.py SYNTH_DIR PITCHFINDER_NODE_MODULES OUT_JSON

Python trackers: Praat autocorrelation (parselmouth), librosa pYIN, SwiftF0
(ONNX). JavaScript trackers come from jsTrackers.mjs (run here with node).
Writes per-signal, per-tracker metrics plus the contours (for the plots).
"""

import json
import os
import subprocess
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FMIN, FMAX = 60.0, 500.0


def py_trackers(x, fs=16000):
    out = {}
    import parselmouth
    t0 = time.process_time()
    snd = parselmouth.Sound(x, sampling_frequency=fs)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=FMIN, pitch_ceiling=FMAX)
    f = p.selected_array["frequency"]
    out["praat_ac"] = {"t": (p.xs() * 1000).tolist(), "f0": [float(v) if v > 0 else None for v in f],
                       "cpuMs": (time.process_time() - t0) * 1000}

    import librosa
    t0 = time.process_time()
    f0, vflag, vprob = librosa.pyin(x.astype(np.float32), fmin=FMIN, fmax=FMAX, sr=fs, frame_length=1024, hop_length=160, center=True)
    out["pyin"] = {"t": (np.arange(len(f0)) * 10.0).tolist(),
                   "f0": [float(v) if (ok and np.isfinite(v)) else None for v, ok in zip(f0, vflag)],
                   "cpuMs": (time.process_time() - t0) * 1000}

    from swift_f0 import SwiftF0
    det = SwiftF0(threads=1)
    t0 = time.process_time()
    r = det.detect(x.astype(np.float32), fs, fmin=FMIN, fmax=FMAX)
    out["swiftf0"] = {"t": (np.asarray(r.timestamps) * 1000).tolist(),
                      "f0": [float(v) if c >= 0.5 else None for v, c in zip(r.pitch_hz, r.confidence)],
                      "conf": [float(c) for c in r.confidence],
                      "cpuMs": (time.process_time() - t0) * 1000}
    return out


def js_trackers(path, pf_dir, jitless=False):
    env = dict(os.environ)
    cmd = ["node", "--no-warnings"]
    if jitless:
        # Type stripping needs WebAssembly, which --jitless turns off: strip
        # the tracker to plain JS first, next to the signals.
        stripped = os.path.join(os.path.dirname(path), "pitchTracker.stripped.mjs")
        subprocess.run(["node", "-e", "const fs=require('fs');fs.writeFileSync(process.argv[2],require('node:module').stripTypeScriptTypes(fs.readFileSync(process.argv[1],'utf8')))",
                        os.path.join(HERE, "..", "..", "..", "..", "src", "domain", "dsp", "pitchTracker.ts"), stripped], check=True)
        env["PITCH_TRACKER_MODULE"] = "file:///" + stripped.replace("\\", "/")
        cmd.append("--jitless")
    else:
        cmd.append("--experimental-strip-types")
    cmd += [os.path.join(HERE, "jsTrackers.mjs"), path, pf_dir]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True, cwd=HERE, env=env)
    return json.loads(res.stdout)


def score(tr, truth):
    hop_ms = truth["hop_s"] * 1000
    tf0 = truth["f0"]
    t = np.asarray(tr["t"], dtype=float)
    est = tr["f0"]
    v_hit = v_tot = u_fa = u_tot = gross = fine_n = 0
    cents_err = []
    est_voiced_vals = []
    for i, ti in enumerate(t):
        k = int(round((ti - hop_ms / 2) / hop_ms))
        if k < 0 or k >= len(tf0) or tf0[k] is None:
            if est[i] is not None:
                est_voiced_vals.append(est[i])
            continue
        e = est[i]
        if e is not None:
            est_voiced_vals.append(e)
        if tf0[k] > 0:
            v_tot += 1
            if e is not None:
                v_hit += 1
                c = 1200 * np.log2(e / tf0[k])
                if abs(e / tf0[k] - 1) > 0.2:
                    gross += 1
                else:
                    cents_err.append(abs(c))
                    if abs(c) < 50:
                        fine_n += 1
        else:
            u_tot += 1
            if e is not None:
                u_fa += 1
    vals = np.asarray(est_voiced_vals)
    stats = semitone_stats(vals)
    return {
        "voicingRecall": v_hit / v_tot if v_tot else None,
        "voicingFalseAlarm": u_fa / u_tot if u_tot else None,
        "grossErrorRate": gross / v_hit if v_hit else None,
        "rawPitchAcc50c": fine_n / v_tot if v_tot else None,
        "medianAbsCents": float(np.median(cents_err)) if cents_err else None,
        "voicedFrames": int(len(vals)),
        **stats,
        "hzRangeMaxMin": float(vals.max() - vals.min()) if len(vals) else None,
    }


def semitone_stats(vals):
    if len(vals) < 4:
        return {"sdSemitones": None, "rangeSemitones": None, "medianHz": None}
    med = float(np.median(vals))
    st = 12 * np.log2(vals / med)
    return {"sdSemitones": float(np.std(st)), "rangeSemitones": float(np.percentile(st, 90) - np.percentile(st, 10)), "medianHz": med}


def truth_stats(truth):
    vals = np.asarray([v for v in truth["f0"] if v])
    return {**semitone_stats(vals), "voicedFrameShare": float(len(vals) / len(truth["f0"]))}


def main():
    synth_dir, pf_dir, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
    manifest = json.load(open(os.path.join(synth_dir, "manifest.json")))
    results = {}
    for stem in manifest:
        path = os.path.join(synth_dir, stem + ".f32")
        truth = json.load(open(os.path.join(synth_dir, stem + ".truth.json")))
        x = np.fromfile(path, dtype=np.float32).astype(np.float64)
        trackers = {**({} if os.environ.get("SKIP_PY") else py_trackers(x)), **js_trackers(path, pf_dir)["trackers"]}
        entry = {"truth": truth_stats(truth), "durationS": len(x) / 16000, "trackers": {}}
        for name, tr in trackers.items():
            entry["trackers"][name] = {**score(tr, truth), "cpuMs": tr["cpuMs"]}
        # Keep contours for the plots, on the two showcase signals only.
        if stem.startswith(("male_normal__", "male_monotone__phone", "male_lively__phone", "libri1__")):
            entry["contours"] = {k: {"t": v["t"], "f0": v["f0"]} for k, v in trackers.items()}
            entry["truthF0"] = truth["f0"]
        results[stem] = entry
        print(stem, {k: round(v["voicingRecall"] or 0, 2) for k, v in entry["trackers"].items()}, flush=True)
    if os.environ.get("SKIP_PY"):
        json.dump(results, open(out_json, "w"))
        return
    # Interpreter-only timing (a stand-in for Hermes, which has no JIT).
    first = os.path.join(synth_dir, manifest[0] + ".f32")
    jit = js_trackers(first, pf_dir)
    nojit = js_trackers(first, pf_dir, jitless=True)
    results["_timing"] = {
        "signal": manifest[0],
        "durationS": jit["durationS"],
        "jitCpuMs": {k: v["cpuMs"] for k, v in jit["trackers"].items()},
        "jitlessCpuMs": {k: v["cpuMs"] for k, v in nojit["trackers"].items()},
    }
    with open(out_json, "w") as f:
        json.dump(results, f)


if __name__ == "__main__":
    main()
