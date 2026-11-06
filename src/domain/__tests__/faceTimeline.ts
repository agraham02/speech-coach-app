import type { PresenceSample } from "../presenceMetrics";

// Made-up face timelines for tests: 20 samples a second, a face that is
// present and looking at the lens unless a segment says otherwise.

export const HZ = 20;
export const DT_MS = 1000 / HZ;

export const LENS: Partial<PresenceSample> = {};
export const GLANCE_AWAY: Partial<PresenceSample> = { gazeX: 0.7 };
export const LOOK_DOWN: Partial<PresenceSample> = { gazeY: -0.6 };
export const LOOK_CEILING: Partial<PresenceSample> = { gazeY: 0.5 };
export const LOOK_SIDE: Partial<PresenceSample> = { gazeX: 0.8 };
export const NO_FACE: Partial<PresenceSample> = { present: false };

export function baseSample(tMs: number, over: Partial<PresenceSample> = {}): PresenceSample {
  return {
    tMs,
    present: true,
    yaw: 0,
    pitch: 0,
    smile: 0.05,
    eyesOpen: 0.8,
    framed: true,
    gazeX: 0,
    gazeY: 0,
    browRaise: 0.05,
    cheekSquint: 0.05,
    browDown: 0,
    mouthPress: 0,
    ...over,
  };
}

// A repeatable pseudo-random number in -1..1 for sample i (no Math.random).
export function jitter(i: number, seed = 1): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export interface Segment {
  sec: number;
  over?: Partial<PresenceSample> | ((i: number, tMs: number) => Partial<PresenceSample>);
}

// Segments laid end to end, starting at startMs.
export function timeline(segments: Segment[], startMs = 0): PresenceSample[] {
  const out: PresenceSample[] = [];
  let i = 0;
  for (const seg of segments) {
    const count = Math.round(seg.sec * HZ);
    for (let k = 0; k < count; k++, i++) {
      const tMs = startMs + i * DT_MS;
      const over = typeof seg.over === "function" ? seg.over(i, tMs) : seg.over;
      out.push(baseSample(tMs, over));
    }
  }
  return out;
}

export const lookingAtLens = (sec: number): PresenceSample[] => timeline([{ sec, over: LENS }]);

// sec seconds at the lens with 0.5 s glances away starting at each cue.
export function withGlances(sec: number, cuesMs: number[], glanceMs = 500, away = GLANCE_AWAY): PresenceSample[] {
  return timeline([{ sec, over: (_i, tMs) => (cuesMs.some((c) => tMs >= c && tMs < c + glanceMs) ? away : LENS) }]);
}

// sec seconds at the lens with one look-away at atMs for durMs.
export function withLookAway(sec: number, atMs: number, durMs: number, away = GLANCE_AWAY): PresenceSample[] {
  return withGlances(sec, [atMs], durMs, away);
}

// A face that barely moves: tracker jitter only.
export function stillFace(sec: number): PresenceSample[] {
  return timeline([
    {
      sec,
      over: (i) => ({
        smile: 0.05 + 0.01 * jitter(i, 1),
        cheekSquint: 0.05 + 0.01 * jitter(i, 2),
        browRaise: 0.05 + 0.01 * jitter(i, 3),
      }),
    },
  ]);
}

// A face that smiles and lifts its brows all the time.
export function animatedFace(sec: number): PresenceSample[] {
  const wave = (tMs: number, periodMs: number, phase = 0) => 0.5 + 0.5 * Math.sin((2 * Math.PI * tMs) / periodMs + phase);
  return timeline([
    {
      sec,
      over: (i, tMs) => ({
        smile: 0.05 + 0.5 * wave(tMs, 2500) + 0.01 * jitter(i, 1),
        cheekSquint: 0.05 + 0.4 * wave(tMs, 2500, 0.3) + 0.01 * jitter(i, 2),
        browRaise: 0.05 + 0.5 * wave(tMs, 1800, 1) + 0.01 * jitter(i, 3),
      }),
    },
  ]);
}

export interface Lift {
  atMs: number;
  durMs: number;
  kind: "brow" | "smile";
}

// A still face with brow lifts and smiles at the given times.
export function withFaceEvents(sec: number, lifts: Lift[], height = 0.7): PresenceSample[] {
  return timeline([
    {
      sec,
      over: (i, tMs) => {
        const hit = (kind: Lift["kind"]) => lifts.some((l) => l.kind === kind && tMs >= l.atMs && tMs < l.atMs + l.durMs);
        return {
          smile: hit("smile") ? height : 0.05 + 0.01 * jitter(i, 1),
          browRaise: hit("brow") ? height : 0.05 + 0.01 * jitter(i, 3),
        };
      },
    },
  ]);
}
