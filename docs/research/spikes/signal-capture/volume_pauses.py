"""Volume and pause spike: the current measures against known truth.

    python -I volume_pauses.py SILERO_ONNX OUT_JSON

Volume. The synthetic takes know every syllable's intended level, so the
true loudness dynamics are known (the SD of syllable levels, in dB). The
current app measure (SD of 200 ms bucket dBFS over the whole take, silence
included) is compared with speech-only measures, and with the same take
re-made with longer pauses (identical voice, more silence).

Pauses. Frames are scored against the true speech/pause layout, with breaths
added inside long pauses and a background talker condition, for: the current
energy gate (domain/dsp/pauses.ts, ported line for line), an energy gate with
hysteresis, and Silero VAD v6 (ONNX).
"""

import json
import os
import sys
import time

import numpy as np
from scipy.signal import butter, sosfilt, find_peaks

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth  # noqa: E402

FS = 16000


# ---------------------------------------------------------------- volume

def current_volume(x):
    """audioAnalysis.ts: 200 ms buckets, RMS -> dBFS floored at -60, mean and SD."""
    per = int(0.2 * FS)
    db = []
    for s in range(0, len(x), per):
        b = x[s:s + per]
        r = np.sqrt(np.mean(b ** 2))
        db.append(max(20 * np.log10(max(r, 1e-6)), -60))
    db = np.array(db)
    return {"avgDbfs": float(db.mean()), "sdDb": float(db.std())}


def frame_db(x, frame_ms=10):
    n = int(FS * frame_ms / 1000)
    m = len(x) // n
    e = np.mean(x[: m * n].reshape(m, n) ** 2, axis=1)
    return 10 * np.log10(np.maximum(e, 1e-12))


def proposed_volume(x, speech_mask_10ms):
    """Speech frames only, relative to the take's median speech level.

    - spreadDb: p90 - p10 of 50 ms speech loudness (dynamic range while talking)
    - syllablePeakSdDb: SD of syllable-peak levels (emphasis variation)
    - snrDb: median speech level over the noise floor (how clearly the voice
      stands out; the closest we can get to projection without calibration)
    """
    db10 = frame_db(x, 10)
    n = min(len(db10), len(speech_mask_10ms))
    db10, mask = db10[:n], np.asarray(speech_mask_10ms[:n], dtype=bool)
    # 50 ms moving average in the power domain.
    p = 10 ** (db10 / 10)
    k = np.ones(5) / 5
    db50 = 10 * np.log10(np.maximum(np.convolve(p, k, mode="same"), 1e-12))
    speech = db50[mask]
    if len(speech) < 50:
        return None
    med = np.median(speech)
    floor = np.percentile(db10, 5)
    peaks, _ = find_peaks(np.where(mask, db50, -120), distance=12, prominence=3)
    peak_levels = db50[peaks]
    peak_levels = peak_levels[peak_levels > med - 12]
    return {
        "speechMedianDbfs": float(med),
        "spreadDb": float(np.percentile(speech, 90) - np.percentile(speech, 10)),
        "syllablePeakSdDb": float(np.std(peak_levels)) if len(peak_levels) > 4 else None,
        "snrDb": float(med - floor),
    }


def truth_dynamics(truth):
    """SD of the intended syllable levels (one value per syllable run)."""
    levels = truth["level_db"]
    runs, prev = [], None
    for v in levels:
        if v is not None and v != prev:
            runs.append(v)
        prev = v
    return float(np.std(runs)) if runs else None


# ---------------------------------------------------------------- pauses

def current_pauses(x, words=None):
    """domain/dsp/pauses.ts, line for line (no words: kinds are unknown)."""
    db = frame_db(x, 20)
    db = np.maximum(db, -100)
    thr = max(-45.0, float(np.sort(db)[min(len(db) - 1, int(0.1 * len(db)))]) + 8.0)
    voiced = db > thr
    return voiced_to_pauses(voiced, 20), np.repeat(voiced, 2)


def hysteresis_pauses(x):
    db = frame_db(x, 10)
    floor = np.percentile(db, 10)
    on, off = floor + 12, floor + 6
    speech = np.zeros(len(db), dtype=bool)
    state, hang = False, 0
    for i, v in enumerate(db):
        if v > on:
            state, hang = True, 8
        elif v < off:
            if hang > 0:
                hang -= 1
            else:
                state = False
        speech[i] = state
    return voiced_to_pauses(speech, 10), speech


class Silero:
    def __init__(self, path):
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])

    def probs(self, x):
        state = np.zeros((2, 1, 128), dtype=np.float32)
        context = np.zeros((1, 64), dtype=np.float32)
        sr = np.array(FS, dtype=np.int64)
        out = []
        x = x.astype(np.float32)
        for s in range(0, len(x) - 512 + 1, 512):
            chunk = np.concatenate([context, x[None, s:s + 512]], axis=1)
            p, state = self.sess.run(None, {"input": chunk, "state": state, "sr": sr})
            context = chunk[:, -64:]
            out.append(float(p[0][0]))
        return np.array(out)  # one per 32 ms


def silero_pauses(model, x):
    t0 = time.process_time()
    pr = model.probs(x)
    cpu = (time.process_time() - t0) * 1000
    speech = np.zeros(len(pr), dtype=bool)
    state = False
    for i, p in enumerate(pr):
        if p >= 0.5:
            state = True
        elif p < 0.35:
            state = False
        speech[i] = state
    # Expand to 10 ms frames.
    speech10 = np.repeat(speech, 32)[:: 10]
    return voiced_to_pauses(speech10, 10), speech10, cpu


