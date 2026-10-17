import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";
import { buildCalibration, calibratedThresholds, normalizeSample, normalizeTimeline, parseCalibration } from "../faceCalibration";
import {
  feedTries,
  newTryState,
  readFace,
  ReadoutSmoother,
  summarizeCenter,
  TRIES,
  TRY_HOLD_MS,
  ZERO_CENTER,
  type FaceCenter,
  type FaceReading,
  type TryState,
} from "../faceReadout";
import { headProxies } from "../faceSignals";
import { DEFAULT_PRESENCE_THRESHOLDS, type PresenceSample } from "../presenceMetrics";

function reading(tMs: number, over: Partial<PresenceSample> = {}, extra: Partial<FaceReading> = {}): FaceReading {
  return {
    tMs,
    framed: true,
    tip: 0.42,
    turn: 0,
    sample: { tMs, present: true, yaw: 0, pitch: 0, smile: 0.05, eyesOpen: 1, framed: true, gazeX: 0, gazeY: 0, browRaise: 0.05, ...over },
    ...extra,
  };
}

const CENTER: FaceCenter = { ...ZERO_CENTER, tip: 0.42, smile: 0.05, browRaise: 0.05 };

describe("headProxies", () => {
  // Upright preview landmarks in LANDMARK_INDICES order: nose, forehead, chin,
  // edge right, edge left, eye right, eye left, between eyes, lips.
  function face(nose: [number, number]): FaceLandmarkerFace {
    const pts: [number, number][] = [nose, [0.5, 0.2], [0.5, 0.7], [0.35, 0.45], [0.65, 0.45], [0.42, 0.4], [0.58, 0.4], [0.5, 0.4], [0.5, 0.55], [0.5, 0.58]];
    return { width: 480, height: 640, bounds: [0.3, 0.2, 0.7, 0.7], landmarks: pts.flatMap(([x, y]) => [x, y, 0]), blendshapes: {}, matrix: [] };
  }

  it("reads a level, straight-on head as roughly zero turn", () => {
    const p = headProxies(face([0.5, 0.52]))!;
    expect(p.turn).toBeCloseTo(0);
    expect(p.tip).toBeCloseTo(0.4);
  });

  it("grows tip as the nose drops toward the chin, and turn toward the screen right", () => {
    const level = headProxies(face([0.5, 0.52]))!;
    const down = headProxies(face([0.5, 0.56]))!;
    const right = headProxies(face([0.56, 0.52]))!;
    expect(down.tip).toBeGreaterThan(level.tip);
    expect(right.turn).toBeGreaterThan(level.turn);
  });

  it("returns null without the landmarks, or on a flipped face", () => {
    expect(headProxies({ ...face([0.5, 0.5]), landmarks: [] })).toBeNull();
    const flipped = face([0.5, 0.5]);
    flipped.landmarks[3 * 3] = 0.7;
    flipped.landmarks[4 * 3] = 0.3;
    expect(headProxies(flipped)).toBeNull();
  });
});

describe("readFace", () => {
  it("says nothing without a face", () => {
    expect(readFace(null)).toMatchObject({ face: "out", eyes: null, head: null });
  });

  it("puts the eyes on screen near the center, and off to a side beyond it", () => {
    expect(readFace(reading(0), CENTER).eyes).toBe("on");
    expect(readFace(reading(0, { gazeX: 0.5 }), CENTER).eyes).toBe("right");
    expect(readFace(reading(0, { gazeX: -0.5 }), CENTER).eyes).toBe("left");
    expect(readFace(reading(0, { gazeY: 0.5 }), CENTER).eyes).toBe("up");
    expect(readFace(reading(0, { gazeY: -0.5 }), CENTER).eyes).toBe("down");
  });

  it("measures from the person's own center", () => {
    const lowPhone: FaceCenter = { ...CENTER, gazeY: -0.3 };
    expect(readFace(reading(0, { gazeY: -0.3 }), lowPhone).eyes).toBe("on");
    expect(readFace(reading(0, { gazeY: -0.3 }), CENTER).eyes).toBe("down");
  });

  it("does not trust the gaze while the eyes are shut", () => {
    expect(readFace(reading(0, { eyesOpen: 0.1, gazeY: -0.9 }), CENTER).eyes).toBe("closed");
  });

  it("reads head tip and turn against level", () => {
    expect(readFace(reading(0), CENTER).head).toBe("level");
    expect(readFace(reading(0, {}, { tip: 0.42 + 0.05 }), CENTER).head).toBe("down");
    expect(readFace(reading(0, {}, { tip: 0.42 - 0.05 }), CENTER).head).toBe("up");
    expect(readFace(reading(0, {}, { turn: 0.08 }), CENTER).head).toBe("right");
    expect(readFace(reading(0, {}, { turn: -0.08 }), CENTER).head).toBe("left");
  });

  it("calls a smile and raised brows only when they rise over the resting face", () => {
    expect(readFace(reading(0, { smile: 0.4 }), CENTER).smiling).toBe(true);
    expect(readFace(reading(0, { smile: 0.2 }), CENTER).smiling).toBe(false);
    expect(readFace(reading(0, { browRaise: 0.5 }), CENTER).brows).toBe(true);
    expect(readFace(reading(0), CENTER).brows).toBe(false);
  });

  it("marks a face near the edge", () => {
    expect(readFace(reading(0, {}, { framed: false }), CENTER).face).toBe("edge");
  });
});

