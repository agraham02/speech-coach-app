import { phrasePitchBand, phrasePitchScore, standOutScore, FIXED_PHRASE_PITCH_BAND } from "../bands";
import { buildTakeFacts, type TakeFactsInput } from "../takeFacts";
import { takeLeafReadings, type TakeFacts } from "../takeLeaves";

// Plan 6.2's formulas, leaf by leaf, and rule 10: a leaf on several signals is
// worked out from them together.

const empty: TakeFacts = {
  kind: "impromptu",
  durationSeconds: 60,
  wordCount: 100,
  wpm: null,
  paceSdSylPerSec: null,
  paceDriftPercent: null,
  boundaryPauseRate: null,
  pitchPhraseSdSt: null,
  endings: null,
  standOut: null,
  strongOnContentShare: null,
  lastWordCarry: null,
  fillers: null,
  stalls: null,
  restarts: null,
  readAccuracyPercent: null,
  presence: null,
  hedges: null,
  ending: null,
  pointFirst: null,
  structure: null,
  wordsPerSentence: null,
  longWordShare: null,
  detoursPerMinute: null,
  detailsPerMinute: null,
  secondsToFirstWord: null,
};

const reading = (over: Partial<TakeFacts>) => takeLeafReadings({ ...empty, ...over });

describe("nothing measured", () => {
  it("makes no leaf up", () => {
    expect(reading({})).toEqual({});
  });
});

describe("Voice", () => {
  it("Speaking rate: 100 inside 130-160, -1.4 a word outside", () => {
    expect(reading({ wpm: 145 }).speaking_rate?.score).toBe(100);
    expect(reading({ wpm: 130 }).speaking_rate?.score).toBe(100);
    expect(reading({ wpm: 160 }).speaking_rate?.score).toBe(100);
    expect(reading({ wpm: 120 }).speaking_rate?.score).toBe(86);
    expect(reading({ wpm: 170 }).speaking_rate?.score).toBe(86);
    expect(reading({ wpm: 170 }).speaking_rate?.value).toBe("170 words a minute");
  });

  it("At sentence ends: 60%+ = 100", () => {
    expect(reading({ boundaryPauseRate: 0.6 }).sentence_ends?.score).toBe(100);
    expect(reading({ boundaryPauseRate: 0.3 }).sentence_ends?.score).toBe(50);
    expect(reading({ boundaryPauseRate: 1 }).sentence_ends?.score).toBe(100);
  });

  it("Pitch variety reads the within-phrase SD, with the band from the iPhone's reads", () => {
    expect(reading({ pitchPhraseSdSt: 1.75 }).pitch_variety?.score).toBeCloseTo(37.5, 0);
    expect(reading({ pitchPhraseSdSt: 2.82 }).pitch_variety?.score).toBeCloseTo(91, 0);
    expect(reading({ pitchPhraseSdSt: 3.34 }).pitch_variety?.score).toBe(100);
    expect(reading({ pitchPhraseSdSt: 0.5 }).pitch_variety?.score).toBe(0);
  });

  it("Pitch variety goes personal after 5 takes", () => {
    expect(phrasePitchBand([2, 2, 2, 2])).toBe(FIXED_PHRASE_PITCH_BAND);
    const quiet = phrasePitchBand([2, 2, 2, 2, 2]);
    expect(quiet).toMatchObject({ source: "personal", fullSt: 2.4, usualSt: 2, takes: 5 });
    expect(phrasePitchBand([9, 9, 9, 9, 9]).fullSt).toBe(3.4);
    expect(phrasePitchScore(2, quiet)).toBeGreaterThan(phrasePitchScore(2));
    expect(reading({ pitchPhraseSdSt: 2.4, pitchBand: quiet }).pitch_variety?.score).toBe(100);
    expect(reading({ pitchPhraseSdSt: 2.4, pitchBand: quiet }).pitch_variety?.rule).toContain("your usual 2");
  });

  it("Stand-out stress reads the three cues together, with the band from the iPhone's reads", () => {
    expect(standOutScore(1.01)).toBeCloseTo(2.1, 1);
    expect(standOutScore(2.14)).toBeCloseTo(9.6, 1);
    expect(standOutScore(2.88)).toBe(10);
    expect(reading({ standOut: 1.52 }).stand_out_stress?.score).toBeCloseTo(54.7, 0);
    expect(reading({ standOut: 1.52 }).stand_out_stress?.rule).toContain("pitch, loudness and length together");
  });

  it("Rhythm: pace spread and speed-up together", () => {
    expect(reading({ paceSdSylPerSec: 0.8, paceDriftPercent: 5 }).rhythm?.score).toBe(100);
    expect(reading({ paceSdSylPerSec: 1.5, paceDriftPercent: 5 }).rhythm?.score).toBe(80);
    expect(reading({ paceSdSylPerSec: 0.8, paceDriftPercent: 20 }).rhythm?.score).toBe(80);
    expect(reading({ paceSdSylPerSec: 1.5, paceDriftPercent: 20 }).rhythm?.score).toBe(60);
    // Slowing down isn't a fault.
    expect(reading({ paceSdSylPerSec: 0.8, paceDriftPercent: -20 }).rhythm?.score).toBe(100);
  });

  it("Endings, stress on the right words and volume carry are percentages", () => {
    expect(reading({ endings: { statements: 4, rising: 1 } }).endings_fall?.score).toBe(75);
    expect(reading({ endings: { statements: 0, rising: 0 } }).endings_fall).toBeUndefined();
    expect(reading({ strongOnContentShare: 0.7 }).stress_right_words?.score).toBe(70);
    expect(reading({ lastWordCarry: { sentences: 4, trailing: 1 } }).volume_carry?.score).toBe(75);
    expect(reading({ lastWordCarry: { sentences: 1, trailing: 0 } }).volume_carry).toBeUndefined();
  });
});

