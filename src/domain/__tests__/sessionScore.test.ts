import { computeSessionScore, fillerScore, paceScore, type LocalMeasurements } from "../sessionScore";
import type { SessionScores } from "../sessionTypes";

const local: LocalMeasurements = {
  durationSeconds: 60,
  wpmAvg: 145,
  fillerRatePerMinute: 2,
  pitchRangeHz: 110,
  pauses: null,
  presence: {
    samples: 300,
    presentPercent: 100,
    eyeContactPercent: 75,
    eyeContactSource: "gaze",
    longestLookAwayMs: 1000,
    smilePercent: 10,
    expressiveness: 30,
    headMovement: 3,
    tiltedPercent: 0,
    blinksPerMinute: 15,
    framedPercent: 100,
  },
  coach: { structure: { framework: "PREP", beatsFound: 3, pointUpFront: true }, hedges: [], strongEnding: true },
};

function cloud(all: number, overall = all): SessionScores {
  return {
    sessionId: "s",
    structureScore: all,
    structureUsed: "other",
    structureNotes: "",
    relevanceScore: all,
    relevanceNotes: "",
    coherenceScore: all,
    coherenceNotes: "",
    rateScore: all,
    rateWpmAvg: 145,
    rateNotes: "",
    volumeScore: all,
    volumeNotes: "",
    pitchMelodyScore: all,
    pitchMelodyNotes: "",
    tonalityScore: all,
    tonalityNotes: "",
    pausingScore: all,
    pausingNotes: "",
    eyeContactScore: all,
    facialExpressivenessScore: all,
    bodyLanguageNotes: "",
    faceVoiceCongruenceScore: all,
    archetypeDetected: "Coach",
    archetypeFitForTopic: "",
    overallScore: overall,
    coachingSummary: "",
    topStrength: "",
    topFocusArea: "",
    recommendedDrill: "",
    annotations: [],
    cueComplianceScore: null,
    cueComplianceNotes: null,
  };
}

describe("sub-scores", () => {
  it("rewards the target pace band and few fillers", () => {
    expect(paceScore(145)).toBe(10);
    expect(paceScore(200)).toBeCloseTo(4.3, 1);
    expect(fillerScore(1)).toBe(10);
    expect(fillerScore(12)).toBe(2);
  });
});

describe("computeSessionScore", () => {
  it("scores a strong take from the phone alone", () => {
    const s = computeSessionScore(local, null)!;
    expect(s.sources).toEqual(["device"]);
    expect(s.overall).toBeGreaterThanOrEqual(9);
    expect(s.components.map((c) => c.key)).toEqual(["delivery", "fluency", "content", "presence"]);
    expect(s.components.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1);
  });

  it("blends in the cloud review, which pulls the score toward its judgment", () => {
    const deviceOnly = computeSessionScore(local, null)!.overall;
    const both = computeSessionScore(local, cloud(4))!;
    expect(both.sources).toEqual(["device", "cloud"]);
    expect(both.overall).toBeLessThan(deviceOnly);
    expect(both.overall).toBeGreaterThan(4);
    const content = both.components.find((c) => c.key === "content")!;
    // Content leans on the cloud (75%): 0.25 * 9 + 0.75 * 4.
    expect(content.score).toBeCloseTo(5.3, 1);
    expect(both.components.find((c) => c.key === "congruence")?.score).toBe(4);
  });

  it("returns null when nothing was measured", () => {
    expect(computeSessionScore({ durationSeconds: 10, wpmAvg: null, fillerRatePerMinute: null, pitchRangeHz: null, pauses: null, presence: null, coach: null }, null)).toBeNull();
  });

  it("works from the cloud review alone", () => {
    const s = computeSessionScore({ durationSeconds: 10, wpmAvg: null, fillerRatePerMinute: null, pitchRangeHz: null, pauses: null, presence: null, coach: null }, cloud(7))!;
    expect(s.overall).toBe(7);
    expect(s.sources).toEqual(["cloud"]);
  });
});
