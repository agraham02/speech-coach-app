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

// Head within this many degrees of straight-on counts as facing the lens.
export const EYE_CONTACT_MAX_DEG = 15;
// With gaze data the head may turn a little more, as long as the eyes come
// back to the lens.
const GAZE_HEAD_MAX_DEG = 20;
// Eye-in-head offset (blendshape units, ~0.35 ≈ 10°) still counted as on
// the lens. Generous on purpose: the phone's lens sits just above the
// screen, and glancing at your own preview shouldn't count as looking away.
const GAZE_MAX_OFFSET = 0.35;
const LOOKING_DOWN = -0.35;
const TILTED_DEG = 12;
const SMILE_THRESHOLD = 0.5;
const EYES_CLOSED = 0.3;
const BROW_RAISE = 0.5;
const TENSE = 0.45;

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

export function computePresenceMetrics(timeline: PresenceSample[]): PresenceMetrics | null {
  if (timeline.length < 3) return null;
  const present = timeline.filter((s) => s.present);
  const hasGaze = present.some((s) => s.gazeX !== undefined);

  const facing = (s: PresenceSample) =>
    s.present && Math.abs(s.yaw) <= EYE_CONTACT_MAX_DEG && Math.abs(s.pitch) <= EYE_CONTACT_MAX_DEG;
  // A blink drags the "look down" blendshapes up, so a closed-eye sample
  // keeps whatever the eyes were doing rather than reading as looking away.
  const looking = (s: PresenceSample) => {
    if (!hasGaze) return facing(s);
    if (!s.present || Math.abs(s.yaw) > GAZE_HEAD_MAX_DEG || Math.abs(s.pitch) > GAZE_HEAD_MAX_DEG) return false;
    if (s.eyesOpen < EYES_CLOSED) return true;
    return Math.hypot(s.gazeX ?? 0, s.gazeY ?? 0) <= GAZE_MAX_OFFSET;
  };

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

  const blinks = risingEdges(
    present.map((s) => 1 - s.eyesOpen),
    1 - EYES_CLOSED,
  );
  const durationMin = Math.max((timeline[timeline.length - 1].tMs - timeline[0].tMs) / 60000, 1 / 60);

  const metrics: PresenceMetrics = {
    samples: timeline.length,
    presentPercent: pct(present.length, timeline.length),
    eyeContactPercent: pct(present.filter(looking).length, present.length),
    eyeContactSource: hasGaze ? "gaze" : "head",
    facingLensPercent: pct(present.filter(facing).length, present.length),
    longestLookAwayMs: longestAway,
    smilePercent: pct(present.filter((s) => s.smile >= SMILE_THRESHOLD).length, present.length),
    expressiveness: Math.min(100, Math.round(stddev(present.map((s) => s.smile)) * 250)),
    headMovement: Math.round(((stddev(present.map((s) => s.yaw)) + stddev(present.map((s) => s.pitch))) / 2) * 10) / 10,
    blinksPerMinute: Math.round(blinks / durationMin),
    framedPercent: pct(present.filter((s) => s.framed).length, timeline.length),
  };
  if (!hasGaze) return metrics;

  const open = present.filter((s) => s.eyesOpen >= EYES_CLOSED);
  const rolls = present.map((s) => Math.abs(s.roll ?? 0));
  // Smile, brows and jaw together: a face that moves with the words.
  const expression =
    (stddev(present.map((s) => s.smile)) + stddev(present.map((s) => s.browRaise ?? 0)) + stddev(present.map((s) => s.jawOpen ?? 0))) / 3;
  return {
    ...metrics,
    expressiveness: Math.min(100, Math.round(expression * 400)),
    lookingDownPercent: pct(open.filter((s) => (s.gazeY ?? 0) <= LOOKING_DOWN).length, open.length),
    headTiltDeg: Math.round(median(rolls) * 10) / 10,
    tiltedPercent: pct(rolls.filter((r) => r > TILTED_DEG).length, rolls.length),
    browRaisesPerMinute: Math.round(risingEdges(present.map((s) => s.browRaise ?? 0), BROW_RAISE) / durationMin),
    tensePercent: pct(present.filter((s) => (s.browDown ?? 0) >= TENSE || (s.mouthPress ?? 0) >= TENSE).length, present.length),
  };
}
