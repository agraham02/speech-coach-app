"""Synthetic speech with known ground truth, for the signal-capture spike.

A source-filter voice: a jittered glottal pulse train, shaped by a two-pole
glottal low-pass and four vowel formants, with fricatives, stop closures and
phrase pauses. Every 10 ms frame carries the true f0 (or unvoiced), the true
loudness, and whether it is speech or a pause, so trackers can be scored.

Expressiveness controls the pitch accents (semitones) and the loudness lift of
accented syllables (dB), so a "monotone" and a "lively" take of the same
sentence differ only in prosody. Conditions then degrade the clean signal the
way a phone recording does: room noise, reverb, a high-pass, AAC at 64 kb/s.

Run from anywhere with the spike venv (numpy, scipy, imageio-ffmpeg):
    python -I synth.py OUT_DIR
It writes OUT_DIR/<name>.f32 (16 kHz mono float32) and OUT_DIR/<name>.truth.json.
"""

import json
import os
import subprocess
import sys

import numpy as np
from scipy.signal import lfilter, butter, sosfilt, resample_poly

FS = 16000
HOP_S = 0.010

VOWELS = {
    "a": [(730, 90), (1090, 110), (2440, 170), (3400, 250)],
    "i": [(270, 60), (2290, 100), (3010, 170), (3500, 250)],
    "u": [(300, 60), (870, 90), (2240, 170), (3400, 250)],
    "e": [(530, 70), (1840, 100), (2480, 170), (3500, 250)],
    "o": [(570, 80), (840, 90), (2410, 170), (3400, 250)],
}


def resonator(freq, bw, fs=FS):
    r = np.exp(-np.pi * bw / fs)
    theta = 2 * np.pi * freq / fs
    a = [1, -2 * r * np.cos(theta), r * r]
    b = [1 - r]
    return b, a


def bandlimited_pulses(n, times, amps, fs=FS, taps=16):
    """Impulses at fractional sample positions (windowed sinc)."""
    out = np.zeros(n + taps * 2)
    k = np.arange(-taps, taps + 1)
    win = np.hanning(len(k) + 2)[1:-1]
    for t, a in zip(times, amps):
        pos = t * fs
        base = int(np.floor(pos))
        frac = pos - base
        kernel = np.sinc(k - frac) * win * a
        start = base - taps + taps
        out[start:start + len(k)] += kernel
    return out[taps:taps + n]


def glottal_source(f0_track, rng, jitter=0.005, shimmer=0.04, breath_db=-28.0, fs=FS):
    """Pulse train following f0_track (Hz per sample), with jitter and shimmer.

    Returns the source signal and the exact pulse times (for true jitter)."""
    n = len(f0_track)
    times, amps = [], []
    t = 0.0
    dur = n / fs
    while t < dur:
        f0 = f0_track[min(n - 1, int(t * fs))]
        period = (1.0 / f0) * (1.0 + jitter * rng.standard_normal())
        times.append(t)
        amps.append(1.0 + shimmer * rng.standard_normal())
        t += period
    src = bandlimited_pulses(n, times, amps, fs)
    # Glottal flow shape: two real poles give the -12 dB/octave tilt.
    src = lfilter([1.0], [1.0, -1.94, 0.9409], src)
    src /= np.max(np.abs(src)) + 1e-9
    # Aspiration noise, gated by the glottal cycle a little.
    noise = rng.standard_normal(n) * (10 ** (breath_db / 20))
    noise = sosfilt(butter(2, [800, 6000], btype="band", fs=fs, output="sos"), noise)
    return src + noise, np.array(times)


def vocal_tract(src, vowel, female):
    y = src
    scale = 1.17 if female else 1.0
    for freq, bw in VOWELS[vowel]:
        b, a = resonator(freq * scale, bw)
        y = lfilter(b, a, y)
    # Lip radiation.
    return lfilter([1.0, -0.97], [1.0], y)


