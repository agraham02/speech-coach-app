// On-device "video analysis": a face timeline sampled during recording
// (ML Kit via the vision-camera face detector) summarized into presence
// metrics. Re-runnable any time from the stored timeline.

export interface PresenceSample {
  tMs: number;
  present: boolean;
  yaw: number;
  pitch: number;
  smile: number; // 0-1
  eyesOpen: number; // 0-1, mean of both eyes
  framed: boolean;
}

export interface PresenceMetrics {
  samples: number;
  presentPercent: number;
  // Of the time your face was visible: facing the lens.
  eyeContactPercent: number;
  longestLookAwayMs: number;
  smilePercent: number;
  // Variation in facial expression (0-100): a flat face reads as a flat voice.
  expressiveness: number;
  headMovement: number; // stddev of yaw/pitch in degrees
  blinksPerMinute: number;
  framedPercent: number;
}

// Front-camera faces within this many degrees of straight-on count as
// looking at the lens.
export const EYE_CONTACT_MAX_DEG = 15;
const SMILE_THRESHOLD = 0.5;
const EYES_CLOSED = 0.3;

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function computePresenceMetrics(timeline: PresenceSample[]): PresenceMetrics | null {
  if (timeline.length < 3) return null;
  const present = timeline.filter((s) => s.present);
  const looking = (s: PresenceSample) =>
    s.present && Math.abs(s.yaw) <= EYE_CONTACT_MAX_DEG && Math.abs(s.pitch) <= EYE_CONTACT_MAX_DEG;

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

  let blinks = 0;
  for (let i = 1; i < present.length; i++) {
    if (present[i - 1].eyesOpen >= EYES_CLOSED && present[i].eyesOpen < EYES_CLOSED) blinks += 1;
  }
  const durationMin = Math.max((timeline[timeline.length - 1].tMs - timeline[0].tMs) / 60000, 1 / 60);

  return {
    samples: timeline.length,
    presentPercent: pct(present.length, timeline.length),
    eyeContactPercent: pct(present.filter(looking).length, present.length),
    longestLookAwayMs: longestAway,
    smilePercent: pct(present.filter((s) => s.smile >= SMILE_THRESHOLD).length, present.length),
    expressiveness: Math.min(100, Math.round(stddev(present.map((s) => s.smile)) * 250)),
    headMovement: Math.round(((stddev(present.map((s) => s.yaw)) + stddev(present.map((s) => s.pitch))) / 2) * 10) / 10,
    blinksPerMinute: Math.round(blinks / durationMin),
    framedPercent: pct(present.filter((s) => s.framed).length, timeline.length),
  };
}