describe("Clarity", () => {
  it("Ums and uhs: 100, -8 per one over 2", () => {
    expect(reading({ fillers: { hesitationPerMinute: 2, contextualPerMinute: 0 } }).ums_uhs?.score).toBe(100);
    expect(reading({ fillers: { hesitationPerMinute: 4, contextualPerMinute: 0 } }).ums_uhs?.score).toBe(84);
    expect(reading({ fillers: { hesitationPerMinute: 4, contextualPerMinute: 0 } }).ums_uhs?.value).toBe("4 ums a minute");
  });

  it("Like, actually: half that rate", () => {
    expect(reading({ fillers: { hesitationPerMinute: 0, contextualPerMinute: 4 } }).like_actually?.score).toBe(100);
    expect(reading({ fillers: { hesitationPerMinute: 0, contextualPerMinute: 8 } }).like_actually?.score).toBe(84);
  });

  it("Stalls: 100, -20 per stall a minute", () => {
    expect(reading({ stalls: 0 }).stalls?.score).toBe(100);
    expect(reading({ stalls: 2 }).stalls?.score).toBe(60);
    expect(reading({ stalls: 2, durationSeconds: 120 }).stalls?.score).toBe(80);
  });

  it("Restarts and read accuracy", () => {
    expect(reading({ restarts: 1 }).restarts?.score).toBe(100);
    expect(reading({ restarts: 3 }).restarts?.score).toBe(80);
    expect(reading({ readAccuracyPercent: 92 }).read_accuracy?.score).toBe(92);
  });
});

