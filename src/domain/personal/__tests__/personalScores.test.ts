import {
  attentionScore,
  comfortScore,
  debriefScore,
  followedScore,
  forecastGapScore,
  isOpenQuestion,
  missionScore,
  momentAfterScore,
  momentBeforeScore,
  nervesTrendScore,
  planPointScore,
  primeScore,
  rewindScore,
  talkBackScore,
  threeThingsScore,
  wordStalls,
} from "../personalScores";
import { movesForAttempt } from "../../scoring/leafEvidence";
import { ACTIVITY_IDS } from "../../../content/activities";
import type { RewindStats } from "../../rewind/stats";

const stats = (over: Partial<RewindStats> = {}): RewindStats => ({
  seconds: 90,
  words: 200,
  coverage: { morning: true, midday: true, evening: true },
  details: { numbers: 2, times: 1, names: 2, senses: 1, total: 6 },
  longestPauseSeconds: null,
  longPauses: 0,
  ...over,
});

describe("Rewind", () => {
  it("parts of the day 40, details a minute 40, talk time 20", () => {
    const full = rewindScore({ stats: stats(), transcript: "x", words: null, targetSeconds: 60, delivery: false, stutterMode: false });
    expect(full.score).toBe(1);
    const thin = rewindScore({ stats: stats({ seconds: 30, coverage: { morning: true, midday: false, evening: false }, details: { numbers: 0, times: 0, names: 0, senses: 1, total: 1 } }), transcript: "x", words: null, targetSeconds: 60, delivery: false, stutterMode: false });
    // 1/3 × 40 + (1 a minute over 0.5 min = 2/4) × 40 + 30/60 × 20 = 13.3 + 20 + 10
    expect(thin.score).toBeCloseTo(0.43, 2);
    expect(thin.leafScores.specifics?.source).toBe("phone_estimate");
  });

  it("too few words count nothing", () => {
    expect(rewindScore({ stats: stats({ words: 8 }), transcript: "x", words: null, targetSeconds: 60, delivery: true, stutterMode: false }).score).toBeNull();
  });

  it("the delivery switch adds ums, likes and stalls, never for stuttering", () => {
    const transcript = "um so I woke up um and uh had coffee, like, and then work and dinner. ".repeat(6);
    const on = rewindScore({ stats: stats(), transcript, words: null, targetSeconds: 60, delivery: true, stutterMode: false });
    expect(on.leafScores.ums_uhs?.score).toBeLessThan(1);
    expect(on.leafScores.like_actually).toBeDefined();
    expect(rewindScore({ stats: stats(), transcript, words: null, targetSeconds: 60, delivery: false, stutterMode: false }).leafScores.ums_uhs).toBeUndefined();
    expect(rewindScore({ stats: stats(), transcript, words: null, targetSeconds: 60, delivery: true, stutterMode: true }).leafScores.ums_uhs).toBeUndefined();
  });

  it("a stall is a long gap mid-sentence, not after a full stop", () => {
    const w = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 300 });
    expect(wordStalls([w("I", 0), w("went", 400), w("to", 3000), w("work.", 3400), w("Then", 6000)])).toBe(1);
    expect(wordStalls(null)).toBeNull();
  });

  it("moves only Specifics and, with the switch, the filler leaves", () => {
    const scored = rewindScore({ stats: stats(), transcript: "um um um I woke up and went to work then dinner", words: null, targetSeconds: 60, delivery: true, stutterMode: false });
    const leaves = movesForAttempt({ activityId: ACTIVITY_IDS.rewind, score: scored.score, leafScores: scored.leafScores, difficulty: 3, source: "self" }).map((m) => m.leaf);
    expect(leaves).toEqual(expect.arrayContaining(["specifics", "ums_uhs"]));
  });
});