describe("ReadoutSmoother", () => {
  it("holds a label until it has been seen twice in a row", () => {
    const s = new ReadoutSmoother(2);
    const on = readFace(reading(0), CENTER);
    const right = readFace(reading(0, { gazeX: 0.6 }), CENTER);
    expect(s.push(on).eyes).toBe(null);
    expect(s.push(on).eyes).toBe("on");
    expect(s.push(right).eyes).toBe("on");
    expect(s.push(on).eyes).toBe("on");
    expect(s.push(right).eyes).toBe("on");
    expect(s.push(right).eyes).toBe("right");
  });
});

describe("feedTries", () => {
  function run(frames: { t: number; r: FaceReading | null }[], start: TryState = newTryState()) {
    let state = start;
    const ticked: string[] = [];
    for (const f of frames) {
      const out = feedTries(state, f.r, CENTER, f.t);
      state = out.state;
      ticked.push(...out.newlyDone);
    }
    return { state, ticked };
  }
  const hold = (over: Partial<PresenceSample>, extra: Partial<FaceReading> = {}, from = 0, ms = TRY_HOLD_MS + 200) =>
    Array.from({ length: Math.floor(ms / 100) + 1 }, (_, i) => ({ t: from + i * 100, r: reading(from + i * 100, over, extra) }));

  it("has seven things to try", () => {
    expect(TRIES.map((t) => t.id)).toEqual(["left", "right", "up", "down", "smile", "brows", "out"]);
  });

  it("ticks a look to the left after it has held, and records how far the eyes went", () => {
    const { state, ticked } = run(hold({ gazeX: -0.55 }));
    expect(ticked).toEqual(["left"]);
    expect(state.peaks.gazeLeft).toBeCloseTo(0.55);
  });

  it("does not tick a flick that does not hold", () => {
    const { ticked } = run([{ t: 0, r: reading(0, { gazeX: -0.6 }) }, { t: 100, r: reading(100) }, ...hold({ gazeX: -0.6 }, {}, 200, 200)]);
    expect(ticked).toEqual([]);
  });

  it("accepts a turn of the head for left and right, with no gaze peak", () => {
    const { state, ticked } = run(hold({}, { turn: 0.09 }));
    expect(ticked).toEqual(["right"]);
    expect(state.peaks.gazeRight).toBeUndefined();
  });

  it("ticks chin up, chin down, smile and brows", () => {
    const up = run(hold({}, { tip: 0.42 - 0.06 }));
    expect(up.ticked).toEqual(["up"]);
    const down = run(hold({}, { tip: 0.42 + 0.06 }));
    expect(down.ticked).toEqual(["down"]);
    expect(run(hold({ smile: 0.5 })).ticked).toEqual(["smile"]);
    const brows = run(hold({ browRaise: 0.6 }));
    expect(brows.ticked).toEqual(["brows"]);
    expect(brows.state.peaks.brows).toBeCloseTo(0.55);
  });

  it("ticks stepping out of frame once the face is back", () => {
    const gone = Array.from({ length: 10 }, (_, i) => ({ t: i * 100, r: null }));
    expect(run(gone).ticked).toEqual([]);
    const back = run([...gone, { t: 1000, r: reading(1000) }]);
    expect(back.ticked).toEqual(["out"]);
  });

  it("ignores a gaze reading while the eyes are shut", () => {
    expect(run(hold({ gazeX: -0.8, eyesOpen: 0.1 })).ticked).toEqual([]);
  });

  it("never un-ticks", () => {
    const first = run(hold({ smile: 0.5 }));
    const second = run(hold({}, {}, 2000), first.state);
    expect(second.state.done).toContain("smile");
  });
});

