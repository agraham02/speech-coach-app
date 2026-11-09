import { tokenizeHeard } from "../speech/normalize";
import { alignFinal, buildTarget, scoreAlignment } from "../speech/speechAlignment";
import { pausesAtMarks, timedTokens, type TimedWordInput } from "../drills/timedHeard";
import { PASSED, readingGate, type GateVerdict } from "../gates";
import type { LeafEvidence } from "../scoring/leafEvidence";
import type { LeafId } from "../scoring/skillTree";
import { wordsOf, type MarkedText } from "./marks";

// Line reps, the Phrasebook and Line of the day get a number from your reads
// (docs/overhaul/PLAN.md, section 7: "Marks matched; words read; pause at pause
// marks; peak on stressed words", gate "Words read"). Each recorded read is
// checked against the line; a self-rating no longer counts (task 3c.3).
// - Read accuracy: the words of the line you read, averaged over your reads.
// - Knowing where to stress: your marks against the coach's, when you marked.
// - Deliberate pauses: pauses held at the line's pause marks, by Whisper's word
//   times. On probation, so it's shown and kept but doesn't move a score yet.
// - Stress on the right words needs word-level loudness the phone can't yet
//   prove (also on probation), so it isn't measured here.
// Pure.

export interface LineRead {
  // Whisper's text when it read the clip, otherwise what the phone heard live.
  text: string;
  // Whisper's word times, when it read the clip.
  words: TimedWordInput[] | null;
}

export interface LineReadsInput {
  line: MarkedText;
  reads: LineRead[];
}

export interface LinePart {
  label: string;
  note: string;
}

export interface LineScore {
  score: number | null;
  gate: GateVerdict;
  parts: LinePart[];
  leafScores: Partial<Record<LeafId, LeafEvidence>>;
  accuracyPercent: number | null;
}

// A pause held this long at a mark counts (pause reading's easiest bar).
export const LINE_PAUSE_MS = 250;

// The target word each pause mark comes after, counted the way the reading target
// is split (a hyphenated word is two). A mark after the last word can't be judged.
export function linePauseTargets(line: MarkedText): number[] {
  const words = wordsOf(line.text);
  const lastIndexOf: number[] = [];
  let count = 0;
  for (const w of words) {
    count += buildTarget(w).length;
    lastIndexOf.push(count - 1);
  }
  const after = new Set<number>();
  for (const m of line.marks) {
    if ((m.kind === "pause" || m.kind === "long_pause") && m.afterWord < words.length - 1) after.add(lastIndexOf[m.afterWord]);
  }
  return [...after].sort((a, b) => a - b);
}

function readAccuracy(line: MarkedText, read: LineRead): number {
  const target = buildTarget(line.text, 1);
  const heard = tokenizeHeard(read.text).tokens;
  if (!target.length || !heard.length) return 0;
  return scoreAlignment(target, heard, alignFinal(target, heard), { speakingMs: 0 }).accuracyPercent;
}

export function scoreLineReads(
  inputs: LineReadsInput[],
  marks: { shared: number; coach: number } | null,
  options: { relaxed?: boolean } = {},
): LineScore {
  const accuracies: number[] = [];
  let pauseMarks = 0;
  let pausesHeld = 0;
  for (const { line, reads } of inputs) {
    const after = linePauseTargets(line);
    for (const read of reads) {
      accuracies.push(readAccuracy(line, read));
      if (read.words?.length && after.length) {
        const found = pausesAtMarks(buildTarget(line.text, 1), timedTokens(read.words), after, LINE_PAUSE_MS);
        pauseMarks += found.marks;
        pausesHeld += found.held;
      }
    }
  }
  const parts: LinePart[] = [];
  const leafScores: Partial<Record<LeafId, LeafEvidence>> = {};
  const marked = marks && marks.coach > 0 ? marks.shared / marks.coach : null;
  if (marked != null) {
    leafScores.where_to_stress = { score: marked, source: "measured" };
    parts.push({ label: "Marks matched", note: `${marks!.shared} of the coach's ${marks!.coach} marks placed the same way` });
  }
  if (!accuracies.length) {
    // No reads to check: your marks are still measured, so they count alone.
    if (marked != null) {
      parts.push({ label: "Reads", note: "Not recorded, so only your marks count" });
      return { score: Math.round(marked * 100) / 100, gate: PASSED, parts, leafScores, accuracyPercent: null };
    }
    return {
      score: null,
      gate: { passed: false, kind: "not_checked", reason: "Record your reads to get a number." },
      parts,
      leafScores,
      accuracyPercent: null,
    };
  }
  const accuracyPercent = Math.round(accuracies.reduce((s, a) => s + a, 0) / accuracies.length);
  parts.unshift({ label: "Words read", note: `${accuracyPercent}% of the line's words, over ${accuracies.length} ${accuracies.length === 1 ? "read" : "reads"}` });
  if (pauseMarks > 0) {
    leafScores.deliberate_pauses = { score: pausesHeld / pauseMarks, source: "measured" };
    parts.push({ label: "Pauses at the marks (not counted yet)", note: `${pausesHeld} of ${pauseMarks} held` });
  }
  const gate = readingGate(accuracyPercent, options.relaxed);
  if (!gate.passed) return { score: null, gate, parts, leafScores: {}, accuracyPercent };
  leafScores.read_accuracy = { score: accuracyPercent / 100, source: "measured" };
  // The headline: words read, and your marks when you placed them.
  const score = marked != null ? (accuracyPercent / 100 + marked) / 2 : accuracyPercent / 100;
  return { score: Math.round(score * 100) / 100, gate: PASSED, parts, leafScores, accuracyPercent };
}
