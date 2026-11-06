import type { FaceCalibration } from "./faceCalibration";
import type { PresenceSample } from "./presenceMetrics";

// A candidate way to measure face movement (docs/overhaul/PLAN.md, section 6.5,
// table C). Today's expressiveness is the variation of smile, cheeks and brows
// times a fixed 600, which can reward tracker jitter. This measures against the
// person's own face instead: a brow lift or a smile is a rise above the middle
// of their own range, held for a moment. The range comes from the face check
// when there is one (its rest and peaks), otherwise from the take itself.
// Pure. Nothing here replaces computePresenceMetrics; Signal Lab compares the
// two (presence.expression, presence.face_events).

export type FaceEventKind = "brow" | "smile";

export interface FaceEvent {
  tMs: number;
  kind: FaceEventKind;
}

export interface ChannelReference {
  rest: number;
  peak: number;
  // Where the reference came from. "take": the take's own 10th and 95th
  // percentiles. "calibration": the face check's rest and peaks.
  source: "calibration" | "take";
  // False when the range was too small to tell a movement from jitter; the
  // channel then has no events and adds nothing to the motion index.
  usable: boolean;
}

export interface FaceMovement {
  browLiftsPerMinute: number;
  smilesPerMinute: number;
  // 0-100: how much of the person's own range the face used.
  motionIndex: number;
  events: FaceEvent[];
  reference: { brow: ChannelReference; smile: ChannelReference };
}

// A movement has to hold this long to count.
export const EVENT_HOLD_MS = 150;
// From a face check, a peak has to be this far above rest to be believed (the
// same line faceCalibration uses before it moves a cut-off).
const MIN_PEAK_RISE = 0.2;
// With only the take to go on, a range smaller than this is jitter. At 0.1 a
// still face read 51 brow lifts a minute on a real phone; this is the face
// check's own line for a movement it believes.
const MIN_TAKE_RANGE = MIN_PEAK_RISE;
// Once up, an event ends when the value falls this share of the range below
// the halfway line, so detection jitter on the line doesn't count it twice.
const RELEASE_SHARE = 0.1;
const MAX_SAMPLE_MS = 250;
const DEFAULT_SAMPLE_MS = 50;

const round1 = (v: number) => Math.round(v * 10) / 10;

function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// `calRest` / `calRise`: the face check's resting value and its strongest rise
// over rest (the readout's smile and brows peaks are rises, not absolute
// values; see TryPeaks and calibratedThresholds).
function referenceFor(values: number[], calRest: number | undefined, calRise: number | undefined): ChannelReference {
  if (calRest !== undefined && calRise !== undefined && calRise >= MIN_PEAK_RISE) {
    // A take that goes further than the face check saw shows the check was too
    // low: a real one's brows reached 0.62 against 0.92 in the take, and small
    // flickers then counted as lifts. A still take stays on the check's own line.
    return { rest: calRest, peak: Math.max(calRest + calRise, quantile(values, 0.95)), source: "calibration", usable: true };
  }
  const rest = quantile(values, 0.1);
  const peak = quantile(values, 0.95);
  return { rest, peak, source: "take", usable: peak - rest >= MIN_TAKE_RANGE };
}

export function faceMovement(timeline: PresenceSample[], calibration: FaceCalibration | null): FaceMovement | null {
  const n = timeline.length;
  const presentCount = timeline.filter((s) => s.present).length;
  if (n < 3 || presentCount < 3) return null;

  const gaps: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = timeline[i + 1].tMs - timeline[i].tMs;
    if (d > 0) gaps.push(Math.min(d, MAX_SAMPLE_MS));
  }
  const lastMs = gaps.length ? medianOf(gaps) : DEFAULT_SAMPLE_MS;
  const dtAt = (i: number) => (i < n - 1 ? Math.max(0, Math.min(timeline[i + 1].tMs - timeline[i].tMs, MAX_SAMPLE_MS)) : lastMs);

  const present = timeline.filter((s) => s.present);
  const smileValues = present.map((s) => s.smile);
  const browValues = present.map((s) => s.browRaise ?? 0);
  const reference = {
    smile: referenceFor(smileValues, calibration?.rest.smile, calibration?.peaks.smile),
    brow: referenceFor(browValues, calibration?.rest.browRaise, calibration?.peaks.brows),
  };

  const channels: { kind: FaceEventKind; ref: ChannelReference; read: (s: PresenceSample) => number }[] = [
    { kind: "brow", ref: reference.brow, read: (s) => s.browRaise ?? 0 },
    { kind: "smile", ref: reference.smile, read: (s) => s.smile },
  ];

  const events: FaceEvent[] = [];
  const counts: Record<FaceEventKind, number> = { brow: 0, smile: 0 };
  const shares: number[] = [];
  for (const { kind, ref, read } of channels) {
    if (!ref.usable) {
      shares.push(0);
      continue;
    }
    const range = ref.peak - ref.rest;
    const half = ref.rest + range / 2;
    const release = half - range * RELEASE_SHARE;
    const quarter = ref.rest + range / 4;

    const state: { up: { from: number; durMs: number } | null } = { up: null };
    const close = () => {
      if (state.up && state.up.durMs >= EVENT_HOLD_MS) {
        events.push({ tMs: timeline[state.up.from].tMs, kind });
        counts[kind] += 1;
      }
      state.up = null;
    };
    let aboveQuarter = 0;
    for (let i = 0; i < n; i++) {
      const s = timeline[i];
      if (!s.present) {
        close();
        continue;
      }
      const v = read(s);
      if (v > quarter) aboveQuarter += 1;
      if (state.up) {
        if (v >= release) state.up.durMs += dtAt(i);
        else close();
      } else if (v > half) {
        state.up = { from: i, durMs: dtAt(i) };
      }
    }
    close();
    shares.push(aboveQuarter / present.length);
  }

  const spanMs = Math.max(timeline[n - 1].tMs - timeline[0].tMs, 1000);
  const minutes = spanMs / 60000;
  events.sort((a, b) => a.tMs - b.tMs);
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;

  return {
    browLiftsPerMinute: round1(counts.brow / minutes),
    smilesPerMinute: round1(counts.smile / minutes),
    motionIndex: Math.min(100, Math.round(mean * 100)),
    events,
    reference,
  };
}
