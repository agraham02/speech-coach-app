import { READINGS, readingCounts, trustLabel, type ReadingId } from "../../signalLab/readingTrust";
import { pillarOf, SCORE_SHEET_VERSION, takeScores, type TakeScores } from "../takeScore";
import type { TakeFacts } from "../takeLeaves";

// A take on the tree (plan 6.3): one sheet, 0-100, Delivery and Message apart,
// and unproven readings shown but left out.

const facts = (patch: Partial<TakeFacts> = {}): TakeFacts => ({
  kind: "impromptu",
  durationSeconds: 60,
  wpm: 145,
  paceSdSylPerSec: 0.8,
  paceDriftPercent: 2,
  boundaryPauseRate: 0.6,
  pitchPhraseSdSt: 3,
  endings: { statements: 4, rising: 1 },
  standOut: 2.2,
  strongOnContentShare: 0.5,
  lastWordCarry: { sentences: 4, trailing: 0 },
  fillers: { hesitationPerMinute: 1, contextualPerMinute: 0 },
  stalls: 0,
  restarts: 0,
  readAccuracyPercent: null,
  presence: { onLensPercent: 85, longLookAwaysPerMinute: 0, faceMovesPerMinute: 12 },
  hedges: 1,
  ending: "clear",
  pointFirst: true,
  structure: { framework: "PREP", shaped: true, beatsFound: 3 },
  wordsPerSentence: 12,
  longWordShare: 0.1,
  detoursPerMinute: 0,
  detailsPerMinute: 6,
  secondsToFirstWord: 1,
  ...patch,
});

const judged = { answers_question: { score: 60, notes: "Partly." }, has_shape: { score: 40, notes: null }, ideas_connect: { score: 60, notes: null } };
const judge = { producer: "tono_ai", provider: "Tono AI", model: "m", promptVersion: "1", judged: true, input: "text", at: "2026-11-07" } as never;

function leaf(scores: TakeScores, id: string) {
  return scores.pillars.flatMap((p) => p.skills).flatMap((s) => s.leaves).find((l) => l.id === id);
}

describe("a take without a content check", () => {
  const scores = takeScores(facts())!;

  it("says Delivery, and leaves Message out of the score", () => {
    expect(scores.headline).toBe("delivery");
    expect(scores.message).toBeNull();
    expect(scores.score).toBe(scores.delivery);
    expect(scores.judgedBy).toBeUndefined();
    expect(pillarOf(scores, "message")?.share).toBe(0);
  });

  it("is on 0-100, with Voice, Clarity and Presence sharing it equally", () => {
    expect(scores.score).toBeGreaterThan(90);
    expect(scores.score).toBeLessThanOrEqual(100);
    for (const id of ["voice", "clarity", "presence"] as const) expect(pillarOf(scores, id)?.share).toBeCloseTo(1 / 3);
    expect(scores.version).toBe(SCORE_SHEET_VERSION);
    expect(scores.pillars.map((p) => p.id)).toEqual(["message", "voice", "clarity", "presence"]);
  });

  it("still shows the phone's estimates of Message, labelled", () => {
    expect(leaf(scores, "point_first")).toMatchObject({ source: "phone_estimate", score: 100 });
  });
});

describe("a judged take", () => {
  const scores = takeScores(facts({ judged }), judge)!;

  it("says Overall: Message 40, the rest 20 each", () => {
    expect(scores.headline).toBe("overall");
    expect(pillarOf(scores, "message")?.share).toBeCloseTo(0.4);
    expect(pillarOf(scores, "voice")?.share).toBeCloseTo(0.2);
    expect(scores.judgedBy).toBe(judge);
    expect(scores.message).not.toBeNull();
    const weighted = (scores.message! * 40 + pillarOf(scores, "voice")!.score! * 20 + pillarOf(scores, "clarity")!.score! * 20 + pillarOf(scores, "presence")!.score! * 20) / 100;
    expect(Math.abs(scores.score - weighted)).toBeLessThan(1);
  });

  it("keeps Delivery the same with or without the judge (plan 6.4, rule 4)", () => {
    expect(scores.delivery).toBe(takeScores(facts())!.delivery);
  });

  it("marks who judged what, and keeps the judge's note", () => {
    expect(leaf(scores, "answers_question")).toMatchObject({ source: "judge", score: 60, notes: "Partly." });
    expect(leaf(scores, "has_shape")).toMatchObject({ source: "judge", score: 40 });
    expect(leaf(scores, "speaking_rate")?.source).toBe("measured");
    expect(leaf(scores, "point_first")?.source).toBe("phone_estimate");
  });

  it("can't be moved on delivery by a judge: no leaf outside Message is the judge's", () => {
    for (const pillar of scores.pillars) if (pillar.id !== "message") for (const skill of pillar.skills) for (const l of skill.leaves) expect(l.source).toBe("measured");
  });
});

