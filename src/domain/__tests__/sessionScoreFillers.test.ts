import { computeSessionScore, type LocalMeasurements } from "../sessionScore";

const base: LocalMeasurements = {
  durationSeconds: 60,
  wpmAvg: 140,
  fillerRatePerMinute: 8,
  pitchRangeHz: 120,
  pauses: null,
  presence: null,
  coach: null,
};

function fillerFactor(local: LocalMeasurements) {
  const breakdown = computeSessionScore(local, null, "video");
  return breakdown?.components.find((c) => c.key === "fluency")?.factors?.find((f) => f.label === "Filler words");
}

describe("filler words factor", () => {
  it("scores the rate it is given", () => {
    // 2 a minute free, 0.8 off for each one after: 8 a minute is 5.2.
    expect(fillerFactor(base)?.score).toBeCloseTo(5.2, 1);
  });

  it("says when the AI coach counted them", () => {
    expect(fillerFactor({ ...base, fillersFromAi: true })?.value).toBe("8 a minute (counted by your AI coach)");
    expect(fillerFactor(base)?.value).toBe("8 a minute");
  });
});