describe("Presence", () => {
  const presence = (over: Partial<NonNullable<TakeFacts["presence"]>>) => ({ onLensPercent: 85, longLookAwaysPerMinute: 0, faceMovesPerMinute: 0, ...over });

  it("On the lens: 85%+ = 100", () => {
    expect(reading({ presence: presence({}) }).on_lens?.score).toBe(100);
    expect(reading({ presence: presence({ onLensPercent: 42.5 }) }).on_lens?.score).toBe(50);
  });

  it("Long look-aways: 100, -20 each", () => {
    expect(reading({ presence: presence({ longLookAwaysPerMinute: 2 }) }).long_lookaways?.score).toBe(60);
  });

  it("Face movement: brow lifts and smiles a minute", () => {
    expect(reading({ presence: presence({ faceMovesPerMinute: 6 }) }).face_movement?.score).toBe(50);
    expect(reading({ presence: presence({ faceMovesPerMinute: 80 }) }).face_movement?.score).toBe(100);
    expect(reading({ presence: presence({ faceMovesPerMinute: null }) }).face_movement).toBeUndefined();
  });

  it("Hedges: first 2 free, -5 each", () => {
    expect(reading({ hedges: 2 }).hedges?.score).toBe(100);
    expect(reading({ hedges: 5 }).hedges?.score).toBe(85);
  });

  it("Clear endings: 100, 60, 30", () => {
    expect(reading({ ending: "clear" }).clear_endings?.score).toBe(100);
    expect(reading({ ending: "neutral" }).clear_endings?.score).toBe(60);
    expect(reading({ ending: "trailing" }).clear_endings?.score).toBe(30);
  });
});

describe("Message", () => {
  it("is a phone estimate where the phone can only guess", () => {
    const r = reading({ pointFirst: true, structure: { framework: "PREP", shaped: true, beatsFound: 2 }, detailsPerMinute: 3 });
    expect(r.point_first).toMatchObject({ score: 100, source: "phone_estimate" });
    expect(r.has_shape).toMatchObject({ score: 80, source: "phone_estimate" });
    expect(r.hits_beats?.score).toBeCloseTo(66.7, 1);
    expect(r.specifics).toMatchObject({ score: 50, source: "phone_estimate" });
  });

  it("Has a shape: phone 80 or 40", () => {
    expect(reading({ structure: { framework: "None", shaped: false, beatsFound: 0 } }).has_shape?.score).toBe(40);
  });

  it("has no phone formula for Answers the question or Ideas connect yet", () => {
    const r = reading({ pointFirst: true, structure: { framework: "PREP", shaped: true, beatsFound: 3 } });
    expect(r.answers_question).toBeUndefined();
    expect(r.ideas_connect).toBeUndefined();
  });

  it("takes the judge's level over the phone's, and keeps its note", () => {
    const r = reading({ structure: { framework: "PREP", shaped: true, beatsFound: 3 }, judged: { has_shape: { score: 60, notes: "Clear start." }, answers_question: { score: 80, notes: null } } });
    expect(r.has_shape).toMatchObject({ score: 60, source: "judge", notes: "Clear start." });
    expect(r.answers_question).toMatchObject({ score: 80, source: "judge" });
  });

  it("Plain words, No detours, Starting fast", () => {
    expect(reading({ wordsPerSentence: 18, longWordShare: 0.1 }).plain_words?.score).toBe(100);
    expect(reading({ wordsPerSentence: 25, longWordShare: 0.1 }).plain_words?.score).toBe(80);
    expect(reading({ wordsPerSentence: 18, longWordShare: 0.25 }).plain_words?.score).toBe(80);
    expect(reading({ detoursPerMinute: 2 }).no_detours?.score).toBe(50);
    expect(reading({ secondsToFirstWord: 1 }).starting_fast?.score).toBe(100);
    expect(reading({ secondsToFirstWord: 3.5 }).starting_fast?.score).toBe(60);
  });

  it("Within limits: a Concise take against its limit", () => {
    expect(reading({ budgetSeconds: 60, durationSeconds: 45 }).within_limits?.score).toBe(100);
    expect(reading({ budgetSeconds: 45, durationSeconds: 45 }).within_limits?.score).toBe(100);
    expect(reading({ budgetSeconds: 45, durationSeconds: 54 }).within_limits?.score).toBe(80);
    expect(reading({ budgetSeconds: 45, durationSeconds: 200 }).within_limits?.score).toBe(0);
    expect(reading({ durationSeconds: 200 }).within_limits).toBeUndefined();
  });

  it("gives a script nothing that reads the words", () => {
    const r = reading({ kind: "script", wpm: 145, readAccuracyPercent: 90, hedges: 5, ending: "trailing", pointFirst: true, structure: { framework: "PREP", shaped: true, beatsFound: 3 } });
    expect(Object.keys(r).sort()).toEqual(["read_accuracy", "speaking_rate"]);
  });
});

