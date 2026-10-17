import { classifyLook, computePresenceMetrics, DEFAULT_PRESENCE_THRESHOLDS, type PresenceSample } from "../presenceMetrics";

const base = (extra: Partial<PresenceSample> = {}): PresenceSample => ({
  tMs: 0,
  present: true,
  yaw: 0,
  pitch: 0,
  roll: 0,
  smile: 0.1,
  eyesOpen: 0.9,
  framed: true,
  gazeX: 0,
  gazeY: 0,
  browRaise: 0,
  browDown: 0,
  jawOpen: 0.1,
  mouthPress: 0,
  ...extra,
});

describe("classifyLook", () => {
  it("says on_lens for a centered face", () => {
    expect(classifyLook(base())).toEqual({ looking: true, reason: "on_lens" });
  });

  it("reports no_face when nobody is there", () => {
    expect(classifyLook(base({ present: false }))).toEqual({ looking: false, reason: "no_face" });
  });

  it("reports head_away with the value and the limit", () => {
    const result = classifyLook(base({ yaw: 24 }));
    expect(result).toMatchObject({ looking: false, reason: "head_away", limit: DEFAULT_PRESENCE_THRESHOLDS.gazeHeadMaxDeg });
    expect(result.value).toBe(24);
  });

  it("reports eyes_away when the eyes leave the lens but the head stays", () => {
    const result = classifyLook(base({ gazeX: 0.3, gazeY: -0.3 }));
    expect(result.reason).toBe("eyes_away");
    expect(result.value).toBeCloseTo(Math.hypot(0.3, 0.3));
    expect(result.limit).toBe(DEFAULT_PRESENCE_THRESHOLDS.gazeMaxOffset);
  });

  it("counts a blink as on the lens", () => {
    expect(classifyLook(base({ eyesOpen: 0.1, gazeY: -0.8 }))).toEqual({ looking: true, reason: "blink" });
  });

  it("uses only head pose for older timelines without gaze", () => {
    expect(classifyLook(base({ yaw: 18 }), DEFAULT_PRESENCE_THRESHOLDS, false)).toMatchObject({ looking: false, reason: "head_away", limit: 15 });
    expect(classifyLook(base({ yaw: 10 }), DEFAULT_PRESENCE_THRESHOLDS, false).looking).toBe(true);
  });
});

describe("computePresenceMetrics thresholds", () => {
  const timeline = Array.from({ length: 20 }, (_, i) => base({ tMs: i * 200, gazeX: 0.3, gazeY: -0.3 }));

  it("gives the same numbers with no thresholds as with the defaults", () => {
    expect(computePresenceMetrics(timeline)).toEqual(computePresenceMetrics(timeline, DEFAULT_PRESENCE_THRESHOLDS));
  });

  it("changes eye contact when the gaze limit is loosened", () => {
    expect(computePresenceMetrics(timeline)!.eyeContactPercent).toBe(0);
    const loose = { ...DEFAULT_PRESENCE_THRESHOLDS, gazeMaxOffset: 0.6 };
    expect(computePresenceMetrics(timeline, loose)!.eyeContactPercent).toBe(100);
  });

  it("changes looking-down when its limit moves", () => {
    expect(computePresenceMetrics(timeline)!.lookingDownPercent).toBe(0);
    const strict = { ...DEFAULT_PRESENCE_THRESHOLDS, lookingDown: -0.2 };
    expect(computePresenceMetrics(timeline, strict)!.lookingDownPercent).toBe(100);
  });
});
