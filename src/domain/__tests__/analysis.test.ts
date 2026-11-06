import { computePresenceMetrics, type PresenceSample } from "../presenceMetrics";
import { findHedges, guessStructure, hasStrongEnding } from "../coach/structureHeuristics";
import { ruleCoach } from "../coach/ruleCoach";

describe("computePresenceMetrics", () => {
  const sample = (tMs: number, yaw: number, smile = 0.1): PresenceSample => ({
    tMs,
    present: true,
    yaw,
    pitch: 0,
    smile,
    eyesOpen: 0.9,
    framed: true,
  });

  it("measures eye contact and the longest look-away", () => {
    const timeline = [
      ...Array.from({ length: 50 }, (_, i) => sample(i * 200, 2)),
      ...Array.from({ length: 10 }, (_, i) => sample(10000 + i * 200, 40)),
    ];
    const m = computePresenceMetrics(timeline)!;
    expect(m.eyeContactPercent).toBe(83);
    expect(m.longestLookAwayMs).toBe(1800);
    expect(m.presentPercent).toBe(100);
  });

  it("returns null for too little data", () => {
    expect(computePresenceMetrics([sample(0, 0)])).toBeNull();
  });
});

describe("structure heuristics", () => {
  it("recognizes PREP", () => {
    const text = "Remote work is better. Because you skip the commute. For example, I gained an hour a day. That's why I'd choose it.";
    expect(guessStructure(text)).toMatchObject({ framework: "PREP", pointUpFront: true });
  });

  it("recognizes a list of three", () => {
    expect(guessStructure("First, it's cheap. Second, it's fast. Finally, it's fun.").framework).toBe("ListOfThree");
  });

  it("gives a tie to the structure the rep was practicing", () => {
    // Hits every PREP beat and every list-of-three beat.
    const text = "First, it's cheap, because it runs on a phone. Second, for example, my team uses it daily. Finally, that's why I'd choose it.";
    expect(guessStructure(text).framework).toBe("PREP");
    expect(guessStructure(text, "ListOfThree").framework).toBe("ListOfThree");
    // A target with fewer beats than the best still loses.
    expect(guessStructure("First, it's cheap. Second, it's fast. Finally, it's fun.", "PREP").framework).toBe("ListOfThree");
  });

  it("recognizes STAR", () => {
    const text = "At my last job the goal was to cut our support backlog. So I set up a triage rota for the team. As a result, the backlog halved in a month.";
    expect(guessStructure(text, "STAR")).toMatchObject({ framework: "STAR", beatsFound: 3 });
  });

  it("finds hedges and weak endings", () => {
    expect(findHedges("I guess it's kind of maybe fine")).toEqual(["kind of", "i guess", "maybe"]);
    expect(hasStrongEnding("That is my point.")).toBe(true);
    expect(hasStrongEnding("It went well. So yeah.")).toBe(false);
  });
});

describe("ruleCoach", () => {
  it("picks the most important tip and a real strength", () => {
    const out = ruleCoach({
      transcript: "Um so I think it's kind of good. I guess maybe. So yeah.",
      durationSeconds: 60,
      wpmAvg: 190,
      fillerRatePerMinute: 2,
      pauses: null,
      presence: null,
      pitchRangeSt: 5.2,
    });
    expect(out.focusSkill).toBe("cadence");
    expect(out.tip).toMatch(/190 words a minute/);
    expect(out.strength).toMatch(/filler|varied/i);
    expect(out.observations.find((o) => o.label === "Pace")?.verdict).toBe("work");
  });

  it("talks about framing, not eye contact, when the face was mostly missing", () => {
    const presence = { samples: 50, presentPercent: 10, eyeContactPercent: 0, longestLookAwayMs: 9000, smilePercent: 0, expressiveness: 0, headMovement: 0, blinksPerMinute: 0, framedPercent: 5 };
    const out = ruleCoach({ transcript: null, durationSeconds: 10, wpmAvg: null, fillerRatePerMinute: null, pauses: null, presence, pitchRangeSt: null });
    expect(out.tip).toMatch(/out of frame/);
    expect(out.observations.map((o) => o.label)).toEqual(["Face in frame"]);
  });

  it("works with no transcript", () => {
    const out = ruleCoach({ transcript: null, durationSeconds: 30, wpmAvg: null, fillerRatePerMinute: null, pauses: null, presence: null, pitchRangeSt: null });
    expect(out.followUpQuestion).toBeNull();
    expect(out.tip).toBeTruthy();
  });
});