def envelope(n, attack=0.025, release=0.035, fs=FS):
    env = np.ones(n)
    na, nr = min(n // 2, int(attack * fs)), min(n // 2, int(release * fs))
    if na > 0:
        env[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    if nr > 0:
        env[-nr:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nr))
    # A slight decay through the nucleus, like a real vowel.
    env *= np.linspace(1.0, 0.8, n)
    return env


def fricative(n, rng, kind):
    band = {"s": (3500, 7500), "sh": (1800, 5000), "f": (1200, 7000)}[kind]
    x = rng.standard_normal(n)
    x = sosfilt(butter(3, band, btype="band", fs=FS, output="sos"), x)
    return x * envelope(n, 0.015, 0.02) / (np.std(x) + 1e-9)


def make_take(seed=1, female=False, accent_st=3.0, accent_db=4.0, phrases=10,
              jitter=0.005, shimmer=0.04, tremor_hz=0.0, tremor_cents=0.0,
              creak_prob=0.0, base_f0=None, pause_scale=1.0):
    """One synthetic take. Returns (signal, truth dict)."""
    rng = np.random.default_rng(seed)
    f0_base = base_f0 or (205.0 if female else 105.0)
    pieces = []
    # Per-sample truth.
    truth_f0 = []
    truth_kind = []  # 0 pause, 1 voiced, 2 unvoiced speech (fricative/closure)
    truth_level = []  # intended level of the syllable, dB re phrase base
    t_cursor = 0.0

    def add(sig, f0=None, kind=0, level=np.nan):
        nonlocal t_cursor
        pieces.append(sig)
        n = len(sig)
        truth_f0.append(np.full(n, np.nan) if f0 is None else f0)
        truth_kind.append(np.full(n, kind, dtype=np.int8))
        truth_level.append(np.full(n, level))
        t_cursor += n / FS

    add(np.zeros(int(0.5 * FS)))
    vowels = list(VOWELS)
    for p in range(phrases):
        n_syll = int(rng.integers(5, 11))
        phrase_dur_est = n_syll * 0.22
        question = rng.random() < 0.2
        phrase_db = rng.normal(0, 1.5)
        t_in_phrase = 0.0
        for s in range(n_syll):
            joint = rng.random()
            if s > 0 and joint < 0.30:
                kind = ["s", "sh", "f"][int(rng.integers(0, 3))]
                nfr = int(rng.uniform(0.06, 0.11) * FS)
                add(fricative(nfr, rng, kind) * 10 ** ((phrase_db - 14) / 20), kind=2)
                t_in_phrase += nfr / FS
            elif s > 0 and joint < 0.50:
                ncl = int(rng.uniform(0.04, 0.07) * FS)
                burst = np.zeros(ncl)
                nb = int(0.008 * FS)
                burst[-nb:] = rng.standard_normal(nb) * 10 ** ((phrase_db - 18) / 20)
                add(burst, kind=2)
                t_in_phrase += ncl / FS
            dur = rng.uniform(0.13, 0.26)
            n = int(dur * FS)
            accented = rng.random() < 0.33
            tt = (t_in_phrase + np.arange(n) / FS)
            # Declination, -2 st over the phrase.
            st = -2.0 * tt / max(phrase_dur_est, 0.5)
            if accented:
                center = dur * rng.uniform(0.3, 0.7)
                st = st + accent_st * np.exp(-0.5 * ((np.arange(n) / FS - center) / 0.07) ** 2)
            if s == n_syll - 1:
                ramp = np.linspace(0, 1, n)
                st = st + (accent_st if question else -0.6 * accent_st) * ramp
            st = st + 0.3 * np.sin(2 * np.pi * 0.7 * tt + p)  # slow drift
            f0 = f0_base * 2 ** (st / 12)
            if tremor_hz > 0:
                f0 = f0 * 2 ** ((tremor_cents / 1200) * np.sin(2 * np.pi * tremor_hz * (t_cursor + np.arange(n) / FS)))
            creaky = rng.random() < creak_prob
            src, _ = glottal_source(f0 if not creaky else f0 * 0.5, rng,
                                    jitter=jitter if not creaky else 0.06,
                                    shimmer=shimmer if not creaky else 0.3)
            v = vocal_tract(src, vowels[int(rng.integers(0, len(vowels)))], female)
            level_db = phrase_db + (accent_db if accented else 0.0) + rng.normal(0, 0.7)
            v = v / (np.sqrt(np.mean(v ** 2)) + 1e-9) * envelope(n) * 10 ** (level_db / 20)
            # Creaky syllables (irregular, subharmonic) are scored as "don't care".
            add(v, f0=(f0 if not creaky else np.full(n, np.nan)), kind=1 if not creaky else 3, level=level_db)
            t_in_phrase += n / FS
        pause = rng.uniform(0.35, 1.3) * pause_scale
        add(np.zeros(int(pause * FS)))

    x = np.concatenate(pieces)
    f0s = np.concatenate(truth_f0)
    kinds = np.concatenate(truth_kind)
    levels = np.concatenate(truth_level)
    # Speech at about -24 dBFS active level, like the iPhone samples.
    active = kinds > 0
    x = x / (np.sqrt(np.mean(x[active] ** 2)) + 1e-9) * 10 ** (-24 / 20)
    return x.astype(np.float64), frame_truth(f0s, kinds, levels)


def frame_truth(f0s, kinds, levels):
    """10 ms frames: f0 (Hz) where the whole +-15 ms neighbourhood is voiced,
    0 where it is clearly unvoiced or silent, None in the boundary zone."""
    hop = int(HOP_S * FS)
    guard = int(0.015 * FS)
    n_frames = len(f0s) // hop
    f0_out, kind_out, level_out = [], [], []
    for i in range(n_frames):
        c = i * hop + hop // 2
        lo, hi = max(0, c - guard), min(len(f0s), c + guard)
        k = kinds[lo:hi]
        if np.all(k == 1):
            f0_out.append(float(np.nanmean(f0s[lo:hi])))
        elif np.all((k == 0) | (k == 2)):
            f0_out.append(0.0)
        else:
            f0_out.append(None)
        kind_out.append(int(kinds[c]))
        level_out.append(None if np.isnan(levels[c]) else float(levels[c]))
    return {"hop_s": HOP_S, "f0": f0_out, "kind": kind_out, "level_db": level_out}


# ---------------------------------------------------------------- conditions

def pink_noise(n, rng):
    white = rng.standard_normal(n)
    # Paul Kellet style filter approximation of 1/f.
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return lfilter(b, a, white)


def add_noise(x, snr_db, rng, active_mask=None):
    noise = pink_noise(len(x), rng)
    noise += 0.3 * np.sin(2 * np.pi * 60 * np.arange(len(x)) / FS) * np.std(noise)
    sig_rms = np.sqrt(np.mean(x[active_mask] ** 2)) if active_mask is not None else np.sqrt(np.mean(x ** 2))
    noise = noise / (np.sqrt(np.mean(noise ** 2)) + 1e-12) * sig_rms * 10 ** (-snr_db / 20)
    return x + noise


def add_reverb(x, rt60, rng, drr_db=4.0):
    n = int(rt60 * 1.2 * FS)
    t = np.arange(n) / FS
    tail = rng.standard_normal(n) * np.exp(-6.91 * t / rt60)
    tail[: int(0.003 * FS)] = 0
    tail = sosfilt(butter(1, 4000, fs=FS, output="sos"), tail)
    tail = tail / np.sqrt(np.sum(tail ** 2)) * 10 ** (-drr_db / 20)
    rir = tail
    rir[0] = 1.0
    y = np.convolve(x, rir)[: len(x)]
    return y * np.sqrt(np.mean(x ** 2) / (np.mean(y ** 2) + 1e-12))


def highpass(x, hz=90):
    return sosfilt(butter(2, hz, btype="high", fs=FS, output="sos"), x)


def aac_roundtrip(x, workdir, name, bitrate="64k"):
    """16 kHz -> 48 kHz -> AAC in mp4 -> decoded back to 16 kHz, like the app."""
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    x48 = resample_poly(x, 3, 1).astype(np.float32)
    raw_in = os.path.join(workdir, name + ".48k.f32")
    mp4 = os.path.join(workdir, name + ".m4a")
    raw_out = os.path.join(workdir, name + ".aacdec.f32")
    x48.tofile(raw_in)
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "f32le", "-ar", "48000", "-ac", "1", "-i", raw_in,
                    "-c:a", "aac", "-b:a", bitrate, mp4], check=True)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", mp4, "-f", "f32le", "-ar", "16000", "-ac", "1", raw_out], check=True)
    y = np.fromfile(raw_out, dtype=np.float32).astype(np.float64)
    for p in (raw_in, raw_out):
        os.remove(p)
    # AAC adds encoder delay; align by cross-correlation on the first seconds.
    seg = min(len(x), FS * 4)
    corr = np.correlate(y[: seg + 4000], x[:seg], mode="valid")
    lag = int(np.argmax(corr))
    y = y[lag: lag + len(x)]
    if len(y) < len(x):
        y = np.pad(y, (0, len(x) - len(y)))
    return y