describe("inner voice", () => {
  it("Three things: half for writing, half for saying", () => {
    expect(threeThingsScore({ distinctItems: 3, said: 3, aim: 3 }).score).toBe(1);
    expect(threeThingsScore({ distinctItems: 3, said: 0, aim: 3 }).score).toBe(0.5);
    expect(threeThingsScore({ distinctItems: 2, said: 1, aim: 3 }).score).toBe(0.5);
    expect(threeThingsScore({ distinctItems: 1, said: 1, aim: 1 }).score).toBe(1);
  });

  it("Talk back: steps 40, belief drop 40, fairer line said 20", () => {
    const all = talkBackScore({ before: 5, after: 3, forText: "people laughed", againstText: "they asked more", balanced: "Some went well", said: true });
    expect(all.score).toBe(1);
    const half = talkBackScore({ before: 4, after: 3, forText: "", againstText: "x y", balanced: "fairer one", said: false });
    // steps: before, against, balanced, after = 4/6 → 26.7; drop 1 → 20; not said → 0
    expect(half.score).toBeCloseTo(0.47, 2);
    expect(talkBackScore({ before: 3, after: 4, forText: "", againstText: "", balanced: "", said: false }).score).toBeCloseTo(0.13, 2);
  });

  it("self-reports move inner leaves only", () => {
    const scored = talkBackScore({ before: 5, after: 3, forText: "a b", againstText: "c d", balanced: "e f", said: true });
    const moves = movesForAttempt({ activityId: ACTIVITY_IDS.talkBack, score: scored.score, leafScores: scored.leafScores, difficulty: 3, source: "self" });
    expect(moves.map((m) => m.leaf)).toEqual(["reframing"]);
  });
});

describe("nerves, forecasts and real moments", () => {
  it("forecast gap: at or under the forecast is full marks", () => {
    expect(forecastGapScore(6, 4)).toBe(1);
    expect(forecastGapScore(4, 6)).toBe(0.6);
    expect(forecastGapScore(null, 5)).toBeNull();
  });

  it("nerves trend is compared with your start", () => {
    expect(nervesTrendScore(5, 5, 10, true)).toBe(0.5);
    expect(nervesTrendScore(0, 10, 10, true)).toBe(1);
    expect(comfortScore(5, 1).score).toBe(1);
    expect(comfortScore(3, null).score).toBe(0.5);
  });

  it("a moment after counts as a real-world rep, with nerves against forecast", () => {
    const s = momentAfterScore({ nerves: 4, forecast: 7, nervesStart: 6, went: 4, focusResult: "yes", wentOkay: "I spoke first", tryNext: "slow down" });
    expect(s.score).toBe(1);
    expect(s.leafScores.real_world?.score).toBe(1);
    expect(s.leafScores.forecast_gap?.score).toBe(1);
    expect(s.leafScores.nerves_trend?.score).toBe(0.6);
    expect(momentBeforeScore({ nerves: null, focus: "", nervesStart: null }).score).toBeNull();
  });

  it("Prime: fields filled; open questions move lightly", () => {
    const s = primeScore({ topics: ["work", "trip", ""], questions: ["What brought you here?", "Do you like it?"], goal: "listen" });
    expect(s.score).toBeCloseTo(0.83, 2);
    expect(s.leafScores.open_questions?.score).toBe(0.5);
    expect(isOpenQuestion("How did that start?")).toBe(true);
    expect(isOpenQuestion("Is it far?")).toBe(false);
  });

  it("Debrief: always a real rep; the forecast compared when there is one", () => {
    const s = debriefScore({ predicted: 7, actual: 3, wentOkay: "fine", tryNext: "", positiveSign: "they smiled", blanksNamed: 1 });
    expect(s.score).toBe(0.88);
    expect(s.leafScores.forecast_gap?.score).toBe(1);
  });

  it("attention: a drop is full marks", () => {
    expect(attentionScore(8, 4).score).toBe(1);
    expect(attentionScore(5, 5).score).toBe(0.5);
    expect(attentionScore(3, 6).score).toBe(0);
    expect(attentionScore(null, 3).score).toBeNull();
  });

  it("missions, Plan your point and Rehearse", () => {
    expect(missionScore(2, 2).score).toBe(1);
    expect(missionScore(0, 2).score).toBeNull();
    expect(planPointScore({ point: "Ship it", reason: "", example: "Last week" }).score).toBe(0.67);
    expect(followedScore(90, 120).score).toBe(0.75);
  });
});