def voiced_to_pauses(voiced, frame_ms, min_ms=300):
    idx = np.flatnonzero(voiced)
    if len(idx) == 0:
        return []
    first, last = idx[0], idx[-1]
    pauses, start = [], None
    for i in range(first, last + 1):
        if voiced[i]:
            if start is not None and (i - start) * frame_ms >= min_ms:
                pauses.append((start * frame_ms, i * frame_ms))
            start = None
        elif start is None:
            start = i
    return pauses


def truth_pauses(kind, min_ms=300):
    """True pauses: runs of silence (kind 0) of 300 ms or more, inside speech."""
    speech = np.array([k > 0 for k in kind])
    return voiced_to_pauses(speech, 10, min_ms), speech


def match(est, ref):
    """Pauses match when they overlap by at least half of the true pause."""
    hits, used, starts, ends = 0, set(), [], []
    for r in ref:
        for j, e in enumerate(est):
            if j in used:
                continue
            ov = min(r[1], e[1]) - max(r[0], e[0])
            if ov >= 0.5 * (r[1] - r[0]):
                hits += 1
                used.add(j)
                starts.append(abs(e[0] - r[0]))
                ends.append(abs(e[1] - r[1]))
                break
    return {
        "recall": hits / len(ref) if ref else None,
        "precision": hits / len(est) if est else None,
        "truePauses": len(ref),
        "foundPauses": len(est),
        "medianStartErrMs": float(np.median(starts)) if starts else None,
        "medianEndErrMs": float(np.median(ends)) if ends else None,
    }


def frame_acc(est_speech, ref_speech):
    n = min(len(est_speech), len(ref_speech))
    return float(np.mean(np.asarray(est_speech[:n]) == np.asarray(ref_speech[:n])))


def add_breaths(x, kind, rng, rel_db=-22):
    """A 250 ms inhale in the middle of every pause of 600 ms or more."""
    y = x.copy()
    speech = np.array([k > 0 for k in kind])
    m = np.repeat(speech, 160)
    m = np.pad(m, (0, max(0, len(x) - len(m))))[: len(x)]
    active = np.sqrt(np.mean(x[m] ** 2))
    runs = voiced_to_pauses(speech, 10, 600)
    sos = butter(2, [400, 3500], btype="band", fs=FS, output="sos")
    for a, b in runs:
        mid = int((a + b) / 2 / 1000 * FS)
        n = int(0.25 * FS)
        br = sosfilt(sos, rng.standard_normal(n)) * np.hanning(n)
        br = br / np.sqrt(np.mean(br ** 2)) * active * 10 ** (rel_db / 20)
        y[mid - n // 2: mid - n // 2 + n] += br
    return y


def main():
    silero_path, out_json = sys.argv[1], sys.argv[2]
    model = Silero(silero_path)
    res = {"volume": {}, "pauses": {}}

    # Volume: three expressiveness levels, each with normal and long pauses.
    for name, kw in {
        "monotone": dict(seed=13, accent_st=0.7, accent_db=1.0),
        "normal": dict(seed=12, accent_st=3.0, accent_db=3.5),
        "lively": dict(seed=11, accent_st=5.0, accent_db=5.0),
    }.items():
        for pause_scale in (1.0, 2.5):
            x, truth = synth.make_take(**kw, pause_scale=pause_scale)
            mask = [k > 0 for k in truth["kind"]]
            rng = np.random.default_rng(5)
            phone = synth.phone_chain(x, truth, rng, os.path.dirname(out_json), f"vol_{name}_{pause_scale}")
            pause_share = 1 - float(np.mean(mask))
            for cond, sig in {"clean": x, "phone": phone}.items():
                res["volume"][f"{name}__pauses{pause_scale}__{cond}"] = {
                    "trueSyllableSdDb": truth_dynamics(truth),
                    "pauseShare": pause_share,
                    "current": current_volume(sig),
                    "proposed": proposed_volume(sig, mask),
                }
                print("vol", name, pause_scale, cond, flush=True)

    # Pauses.
    x, truth = synth.make_take(seed=12, accent_st=3.0, accent_db=3.5)
    rng = np.random.default_rng(9)
    ref, ref_speech = truth_pauses(truth["kind"])
    other, _ = synth.make_take(seed=99, female=True, accent_st=3.0, accent_db=3.5, phrases=14)
    other = np.resize(other, len(x))
    active = np.repeat(np.array(ref_speech), 160)
    active = np.pad(active, (0, max(0, len(x) - len(active))))[: len(x)]
    breathy = add_breaths(x, truth["kind"], rng)
    talker = x + other / np.sqrt(np.mean(other ** 2)) * np.sqrt(np.mean(x[active] ** 2)) * 10 ** (-15 / 20)
    conditions = {
        "clean": x,
        "breaths": breathy,
        "noise15_breaths": synth.highpass(synth.add_noise(breathy, 15, rng, active)),
        "phone_breaths": synth.phone_chain(breathy, truth, rng, os.path.dirname(out_json), "pause_phone"),
        "background_talker_15db": talker,
    }
    for cond, sig in conditions.items():
        entry = {}
        p, s = current_pauses(sig)
        entry["current"] = {**match(p, ref), "frameAcc": frame_acc(s, ref_speech)}
        p, s = hysteresis_pauses(sig)
        entry["hysteresis"] = {**match(p, ref), "frameAcc": frame_acc(s, ref_speech)}
        p, s, cpu = silero_pauses(model, sig)
        entry["silero_v6"] = {**match(p, ref), "frameAcc": frame_acc(s, ref_speech), "cpuMs": cpu, "durationS": len(sig) / FS}
        res["pauses"][cond] = entry
        print("pause", cond, {k: (round(v["recall"] or 0, 2), round(v["precision"] or 0, 2)) for k, v in entry.items()}, flush=True)

    with open(out_json, "w") as f:
        json.dump(res, f, indent=1)


if __name__ == "__main__":
    main()