describe("summarizeCenter", () => {
  const frames = (over: Partial<PresenceSample>, extra: Partial<FaceReading> = {}, n = 20) => Array.from({ length: n }, (_, i) => reading(i * 100, over, extra));

  it("takes the medians of a framed, eyes-open look at the lens", () => {
    const s = summarizeCenter(frames({ gazeX: 0.05, gazeY: -0.1, yaw: 3, pitch: -4, smile: 0.1, browRaise: 0.08 }, { tip: 0.45, turn: 0.01 }));
    expect(s.usable).toBe(true);
    expect(s.center.gazeY).toBeCloseTo(-0.1);
    expect(s.center.pitch).toBeCloseTo(-4);
    expect(s.center.tip).toBeCloseTo(0.45);
    expect(s.center.smile).toBeCloseTo(0.1);
    expect(s.discarded).toEqual([]);
  });

  it("is not usable with too little to go on", () => {
    expect(summarizeCenter(frames({}, {}, 4)).usable).toBe(false);
    expect(summarizeCenter(frames({}, { framed: false })).usable).toBe(false);
  });

  it("leaves the gaze and pose at zero when they were plainly not on the lens", () => {
    const s = summarizeCenter(frames({ gazeX: 0.5, gazeY: 0, yaw: 25, pitch: 0 }));
    expect(s.usable).toBe(true);
    expect(s.center.gazeX).toBe(0);
    expect(s.center.yaw).toBe(0);
    expect(s.discarded).toEqual(["gaze", "pose"]);
  });
});

describe("calibration", () => {
  const center: FaceCenter = { ...ZERO_CENTER, gazeX: 0.04, gazeY: -0.1, yaw: 2, pitch: -6, smile: 0.1, browRaise: 0.1 };
  const cal = (peaks = {}) => buildCalibration(center, peaks, new Date("2026-10-17T12:00:00Z"), "ios");

  it("keeps the defaults for anything that was skipped", () => {
    expect(calibratedThresholds(cal())).toEqual(DEFAULT_PRESENCE_THRESHOLDS);
  });

  it("moves the smile and brow cut-offs toward this face, within bounds", () => {
    const t = calibratedThresholds(cal({ smile: 0.5, brows: 0.4 }));
    expect(t.smile).toBeCloseTo(0.35);
    expect(t.browRaise).toBeCloseTo(0.3);
    expect(calibratedThresholds(cal({ smile: 0.95 })).smile).toBeLessThanOrEqual(0.7);
    expect(calibratedThresholds(cal({ smile: 0.1 })).smile).toBe(DEFAULT_PRESENCE_THRESHOLDS.smile);
  });

  it("scales the eye-contact radius to how far the eyes went, within bounds", () => {
    expect(calibratedThresholds(cal({ gazeLeft: 0.6, gazeRight: 0.5 })).gazeMaxOffset).toBeCloseTo(0.3);
    expect(calibratedThresholds(cal({ gazeLeft: 0.3 })).gazeMaxOffset).toBe(0.28);
    expect(calibratedThresholds(cal({ gazeLeft: 0.9, gazeRight: 0.95 })).gazeMaxOffset).toBe(0.45);
  });

  it("measures samples from the person's own center, and leaves absent faces alone", () => {
    const s: PresenceSample = { tMs: 0, present: true, yaw: 5, pitch: -2, smile: 0, eyesOpen: 1, framed: true, gazeX: 0.14, gazeY: -0.1 };
    const out = normalizeSample(s, cal());
    expect(out.yaw).toBe(3);
    expect(out.pitch).toBe(4);
    expect(out.gazeX).toBeCloseTo(0.1);
    expect(out.gazeY).toBeCloseTo(0);
    const gone: PresenceSample = { tMs: 0, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false };
    expect(normalizeTimeline([gone], cal())[0]).toBe(gone);
    const old: PresenceSample = { ...s, gazeX: undefined, gazeY: undefined };
    expect(normalizeSample(old, cal()).gazeX).toBeUndefined();
  });

  it("only trusts a saved calibration that is whole", () => {
    expect(parseCalibration(JSON.stringify(cal({ smile: 0.4 })))).toMatchObject({ version: 1, platform: "ios" });
    expect(parseCalibration(null)).toBeNull();
    expect(parseCalibration("not json")).toBeNull();
    expect(parseCalibration(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseCalibration(JSON.stringify({ version: 1, center: { gazeX: "x" }, rest: {} }))).toBeNull();
  });
});
