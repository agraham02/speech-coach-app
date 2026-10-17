import { blendRepEvidence, cloudRepEvidence, localRepEvidence, REVIEW_SHARE } from "../repEvidence";
import { cloudFactors, computeSessionScore, SCORE_BREAKDOWN_VERSION, type LocalMeasurements } from "../sessionScore";
import { evaluateSkillCheck } from "../skillCheck";
import type { CoachOutput } from "../coach/ruleCoach";
import type { SessionScores } from "../sessionTypes";

function cloud(all: number, overall = all): SessionScores {
  return {
    sessionId: "s",
    structureScore: all,
    structureUsed: "other",
    structureNotes: "Capped by a missing example.",
    relevanceScore: all,
    relevanceNotes: "",
    coherenceScore: all,
    coherenceNotes: "",
    rateScore: all,
    rateWpmAvg: 150,
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

const local: LocalMeasurements = {
  durationSeconds: 60,
  wpmAvg: 190,
  fillerRatePerMinute: 6,
  pitchRangeHz: 55,
  pauses: { boundaryPauseRate: 0.3, hesitations: 2 } as LocalMeasurements["pauses"],
  presence: null,
  coach: { structure: { framework: "None", beatsFound: 0, pointUpFront: false }, hedges: ["I think", "kind of", "maybe", "sort of"], strongEnding: false },
};

describe("a reviewer that watched the video leads", () => {
  it("takes a bigger share of each category than a measurements-only reviewer", () => {
    const video = computeSessionScore(local, cloud(9), "video")!;
    const text = computeSessionScore(local, cloud(9), "measurements")!;
    expect(video.overall).toBeGreaterThan(text.overall);
    expect(video.components.find((c) => c.key === "delivery")!.cloudShare).toBe(0.7);
    expect(text.components.find((c) => c.key === "delivery")!.cloudShare).toBe(0.5);
    expect(video.cloudOverallShare).toBe(0.25);
    expect(video.version).toBe(SCORE_BREAKDOWN_VERSION);
  });

  it("keeps fluency on the phone — no reviewer scores fillers on their own", () => {
    const s = computeSessionScore(local, cloud(9), "video")!;
    expect(s.components.find((c) => c.key === "fluency")!.cloudShare).toBe(0);
  });
});

describe("score factors", () => {
  it("explains what took points away, with the measurement", () => {
    const s = computeSessionScore(local, null)!;
    const delivery = s.components.find((c) => c.key === "delivery")!;
    const pace = delivery.factors!.find((f) => f.label === "Pace")!;
    expect(pace.value).toBe("190 words a minute");
    expect(pace.rule).toMatch(/30 over/);
    expect(pace.score).toBeLessThan(10);

    const content = s.components.find((c) => c.key === "content")!;
    expect(content.factors!.find((f) => f.label === "Ending")!.delta).toBe(-1);
    expect(content.factors!.find((f) => f.label === "Hedges")!.delta).toBe(-1);
    // 4 (no shape) - 1 (trailed off) - 1 (two hedges past the free two)
    expect(content.local).toBe(2);
  });

  it("lists the reviewer's own sub-scores with their notes", () => {
    const content = cloudFactors(cloud(6), "content");
    expect(content).toHaveLength(3);
    expect(content[0].notes).toBe("Capped by a missing example.");
    expect(cloudFactors(cloud(6), "fluency")).toEqual([]);
  });
});

describe("rep evidence", () => {
  const coach = {
    observations: [
      { skill: "cadence", label: "Pace", value: "190 wpm", verdict: "work" },
      { skill: "articulation", label: "Clarity", value: "", verdict: "good" },
    ],
  } as unknown as CoachOutput;

  it("blends the review in where both exist, and keeps phone-only skills", () => {
    const blended = blendRepEvidence(localRepEvidence(coach), cloudRepEvidence(cloud(8)), "video");
    // cadence: 0.3 * 0.3 + 0.8 * 0.7
    expect(blended.cadence).toBeCloseTo(0.3 * (1 - REVIEW_SHARE.video) + 0.8 * REVIEW_SHARE.video, 5);
    expect(blended.articulation).toBeCloseTo(0.9, 5);
    // Only the review judged these.
    expect(blended.impromptu).toBeCloseTo(0.8, 5);
    expect(blended.confidence).toBeCloseTo(0.8, 5);
  });

  it("is just the phone's verdicts without a review", () => {
    expect(blendRepEvidence(localRepEvidence(coach), {}, "video")).toEqual({ cadence: 0.3, articulation: 0.9 });
  });
});

describe("skill check with a deep review", () => {
  const base = { talkWpm: 190, boundaryPauseRate: 0.2, pitchRangeHz: 40, talkSeconds: 90 };

  it("lets the review lead the skills it judged, and says so first", () => {
    const phoneOnly = evaluateSkillCheck(base);
    const reviewed = evaluateSkillCheck({ ...base, review: { cadence: 8, impromptu: null, confidence: 3, source: "video" } });
    expect(reviewed.skills.cadence.score!).toBeGreaterThan(phoneOnly.skills.cadence.score!);
    expect(reviewed.skills.cadence.good[0]).toMatch(/AI coach scored pace, pitch and pauses 8/);
    expect(reviewed.skills.confidence.score).toBe(3);
    expect(reviewed.skills.confidence.work[0]).toMatch(/clearest place to start/);
    expect(reviewed.skills.impromptu.score).toBeNull();
  });
});