describe("the facts a take's leaves read", () => {
  const input: TakeFactsInput = {
    kind: "impromptu",
    durationSeconds: 60,
    transcript: "Mountains are better. Anyway, I um think they are calm.",
    words: null,
    features: null,
    timeline: null,
    calibration: null,
    pauses: null,
    summary: null,
    presence: null,
    coach: { hedges: ["I think"], strongEnding: true, structure: { framework: "PREP", beatsFound: 2 } },
    stutterMode: false,
    repeatedWordCount: 1,
    prepSeconds: 0,
    scriptText: null,
  };

  it("reads what the words can show", () => {
    const f = buildTakeFacts(input);
    expect(f.hedges).toBe(1);
    expect(f.ending).toBe("clear");
    expect(f.structure).toEqual({ framework: "PREP", shaped: true, beatsFound: 2 });
    expect(f.pointFirst).toBe(true);
    expect(f.detoursPerMinute).toBeGreaterThan(0);
    expect(f.fillers?.hesitationPerMinute).toBeGreaterThan(0);
    expect(f.restarts).toBeGreaterThanOrEqual(1);
    expect(f.wordsPerSentence).toBeGreaterThan(1);
  });

  it("doesn't measure fillers, stalls or restarts against someone who stutters", () => {
    const f = buildTakeFacts({ ...input, stutterMode: true, pauses: { hesitations: 3 } as never });
    expect(f.fillers).toBeNull();
    expect(f.stalls).toBeNull();
    expect(f.restarts).toBeNull();
  });

  it("combines words and voice for Clear endings", () => {
    const voice = (trailing: number) => ({ prosody: { emphasis: null, uptalk: null, trailingOff: { sentences: 4, trailing }, possibleMissedFillers: { count: 0, atMs: [] } } }) as never;
    expect(buildTakeFacts({ ...input, summary: voice(1) }).ending).toBe("clear");
    expect(buildTakeFacts({ ...input, summary: voice(3) }).ending).toBe("neutral");
    expect(buildTakeFacts({ ...input, coach: { ...input.coach!, strongEnding: false }, summary: voice(0) }).ending).toBe("trailing");
    expect(buildTakeFacts({ ...input, coach: { ...input.coach!, strongEnding: null } }).ending).toBeNull();
  });

  it("times your first word only with no prep", () => {
    const words = [{ text: "Mountains", startMs: 2500, endMs: 2900 }];
    expect(buildTakeFacts({ ...input, words }).secondsToFirstWord).toBe(2.5);
    expect(buildTakeFacts({ ...input, words, prepSeconds: 30 }).secondsToFirstWord).toBeNull();
    expect(buildTakeFacts({ ...input, words, kind: "script" }).secondsToFirstWord).toBeNull();
  });

  it("checks a script's words against the script", () => {
    const f = buildTakeFacts({ ...input, kind: "script", scriptText: "Mountains are better", transcript: "Mountains are better" });
    expect(f.readAccuracyPercent).toBe(100);
    expect(buildTakeFacts({ ...input, kind: "script", scriptText: "Something else entirely here", transcript: "Mountains are better" }).readAccuracyPercent).toBeLessThan(50);
  });

  it("uses the plain share when there's no face track, and leaves the face out when you weren't in frame", () => {
    const presence = { samples: 100, presentPercent: 90, eyeContactPercent: 70 } as never;
    expect(buildTakeFacts({ ...input, presence }).presence).toEqual({ onLensPercent: 70, longLookAwaysPerMinute: 0, faceMovesPerMinute: null });
    expect(buildTakeFacts({ ...input, presence: { samples: 100, presentPercent: 30, eyeContactPercent: 70 } as never }).presence).toBeNull();
  });
});
