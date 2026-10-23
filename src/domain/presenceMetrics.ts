// On-device "video analysis": a face timeline sampled during recording
// (MediaPipe Face Landmarker; ML Kit before it) summarized into presence
// metrics. Re-runnable any time from the stored timeline.

export interface PresenceSample {
  tMs: number;
  present: boolean;
  yaw: number;
  pitch: number;
  smile: number; // 0-1
  eyesOpen: number; // 0-1, mean of both eyes
  framed: boolean;
  // MediaPipe only (absent in timelines recorded with ML Kit):
  roll?: number; // head tilt, degrees
  gazeX?: number; // eyes relative to the head, -1..1
  gazeY?: number; // positive = up
  browRaise?: number; // 0-1
  browDown?: number; // 0-1, frowning/tension
  jawOpen?: number; // 0-1
  mouthPress?: number; // 0-1, pressed lips
  // Blinks finished since the previous sample, counted on every camera frame
  // (absent on older timelines, whose blinks are read from the samples).
  blinks?: number;
}

export interface PresenceMetrics {
  samples: number;
  presentPercent: number;
  // Of the time your face was visible: looking at the lens. With gaze data
  // ("gaze") that's head *and* eyes; older takes only had head pose
  // ("head"), where wandering eyes didn't lower it.
  eyeContactPercent: number;
  eyeContactSource?: "gaze" | "head";
  // Head turned toward the lens, regardless of the eyes.
  facingLensPercent?: number;
  // Eyes dropped well below the lens (notes, the floor, your own preview).
  lookingDownPercent?: number;
  longestLookAwayMs: number;
  smilePercent: number;
  // Variation in facial expression (0-100): a flat face reads as a flat voice.
  expressiveness: number;
  headMovement: number; // stddev of yaw/pitch in degrees
  // Median absolute head tilt, and how often it was clearly tilted.
  headTiltDeg?: number;
  tiltedPercent?: number;
  blinksPerMinute: number;
  // Eyebrow lifts per minute — the face's way of emphasizing a word.
  browRaisesPerMinute?: number;
  // Frowning or pressed lips — reads as tension.
  tensePercent?: number;
  framedPercent: number;
}

// The cut-offs the metrics are computed with. They were set without device
// data; the Dev tab's Face Lab tunes them against real takes.
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
  tiltedDeg: number;
  smile: number;
  eyesClosed: number;
  browRaise: number;
  tense: number;
}

export const DEFAULT_PRESENCE_THRESHOLDS: PresenceThresholds = {
  eyeContactMaxDeg: 15,
  gazeHeadMaxDeg: 20,
  gazeMaxOffset: 0.35,
  lookingDown: -0.35,
  tiltedDeg: 12,
  smile: 0.5,
  eyesClosed: 0.3,
  browRaise: 0.5,
  tense: 0.45,
};

export type LookReason = "no_face" | "head_away" | "eyes_away" | "blink" | "on_lens";

export interface LookClassification {
  looking: boolean;
  reason: LookReason;
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
  const offset = Math.hypot(s.gazeX ?? 0, s.gazeY ?? 0);
  if (offset > t.gazeMaxOffset) return { looking: false, reason: "eyes_away", value: offset, limit: t.gazeMaxOffset };
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

function risingEdges(values: number[], threshold: number): number {
  let n = 0;
  for (let i = 1; i < values.length; i++) if (values[i - 1] < threshold && values[i] >= threshold) n += 1;
  return n;
}

export function computePresenceMetrics(timeline: PresenceSample[], t: PresenceThresholds = DEFAULT_PRESENCE_THRESHOLDS): PresenceMetrics | null {
  if (timeline.length < 3) return null;
  const present = timeline.filter((s) => s.present);
  const hasGaze = present.some((s) => s.gazeX !== undefined);

  const facing = (s: PresenceSample) => s.present && Math.abs(s.yaw) <= t.eyeContactMaxDeg && Math.abs(s.pitch) <= t.eyeContactMaxDeg;
  const looking = (s: PresenceSample) => classifyLook(s, t, hasGaze).looking;

  let longestAway = 0;
  let awayStart: number | null = null;
  for (const s of timeline) {
    if (!looking(s)) {
      if (awayStart === null) awayStart = s.tMs;
      longestAway = Math.max(longestAway, s.tMs - awayStart);
    } else {
      awayStart = null;
    }
  }

  // Counted at the frame rate when recorded that way. The 200 ms samples
  // miss most blinks, which is all older timelines have.
  const frameCounted = timeline.some((s) => s.blinks !== undefined);
  const blinks = frameCounted
    ? timeline.reduce((n, s) => n + (s.blinks ?? 0), 0)
    : risingEdges(
        present.map((s) => 1 - s.eyesOpen),
        1 - t.eyesClosed,
      );
  const durationMin = Math.max((timeline[timeline.length - 1].tMs - timeline[0].tMs) / 60000, 1 / 60);

  const metrics: PresenceMetrics = {
    samples: timeline.length,
    presentPercent: pct(present.length, timeline.length),
    eyeContactPercent: pct(present.filter(looking).length, present.length),
    eyeContactSource: hasGaze ? "gaze" : "head",
    facingLensPercent: pct(present.filter(facing).length, present.length),
    longestLookAwayMs: longestAway,
    smilePercent: pct(present.filter((s) => s.smile >= t.smile).length, present.length),
    expressiveness: Math.min(100, Math.round(stddev(present.map((s) => s.smile)) * 250)),
    headMovement: Math.round(((stddev(present.map((s) => s.yaw)) + stddev(present.map((s) => s.pitch))) / 2) * 10) / 10,
    blinksPerMinute: Math.round(blinks / durationMin),
    framedPercent: pct(present.filter((s) => s.framed).length, timeline.length),
  };
  if (!hasGaze) return metrics;

  const open = present.filter((s) => s.eyesOpen >= t.eyesClosed);
  const rolls = present.map((s) => Math.abs(s.roll ?? 0));
  // Smile, brows and jaw together: a face that moves with the words.
  const expression =
    (stddev(present.map((s) => s.smile)) + stddev(present.map((s) => s.browRaise ?? 0)) + stddev(present.map((s) => s.jawOpen ?? 0))) / 3;
  return {
    ...metrics,
    expressiveness: Math.min(100, Math.round(expression * 400)),
    lookingDownPercent: pct(open.filter((s) => (s.gazeY ?? 0) <= t.lookingDown).length, open.length),
    headTiltDeg: Math.round(median(rolls) * 10) / 10,
    tiltedPercent: pct(rolls.filter((r) => r > t.tiltedDeg).length, rolls.length),
    browRaisesPerMinute: Math.round(risingEdges(present.map((s) => s.browRaise ?? 0), t.browRaise) / durationMin),
    tensePercent: pct(present.filter((s) => (s.browDown ?? 0) >= t.tense || (s.mouthPress ?? 0) >= t.tense).length, present.length),
  };
}
