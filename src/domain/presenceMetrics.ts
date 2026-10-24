// On-device "video analysis": a face timeline captured during recording
// (MediaPipe Face Landmarker, one entry per detection, about 15 to 20 a
// second) summarized into presence metrics. Re-runnable any time from the
// stored face track (domain/signals/faceTrack.ts).

export interface PresenceSample {
  tMs: number;
  present: boolean;
  yaw: number;
  pitch: number;
  smile: number; // 0-1
  eyesOpen: number; // 0-1, mean of both eyes
  framed: boolean;
  roll?: number; // head tilt, degrees
  gazeX?: number; // eyes relative to the head, -1..1
  gazeY?: number; // positive = up
  browRaise?: number; // 0-1
  browDown?: number; // 0-1, frowning/tension
  jawOpen?: number; // 0-1
  mouthPress?: number; // 0-1, pressed lips
  cheekSquint?: number; // 0-1, the cheeks lifting in a real smile
  // Blinks finished since the previous sample, counted on every camera frame.
  blinks?: number;
  // Every blendshape (faceSignals.BLENDSHAPE_NAMES order), kept for the face
  // track; not read by the metrics.
  bs?: number[];
}

export interface PresenceMetrics {
  samples: number;
  presentPercent: number;
  // Of the time your face was visible: looking at the lens. With gaze data
  // ("gaze") that's head *and* eyes; without it ("head"), only head pose.
  eyeContactPercent: number;
  eyeContactSource?: "gaze" | "head";
  // Head turned toward the lens, regardless of the eyes.
  facingLensPercent?: number;
  // Eyes dropped well below the lens (notes, the floor, your own preview).
  lookingDownPercent?: number;
  // Eyes lifted above the lens (the ceiling: searching for words).
  lookingUpPercent?: number;
  longestLookAwayMs: number;
  smilePercent: number;
  // Variation in facial expression (0-100): a flat face reads as a flat
  // voice. Smile, cheeks and brows only: the jaw moves with every syllable,
  // so it measured talking, not expression.
  expressiveness: number;
  headMovement: number; // stddev of yaw/pitch in degrees
  // Nods: the head dipping and coming back (or lifting and coming back)
  // within a second, per minute. Sign-free, so it doesn't depend on which way
  // the head pitch angle points.
  nodsPerMinute?: number;
  // Median absolute head tilt, and how often it was clearly tilted.
  headTiltDeg?: number;
  tiltedPercent?: number;
  blinksPerMinute: number;
  // Eyebrow lifts per minute — the face's way of emphasizing a word.
  browRaisesPerMinute?: number;
  // Frowning or pressed lips — reads as tension.
  tensePercent?: number;
  framedPercent: number;
  // The mean face detections a second over the take.
  detectionRateHz?: number;
}

// The cut-offs the metrics are computed with. The Dev tab's Face Lab tunes
// them against real takes.
export interface PresenceThresholds {
  // Head within this many degrees of straight-on counts as facing the lens.
  eyeContactMaxDeg: number;
  // With gaze data the head may turn a little more, as long as the eyes come
  // back to the lens.
  gazeHeadMaxDeg: number;
  // Eye-in-head offset (blendshape units, ~0.35 = 10 degrees) still counted
  // as on the lens. Generous on purpose: the phone lens sits just above the
  // screen, and glancing at your own preview should not count as looking away.
  gazeMaxOffset: number;
  // Eyes this far below the lens (gazeY) count as looking down.
  lookingDown: number;
  // Eyes this far above the lens count as looking up. Tighter than down: the
  // screen is below the lens, so nothing on it pulls the eyes up.
  lookingUp: number;
  tiltedDeg: number;
  smile: number;
  eyesClosed: number;
  browRaise: number;
  tense: number;
}

// Bump when the defaults change, so stored face tracks say which set their
// summaries were made with.
export const PRESENCE_THRESHOLDS_VERSION = 2;