def phone_chain(x, truth, rng, workdir, name, snr_db=25, rt60=0.35):
    active = np.repeat(np.array([k > 0 for k in truth["kind"]]), int(HOP_S * FS))
    active = np.pad(active, (0, max(0, len(x) - len(active))))[: len(x)]
    y = add_reverb(x, rt60, rng)
    y = add_noise(y, snr_db, rng, active)
    y = highpass(y)
    return aac_roundtrip(y, workdir, name)


CONDITIONS = ["clean", "noise15", "reverb", "aac", "phone"]


def build_set(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    takes = {
        "male_lively": dict(seed=11, female=False, accent_st=5.0, accent_db=5.0),
        "male_normal": dict(seed=12, female=False, accent_st=3.0, accent_db=3.5),
        "male_monotone": dict(seed=13, female=False, accent_st=0.7, accent_db=1.0),
        "male_low_creaky": dict(seed=14, female=False, accent_st=3.0, accent_db=3.5, base_f0=92.0, creak_prob=0.12),
        "female_normal": dict(seed=21, female=True, accent_st=3.0, accent_db=3.5),
        "female_monotone": dict(seed=22, female=True, accent_st=0.7, accent_db=1.0),
    }
    manifest = []
    for name, kw in takes.items():
        x, truth = make_take(**kw)
        rng = np.random.default_rng(kw["seed"] + 1000)
        active = np.repeat(np.array([k > 0 for k in truth["kind"]]), int(HOP_S * FS))
        active = np.pad(active, (0, max(0, len(x) - len(active))))[: len(x)]
        variants = {
            "clean": x,
            "noise15": highpass(add_noise(x, 15, rng, active)),
            "reverb": add_reverb(x, 0.5, rng),
            "aac": aac_roundtrip(x, out_dir, name + "_aac"),
            "phone": phone_chain(x, truth, rng, out_dir, name + "_phone"),
        }
        for cond, sig in variants.items():
            stem = f"{name}__{cond}"
            sig.astype(np.float32).tofile(os.path.join(out_dir, stem + ".f32"))
            with open(os.path.join(out_dir, stem + ".truth.json"), "w") as f:
                json.dump({**truth, "take": name, "condition": cond, "params": kw, "fs": FS}, f)
            manifest.append(stem)
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f)
    return manifest


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "synth_out"
    m = build_set(out)
    print(f"wrote {len(m)} signals to {out}")