describe("what's in the score", () => {
  it("leaves out what wasn't measured, and shares its weight", () => {
    const scores = takeScores(facts({ presence: null, hedges: null, ending: null }))!;
    expect(pillarOf(scores, "presence")).toBeUndefined();
    expect(pillarOf(scores, "voice")?.share).toBeCloseTo(0.5);
    expect(pillarOf(scores, "clarity")?.share).toBeCloseTo(0.5);
  });

  it("is the weighted mean of its pillars, so a summary agrees with its breakdown", () => {
    const scores = takeScores(facts({ fillers: { hesitationPerMinute: 8, contextualPerMinute: 0 }, wpm: 100 }))!;
    const mean = (pillarOf(scores, "voice")!.score! + pillarOf(scores, "clarity")!.score! + pillarOf(scores, "presence")!.score!) / 3;
    expect(Math.abs(scores.score - mean)).toBeLessThan(1);
    expect(scores.score).toBeLessThan(100);
  });

  it("has no score with nothing that counts", () => {
    const nothing = facts({ wpm: null, paceSdSylPerSec: null, paceDriftPercent: null, boundaryPauseRate: null, pitchPhraseSdSt: null, endings: null, standOut: null, strongOnContentShare: null, lastWordCarry: null, fillers: null, stalls: null, restarts: null, presence: null, hedges: null, ending: null });
    expect(takeScores(nothing)).toBeNull();
    // Unproven readings alone don't make a score either.
    expect(takeScores({ ...nothing, endings: { statements: 4, rising: 0 } })).toBeNull();
  });

  it("shows an unproven reading, labelled, and leaves it out", () => {
    const scores = takeScores(facts())!;
    const endings = leaf(scores, "endings_fall")!;
    expect(endings).toMatchObject({ counts: false, trust: "probation", score: 75 });
    expect(trustLabel(endings.trust!)).toBe("Beta · not proven yet");
    // Melody is Pitch variety alone, at 100, however low the endings read.
    expect(pillarOf(takeScores(facts({ endings: { statements: 4, rising: 4 } }))!, "voice")!.skills.find((s) => s.id === "melody")!.score).toBe(100);
  });

  it("counts it under the Dev preview", () => {
    const scores = takeScores(facts({ endings: { statements: 4, rising: 4 } }), undefined, { preview: { endings_fall: true } })!;
    expect(leaf(scores, "endings_fall")).toMatchObject({ counts: true, score: 0 });
    expect(pillarOf(scores, "voice")!.skills.find((s) => s.id === "melody")!.score).toBe(60);
  });

  it("gives a script take no Message, and no words read for Presence", () => {
    const scores = takeScores(facts({ kind: "script", readAccuracyPercent: 90, judged }), judge)!;
    expect(scores.headline).toBe("delivery");
    expect(pillarOf(scores, "message")).toBeUndefined();
    expect(leaf(scores, "read_accuracy")?.score).toBe(90);
    expect(leaf(scores, "hedges")).toBeUndefined();
    expect(leaf(scores, "on_lens")).toBeDefined();
  });

  it("leaves Fillers and Flow out for someone who stutters", () => {
    const scores = takeScores(facts({ fillers: null, stalls: null, restarts: null }))!;
    expect(pillarOf(scores, "clarity")).toBeUndefined();
    expect(pillarOf(scores, "voice")?.share).toBeCloseTo(0.5);
  });

  it("shows raw numbers on the leaves", () => {
    const scores = takeScores(facts({ fillers: { hesitationPerMinute: 2.1, contextualPerMinute: 0 } }))!;
    expect(leaf(scores, "ums_uhs")?.value).toBe("2.1 ums a minute");
    expect(leaf(scores, "speaking_rate")?.value).toBe("145 words a minute");
  });
});

describe("today's statuses", () => {
  it("counts what Signal Lab proved on the phone, and only that", () => {
    for (const id of ["sentence_end_pauses", "deliberate_pauses", "pitch_variety", "stand_out_stress", "volume_carry", "on_the_lens", "long_lookaways", "face_movement"] as ReadingId[]) expect([id, readingCounts(id)]).toEqual([id, true]);
    for (const id of ["endings_fall", "stress_right_words", "range_across_feelings"] as ReadingId[]) expect([id, READINGS[id].status === "now"]).toEqual([id, false]);
  });

  it("leaves Stress on the right words on Beta in a take", () => {
    expect(leaf(takeScores(facts())!, "stress_right_words")).toMatchObject({ counts: false, trust: "probation" });
    expect(leaf(takeScores(facts())!, "face_movement")).toMatchObject({ counts: true });
  });
});
