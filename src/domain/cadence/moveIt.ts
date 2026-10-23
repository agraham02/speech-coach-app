import { outcome, type DrillOutcome } from "../drills/drillSpecs";

// Move It: say one line plainly, then with big physical movements, then
// once more standing still with the same energy (the "ghost" take — the one
// that counts). "Your voice isn't monotone, you're vocally lazy": movement
// pushes pitch and loudness peaks up, and the ghost take shows how much of
// that you can keep without it. Feedback is contrast between your own
// takes, never a "good voice" grade. Pure.

export type TakeKind = "neutral" | "move" | "ghost";

export interface TakeSpec {
  kind: TakeKind;
  movementId?: string;
}

export interface MoveItPlan {
  lineCategory: "everyday" | "contrast" | "story";
  takes: TakeSpec[];
  // How much more range the ghost take needs over the neutral one to pass.
  targetLift: number;
}

const DEFAULT_ORDER = ["punch", "wring", "point", "press", "throw", "slash", "pull", "float"];

// More levels: fewer movement takes before the ghost (you have to carry the
// energy further on your own), longer lines, and a bigger lift to pass.
export function moveItPlan(level: number, seed: number): MoveItPlan {
  const l = Math.max(1, Math.min(10, Math.round(level)));
  const moves = l <= 3 ? 3 : l <= 6 ? 2 : 1;
  // The first level always uses the classic three (punch, wring, point).
  const pool = l === 1 ? DEFAULT_ORDER.slice(0, 3) : DEFAULT_ORDER;
  const picked: string[] = [];
  for (let i = 0; picked.length < moves && i < pool.length * 3; i++) {
    const id = pool[(Math.abs(seed) + i * (l === 1 ? 1 : 3)) % pool.length];
    if (!picked.includes(id)) picked.push(id);
  }
  return {
    lineCategory: l <= 3 ? "everyday" : l <= 6 ? "contrast" : "story",
    takes: [{ kind: "neutral" }, ...picked.map((id) => ({ kind: "move" as const, movementId: id })), { kind: "ghost" }],
    targetLift: Math.round((0.1 + l * 0.03) * 100) / 100,
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

// Loudness range of a take from the live meter (-2..10, <= 0 silent): the
// spread between quiet and loud moments while speaking (p90 - p10), so one
// cough or a dropped phone doesn't count.
export function loudnessRange(readings: { value: number }[]): number | null {
  const voiced = readings.map((r) => r.value).filter((v) => v > 0).sort((a, b) => a - b);
  if (voiced.length < 5) return null;
  return Math.round((percentile(voiced, 0.9) - percentile(voiced, 0.1)) * 10) / 10;
}

// Pitch range of a take in semitones (p10 → p90 of the voiced contour),
// ignoring implausible detections (octave errors outside 60–500 Hz).
export function pitchRangeSemitones(contourHz: (number | null)[]): number | null {
  const voiced = contourHz.filter((p): p is number => p !== null && p >= 60 && p <= 500).sort((a, b) => a - b);
  if (voiced.length < 4) return null;
  const lo = percentile(voiced, 0.1);
  const hi = percentile(voiced, 0.9);
  return Math.round(12 * Math.log2(hi / lo) * 10) / 10;
}

export interface TakeRange {
  loudness: number | null;
  pitch: number | null;
}

// One number per take for comparing takes: pitch range when the audio could
// be analyzed, otherwise loudness range. Both takes in a comparison must use
// the same measure.
export function comparableMeasure(a: TakeRange, b: TakeRange): "pitch" | "loudness" | null {
  if (a.pitch != null && b.pitch != null && a.pitch > 0) return "pitch";
  if (a.loudness != null && b.loudness != null && a.loudness > 0) return "loudness";
  return null;
}

const MIN_PITCH_BASE_ST = 1.5;

export interface MoveItResult {
  measure: "pitch" | "loudness";
  // ghost ÷ neutral
  lift: number;
  outcome: DrillOutcome;
}

export function scoreMoveIt(neutral: TakeRange, ghost: TakeRange, targetLift: number): MoveItResult | null {
  const measure = comparableMeasure(neutral, ghost);
  if (!measure) return null;
  // A near-flat plain take (the new tracker reads a monotone voice at about
  // 2 semitones) must not turn a small change into a huge lift.
  const base = measure === "pitch" ? Math.max(neutral.pitch!, MIN_PITCH_BASE_ST) : neutral.loudness!;
  const after = measure === "pitch" ? ghost.pitch! : ghost.loudness!;
  const lift = Math.round((after / base) * 100) / 100;
  const gain = lift - 1;
  const score = gain <= 0 ? 0.2 : Math.min(1, 0.5 + (gain / targetLift) * 0.5);
  const what = measure === "pitch" ? "pitch range" : "loudness range";
  return {
    measure,
    lift,
    outcome: outcome(score, `Still take: ${lift}× the ${what} of your plain take (target ${Math.round((1 + targetLift) * 100) / 100}×)`, gain >= targetLift),
  };
}
