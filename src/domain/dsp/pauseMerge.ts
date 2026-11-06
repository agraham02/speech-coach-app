import type { TranscriptWord } from "../sessionTypes";

// A candidate pause detector for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Pauses"). The energy gate in audioFeatures.ts found 7 of 9 true
// pauses in simulation. Whisper's word times carry a second, independent
// view: a gap of 300 ms or more between two words is a pause too. This takes
// the union of the two, so a pause either one sees is kept, and says which
// saw it.

export const MERGE_PAUSE_MIN_MS = 300;

export type PauseSource = "energy" | "words" | "both";

export interface MergedPause {
  startMs: number;
  endMs: number;
  durationMs: number;
  source: PauseSource;
}

interface Interval {
  startMs: number;
  endMs: number;
}

// Energy pauses (for example `pausesFromFeatures(...).pauses`) united with the
// gaps between consecutive words of `minMs` or more. Overlapping intervals
// become one pause spanning their union; it is tagged `both` when an energy
// pause and a word gap are in it. Energy pauses shorter than `minMs` are left
// out, so one threshold governs both sources. Sorted by start.
export function mergePauses(energyPauses: Interval[], words: TranscriptWord[] | null, minMs = MERGE_PAUSE_MIN_MS): MergedPause[] {
  const items: (Interval & { source: "energy" | "words" })[] = [];
  for (const p of energyPauses) if (p.endMs - p.startMs >= minMs) items.push({ startMs: p.startMs, endMs: p.endMs, source: "energy" });
  if (words) {
    for (let i = 0; i + 1 < words.length; i++) {
      const startMs = words[i].endMs;
      const endMs = words[i + 1].startMs;
      if (endMs - startMs >= minMs) items.push({ startMs, endMs, source: "words" });
    }
  }
  items.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const out: MergedPause[] = [];
  let cur: { startMs: number; endMs: number; energy: boolean; words: boolean } | null = null;
  const flush = () => {
    if (!cur) return;
    out.push({
      startMs: cur.startMs,
      endMs: cur.endMs,
      durationMs: cur.endMs - cur.startMs,
      source: cur.energy && cur.words ? "both" : cur.energy ? "energy" : "words",
    });
  };
  for (const it of items) {
    if (cur && it.startMs < cur.endMs) {
      cur.endMs = Math.max(cur.endMs, it.endMs);
      if (it.source === "energy") cur.energy = true;
      else cur.words = true;
    } else {
      flush();
      cur = { startMs: it.startMs, endMs: it.endMs, energy: it.source === "energy", words: it.source === "words" };
    }
  }
  flush();
  return out;
}

// Same as pauses.ts, which keeps its copy private.
const SENTENCE_END = /[.!?]["')\]]?$/;

// The share of sentence endings followed by a pause, defined exactly as
// `boundaryPauseRate` in pauses.ts so the two are comparable: a sentence
// ending is any word but the last that ends in . ! or ?, and it is followed
// when a pause starts from 120 ms before to 400 ms after the word's end.
// Rounded to two places; null with under two words or no sentence ending.
export function boundaryRateOf(merged: Interval[], words: TranscriptWord[] | null): number | null {
  if (!words || words.length < 2) return null;
  const ends = words.slice(0, -1).filter((w) => SENTENCE_END.test(w.text.trim()));
  if (ends.length === 0) return null;
  const followed = ends.filter((w) => merged.some((p) => p.startMs >= w.endMs - 120 && p.startMs <= w.endMs + 400));
  return Math.round((followed.length / ends.length) * 100) / 100;
}