export const DEFAULT_PRESENCE_THRESHOLDS: PresenceThresholds = {
  eyeContactMaxDeg: 15,
  gazeHeadMaxDeg: 20,
  gazeMaxOffset: 0.35,
  lookingDown: -0.35,
  lookingUp: 0.25,
  tiltedDeg: 12,
  smile: 0.5,
  eyesClosed: 0.3,
  browRaise: 0.5,
  tense: 0.45,
};

export type LookReason = "no_face" | "head_away" | "eyes_away" | "blink" | "on_lens";
export type LookDirection = "up" | "down" | "side";

export interface LookClassification {
  looking: boolean;
  reason: LookReason;
  // For eyes_away: which way the eyes went.
  direction?: LookDirection;
  // For head_away / eyes_away: the measured value and the limit it crossed
  // (degrees, or gaze units).
  value?: number;
  limit?: number;
}

// Whether one sample counts as looking at the lens, and why. This is the
// rule computePresenceMetrics uses, exposed so the Face Lab can show it live.
// A blink drags the "look down" blendshapes up, so a closed-eye sample keeps
// whatever the eyes were doing rather than reading as looking away.
export function classifyLook(s: PresenceSample, t: PresenceThresholds = DEFAULT_PRESENCE_THRESHOLDS, hasGaze = true): LookClassification {
  if (!s.present) return { looking: false, reason: "no_face" };
  const head = Math.max(Math.abs(s.yaw), Math.abs(s.pitch));
  if (!hasGaze) {
    return head <= t.eyeContactMaxDeg
      ? { looking: true, reason: "on_lens" }
      : { looking: false, reason: "head_away", value: head, limit: t.eyeContactMaxDeg };
  }
  if (head > t.gazeHeadMaxDeg) return { looking: false, reason: "head_away", value: head, limit: t.gazeHeadMaxDeg };
  if (s.eyesOpen < t.eyesClosed) return { looking: true, reason: "blink" };
  const gx = s.gazeX ?? 0;
  const gy = s.gazeY ?? 0;
  if (gy >= t.lookingUp) return { looking: false, reason: "eyes_away", direction: "up", value: gy, limit: t.lookingUp };
  const offset = Math.hypot(gx, gy);
  if (offset > t.gazeMaxOffset) {
    const direction: LookDirection = Math.abs(gx) >= Math.abs(gy) ? "side" : gy > 0 ? "up" : "down";
    return { looking: false, reason: "eyes_away", direction, value: offset, limit: t.gazeMaxOffset };
  }
  return { looking: true, reason: "on_lens" };
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// Rising edges through `threshold`, re-armed only once the value falls back
// under `threshold - gap`, so detection-rate jitter around the line doesn't
// count one lift twice.
function risingEdges(values: number[], threshold: number, gap = 0.1): number {
  let n = 0;
  let armed = true;
  for (const v of values) {
    if (armed && v >= threshold) {
      n += 1;
      armed = false;
    } else if (!armed && v < threshold - gap) {
      armed = true;
    }
  }
  return n;
}

// Nods: the head pitch leaving its running level by NOD_DEG or more and
// coming back within NOD_MAX_MS. Either direction counts.
const NOD_DEG = 4;
const NOD_MAX_MS = 1000;
const NOD_LEVEL_MS = 1500;

export function countNods(samples: PresenceSample[]): number {
  let nods = 0;
  let awayAt: number | null = null;
  const window: { t: number; v: number }[] = [];
  for (const s of samples) {
    if (!s.present) continue;
    while (window.length && s.tMs - window[0].t > NOD_LEVEL_MS) window.shift();
    const level = window.length ? median(window.map((w) => w.v)) : s.pitch;
    const off = Math.abs(s.pitch - level);
    if (awayAt === null) {
      if (off >= NOD_DEG && window.length) awayAt = s.tMs;
      else window.push({ t: s.tMs, v: s.pitch });
    } else if (off < NOD_DEG / 2) {
      if (s.tMs - awayAt <= NOD_MAX_MS) nods += 1;
      awayAt = null;
      window.push({ t: s.tMs, v: s.pitch });
    } else if (s.tMs - awayAt > NOD_MAX_MS) {
      // A held turn, not a nod: it becomes the new level.
      awayAt = null;
      window.length = 0;
      window.push({ t: s.tMs, v: s.pitch });
    }
  }
  return nods;
}

// Expressiveness scale: the mean SD of smile, cheek lift and brow raise
// times this, capped at 100. Without the jaw (which moved with every
// syllable and saturated the old scale at 37 to 46 on every take), the
// remaining parts move less; 600 is a first setting, to be checked against
// a still-face and an animated take in the Face Lab (device test plan, F).
export const EXPRESSION_SCALE = 600;

export function computePresenceMetrics(timeline: PresenceSample[], t: PresenceThresholds = DEFAULT_PRESENCE_THRESHOLDS): PresenceMetrics | null {
  if (timeline.length < 3) return null;
  const present = timeline.filter((s) => s.present);
  const hasGaze = present.some((s) => s.gazeX !== undefined);
  const looks = timeline.map((s) => classifyLook(s, t, hasGaze));
  const lookOf = new Map(timeline.map((s, i) => [s, looks[i]]));

  const facing = (s: PresenceSample) => s.present && Math.abs(s.yaw) <= t.eyeContactMaxDeg && Math.abs(s.pitch) <= t.eyeContactMaxDeg;

  let longestAway = 0;
  let awayStart: number | null = null;
  timeline.forEach((s, i) => {
    if (!looks[i].looking) {
      if (awayStart === null) awayStart = s.tMs;
      longestAway = Math.max(longestAway, s.tMs - awayStart);
    } else {
      awayStart = null;
    }
  });

  const blinks = timeline.reduce((n, s) => n + (s.blinks ?? 0), 0);
  const spanMs = Math.max(timeline[timeline.length - 1].tMs - timeline[0].tMs, 1000);
  const durationMin = spanMs / 60000;

  const metrics: PresenceMetrics = {
    samples: timeline.length,
    presentPercent: pct(present.length, timeline.length),
    eyeContactPercent: pct(present.filter((s) => lookOf.get(s)!.looking).length, present.length),
    eyeContactSource: hasGaze ? "gaze" : "head",
    facingLensPercent: pct(present.filter(facing).length, present.length),
    longestLookAwayMs: longestAway,
    smilePercent: pct(present.filter((s) => s.smile >= t.smile).length, present.length),
    expressiveness: Math.min(100, Math.round(stddev(present.map((s) => s.smile)) * 250)),
    headMovement: Math.round(((stddev(present.map((s) => s.yaw)) + stddev(present.map((s) => s.pitch))) / 2) * 10) / 10,
    nodsPerMinute: Math.round((countNods(timeline) / durationMin) * 10) / 10,
    blinksPerMinute: Math.round(blinks / durationMin),
    framedPercent: pct(present.filter((s) => s.framed).length, timeline.length),
    detectionRateHz: Math.round(((timeline.length - 1) / (spanMs / 1000)) * 10) / 10,
  };
  if (!hasGaze) return metrics;

  const open = present.filter((s) => s.eyesOpen >= t.eyesClosed);
  const rolls = present.map((s) => Math.abs(s.roll ?? 0));
  const expression =
    (stddev(present.map((s) => s.smile)) + stddev(present.map((s) => s.cheekSquint ?? 0)) + stddev(present.map((s) => s.browRaise ?? 0))) / 3;
  return {
    ...metrics,
    expressiveness: Math.min(100, Math.round(expression * EXPRESSION_SCALE)),
    lookingDownPercent: pct(open.filter((s) => (s.gazeY ?? 0) <= t.lookingDown).length, open.length),
    lookingUpPercent: pct(open.filter((s) => (s.gazeY ?? 0) >= t.lookingUp).length, open.length),
    headTiltDeg: Math.round(median(rolls) * 10) / 10,
    tiltedPercent: pct(rolls.filter((r) => r > t.tiltedDeg).length, rolls.length),
    browRaisesPerMinute: Math.round(risingEdges(present.map((s) => s.browRaise ?? 0), t.browRaise) / durationMin),
    tensePercent: pct(present.filter((s) => (s.browDown ?? 0) >= t.tense || (s.mouthPress ?? 0) >= t.tense).length, present.length),
  };
}
