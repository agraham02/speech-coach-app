import { DEFAULT_CONFIG, parseServerConfig } from "../config";
import { pickModel, hashToPercent } from "../models";

describe("parseServerConfig", () => {
  it("accepts the default config", () => {
    expect(parseServerConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it("needs the launch switch and the minors policy written down", () => {
    const { plusPurchasable: _a, ...noSwitch } = structuredClone(DEFAULT_CONFIG);
    expect(() => parseServerConfig(noSwitch)).toThrow();
    const { minorsMayUseAi: _b, ...noPolicy } = structuredClone(DEFAULT_CONFIG);
    expect(() => parseServerConfig(noPolicy)).toThrow();
  });

  it("keeps minors off Tono AI by default (the Gemini API terms)", () => {
    expect(DEFAULT_CONFIG.minorsMayUseAi).toBe(false);
  });

  it("turns the switch on when asked", () => {
    expect(parseServerConfig({ ...DEFAULT_CONFIG, mode: "launch", plusPurchasable: true })).toMatchObject({ mode: "launch", plusPurchasable: true });
  });

  it("refuses a model with no price row", () => {
    const bad = structuredClone(DEFAULT_CONFIG);
    bad.models.review_video.primary = "gemini-unpriced";
    expect(() => parseServerConfig(bad)).toThrow(/no price row/);
  });

  it("refuses an unpriced fallback or candidate too", () => {
    const fallback = structuredClone(DEFAULT_CONFIG);
    fallback.models.text.fallback = "gemini-unpriced";
    expect(() => parseServerConfig(fallback)).toThrow(/no price row/);

    const candidate = structuredClone(DEFAULT_CONFIG);
    candidate.models.insight.candidate = { model: "gemini-unpriced", rolloutPercent: 10 };
    expect(() => parseServerConfig(candidate)).toThrow(/no price row/);
  });

  it("refuses a bad shape", () => {
    expect(() => parseServerConfig({ ...DEFAULT_CONFIG, mode: "demo" })).toThrow();
    expect(() => parseServerConfig({ ...DEFAULT_CONFIG, freeBudgetUsd: -1 })).toThrow();
  });
});

describe("pickModel", () => {
  it("gives the primary and its fallback when there is no candidate", () => {
    expect(pickModel("review_video", "user-1", DEFAULT_CONFIG)).toEqual({
      model: "gemini-3.5-flash-lite",
      fallback: "gemini-3.8-flash",
      isCandidate: false,
    });
  });

  const withCandidate = (rolloutPercent: number) => {
    const c = structuredClone(DEFAULT_CONFIG);
    c.models.review_video.candidate = { model: "gemini-3.1-flash-lite", rolloutPercent };
    return c;
  };

  it("sends everyone to the candidate at 100 percent and nobody at 0", () => {
    expect(pickModel("review_video", "user-1", withCandidate(100))).toEqual({
      model: "gemini-3.1-flash-lite",
      fallback: "gemini-3.5-flash-lite",
      isCandidate: true,
    });
    expect(pickModel("review_video", "user-1", withCandidate(0)).isCandidate).toBe(false);
  });

  it("keeps a user on the same side and rolls out close to the percentage", () => {
    const config = withCandidate(10);
    const ids = Array.from({ length: 4000 }, (_, i) => `user-${i}-${i * 7919}`);
    const hits = ids.filter((id) => pickModel("review_video", id, config).isCandidate).length;
    expect(hits / ids.length).toBeGreaterThan(0.08);
    expect(hits / ids.length).toBeLessThan(0.12);
    expect(pickModel("review_video", ids[3], config)).toEqual(pickModel("review_video", ids[3], config));
  });

  it("only touches the role that has a candidate", () => {
    expect(pickModel("text", "user-1", withCandidate(100)).isCandidate).toBe(false);
  });

  it("hashToPercent stays in 0-99", () => {
    for (const s of ["", "a", "user-1:text", "é"]) {
      const p = hashToPercent(s);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(100);
    }
  });
});
