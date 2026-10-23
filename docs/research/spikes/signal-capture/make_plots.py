"""Figures for docs/research/signal-capture.md.

    python -I make_plots.py WORK_DIR SAMPLES_DIR IMG_DIR

WORK_DIR holds pitch_results.json / pitch_real.json (compare_pitch.py).
SAMPLES_DIR holds the iPhone exports (run1-3.json), read only.
"""

import json
import os
import sys

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams.update({"font.family": "sans-serif", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False})
INK, ACCENT, MUTED = "#222222", "#c0392b", "#9a9a9a"


def app_style(ax, t, f0):
    """The Result screen draws null pitch as 0 (PitchVolumeChart.tsx)."""
    y = [v if v is not None else 0 for v in f0]
    ax.plot(t, y, color="#6c5ce7", lw=1.2)
    ax.set_ylim(0, max(200, max([v for v in f0 if v] + [0]) + 50))
    ax.set_ylabel("Hz")


def semitone_style(ax, t, f0, color, label, med=None):
    v = np.array([np.nan if x is None else x for x in f0], dtype=float)
    med = med or np.nanmedian(v)
    ax.plot(t, 12 * np.log2(v / med), color=color, lw=1.1, label=label)
    ax.axhline(0, color=MUTED, lw=0.6, ls=":")
    ax.set_ylabel("semitones vs your median")
    return med


def iphone_figure(samples_dir, img_dir):
    fig, axes = plt.subplots(3, 1, figsize=(7.5, 5.2), sharex=False)
    for ax, name in zip(axes, ["run1", "run2", "run3"]):
        j = json.load(open(os.path.join(samples_dir, name + ".json"), encoding="utf8"))
        p = j["voice"]["pitchContourHz"]
        t = np.arange(len(p)) * 0.2
        app_style(ax, t, p)
        voiced = sum(1 for v in p if v is not None)
        ax.set_title(f"{name}: {voiced} of {len(p)} buckets have a pitch ({100 * voiced / len(p):.0f}%), the rest are drawn at 0", loc="left", fontsize=9)
    axes[-1].set_xlabel("seconds")
    fig.suptitle("iPhone exports, pitch drawn the way the Result screen draws it", x=0.01, ha="left", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(img_dir, "iphone-pitch-as-charted.png"), dpi=110)
    plt.close(fig)


def contour_figure(entry, title, path):
    c = entry["contours"]
    truth = entry["truthF0"]
    fig, axes = plt.subplots(3, 1, figsize=(7.5, 6.2), sharex=True)
    cur = c["current"]
    app_style(axes[0], np.array(cur["t"]) / 1000, cur["f0"])
    axes[0].set_title("Today: one 64 ms YIN frame per 200 ms bucket, threshold 0.1, nulls drawn at 0", loc="left")
    tt = (np.arange(len(truth)) * 10 + 5) / 1000
    tv = [v if v else None for v in truth]
    med = semitone_style(axes[1], tt, tv, MUTED, "reference")
    semitone_style(axes[1], np.array(c["proposed_yin"]["t"]) / 1000, c["proposed_yin"]["f0"], ACCENT, "proposed YIN (10 ms)", med)
    axes[1].legend(loc="upper right", frameon=False)
    axes[1].set_title("Proposed: dense YIN with voicing and continuity, gaps left as gaps", loc="left")
    semitone_style(axes[2], tt, tv, MUTED, "reference", med)
    semitone_style(axes[2], np.array(c["swiftf0"]["t"]) / 1000, c["swiftf0"]["f0"], INK, "SwiftF0 (16 ms)", med)
    axes[2].legend(loc="upper right", frameon=False)
    axes[2].set_title("SwiftF0 (14k-parameter CNN, ONNX)", loc="left")
    axes[2].set_xlabel("seconds")
    for ax in axes[1:]:
        ax.set_ylim(-9, 9)
    fig.suptitle(title, x=0.01, ha="left", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def recall_figure(synth, real, img_dir):
    names = ["current", "current_dense", "mpm", "pyin", "praat_ac", "proposed_yin", "swiftf0"]
    labels = ["today", "today, every 10 ms", "MPM", "pYIN", "Praat", "proposed YIN", "SwiftF0"]
    sets = {"synthetic, clean": ("clean", synth), "synthetic, phone chain": ("phone", synth), "real speech, phone chain": ("phone", real)}
    fig, ax = plt.subplots(figsize=(7.5, 3.2))
    width = 0.26
    for k, (lab, (cond, res)) in enumerate(sets.items()):
        vals = []
        for n in names:
            rows = [e["trackers"][n]["rawPitchAcc50c"] for s, e in res.items() if s != "_timing" and s.endswith("__" + cond)]
            vals.append(np.mean(rows))
        ax.bar(np.arange(len(names)) + (k - 1) * width, vals, width, label=lab, color=[INK, MUTED, ACCENT][k])
    ax.set_xticks(np.arange(len(names)), labels, rotation=0, fontsize=8)
    ax.set_ylabel("share of voiced frames\nwithin 50 cents")
    ax.set_ylim(0, 1)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="upper left")
    ax.set_title("Raw pitch accuracy (Praat and pYIN are the reference on real speech, so they score high there by construction)", loc="left", fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(img_dir, "pitch-accuracy.png"), dpi=110)
    plt.close(fig)


def main():
    work, samples, img = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(img, exist_ok=True)
    synth = json.load(open(os.path.join(work, "pitch_results.json")))
    real = json.load(open(os.path.join(work, "pitch_real.json")))
    iphone_figure(samples, img)
    contour_figure(real["libri1__phone"], "Real read speech (LibriSpeech), through the simulated phone chain", os.path.join(img, "pitch-real-speech.png"))
    contour_figure(synth["male_lively__phone"], "Synthetic male voice with known pitch, phone chain", os.path.join(img, "pitch-synthetic.png"))
    recall_figure(synth, real, img)
    print("ok")


if __name__ == "__main__":
    main()
