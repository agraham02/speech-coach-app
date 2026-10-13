import { similarEntry, similarity } from "../innerVoice/similarity";
import { toSecondPerson } from "../innerVoice/secondPerson";
import { atCapstone, dailyAim, resurfaced, runDays, RUN_DAYS } from "../innerVoice/run";
import { saidIt, saidRatio } from "../innerVoice/said";

const past = (text: string, date = "2026-10-03", id = text) => ({ id, text, date });

describe("no repeats", () => {
  it("flags the same thing said another way", () => {
    expect(similarity("I'm patient with people", "I am patient with other people")).toBeGreaterThanOrEqual(0.6);
  });

  it("flags plurals and tenses as the same word", () => {
    expect(similarEntry("I listen to my friends", [past("I listened to my friend")])).not.toBeNull();
  });

  it("lets a different thing through", () => {
    expect(similarEntry("I'm good at explaining things simply", [past("I'm patient with people")])).toBeNull();
    expect(similarEntry("My voice sounds warm", [past("I stay calm when a plan changes")])).toBeNull();
  });

  it("returns the closest earlier entry", () => {
    const history = [past("I'm funny", "2026-10-01", "a"), past("I'm patient with people", "2026-10-02", "b"), past("I make people feel at ease", "2026-10-03", "c")];
    expect(similarEntry("I am patient with people I meet", history)?.entry.id).toBe("b");
  });

  it("compares plain text when there is nothing but filler words", () => {
    expect(similarity("I am", "I am")).toBe(1);
    expect(similarity("I am", "you are")).toBe(0);
  });

  it("finds nothing in an empty history", () => {
    expect(similarEntry("I'm kind", [])).toBeNull();
  });
});

describe("second person", () => {
  it("turns I into you and leads with the name", () => {
    expect(toSecondPerson("I'm patient with people", "Ahmad")).toBe("Ahmad, you're patient with people.");
    expect(toSecondPerson("I am a good listener.", "Ahmad")).toBe("Ahmad, you're a good listener.");
    expect(toSecondPerson("I handled my nerves today", "Ahmad")).toBe("Ahmad, you handled your nerves today.");
    expect(toSecondPerson("I've grown a lot", "Ahmad")).toBe("Ahmad, you've grown a lot.");
    expect(toSecondPerson("People trust me", "Ahmad")).toBe("Ahmad, people trust you.");
  });

  it("works without a name", () => {
    expect(toSecondPerson("I'm patient with people")).toBe("You're patient with people.");
    expect(toSecondPerson("i keep my word")).toBe("You keep your word.");
  });

  it("adds a subject when there isn't one", () => {
    expect(toSecondPerson("Patient with people", "Ahmad")).toBe("Ahmad, you're patient with people.");
    expect(toSecondPerson("listen well", "Ahmad")).toBe("Ahmad, you listen well.");
    expect(toSecondPerson("Telling stories", "Ahmad")).toBe("Ahmad, you're good at telling stories.");
  });

  it("leaves a sentence that already says you", () => {
    expect(toSecondPerson("You make people laugh", "Ahmad")).toBe("Ahmad, you make people laugh.");
  });

  it("handles curly apostrophes and empty text", () => {
    expect(toSecondPerson("I’m kind", "Ahmad")).toBe("Ahmad, you're kind.");
    expect(toSecondPerson("   ", "Ahmad")).toBe("");
  });
});

describe("the 30-day run", () => {
  const days = (n: number, round = 1) => Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, round }));

  it("counts different days, not entries", () => {
    const entries = [...days(3), { date: "2026-09-01", round: 1 }, { date: "2026-09-01", round: 1 }];
    expect(runDays(entries, 1)).toBe(3);
  });

  it("counts a round on its own", () => {
    expect(runDays([...days(5, 1), ...days(2, 2)], 2)).toBe(2);
  });

  it("reaches the capstone after 30 days of a running round", () => {
    expect(atCapstone(days(RUN_DAYS - 1), { round: 1, mode: "run" })).toBe(false);
    expect(atCapstone(days(RUN_DAYS), { round: 1, mode: "run" })).toBe(true);
    // Once you've chosen what's next, it doesn't come back.
    expect(atCapstone(days(RUN_DAYS), { round: 1, mode: "light" })).toBe(false);
    expect(atCapstone(days(RUN_DAYS), { round: 1, mode: "paused" })).toBe(false);
    expect(atCapstone(days(RUN_DAYS, 1), { round: 2, mode: "run" })).toBe(false);
  });

  it("aims for three a day, or one when keeping it light", () => {
    expect(dailyAim({ round: 1, mode: "run" })).toBe(3);
    expect(dailyAim({ round: 1, mode: "light" })).toBe(1);
  });

  it("picks the same old entry all day and another tomorrow", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(resurfaced(list, "2026-10-12")).toBe(resurfaced(list, "2026-10-12"));
    expect(new Set(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((d) => resurfaced(list, d))).size).toBeGreaterThan(1);
    expect(resurfaced([], "2026-10-12")).toBeNull();
  });
});

describe("saying it aloud", () => {
  const target = "Ahmad, you're patient with people.";

  it("counts the sentence as said when its words were heard", () => {
    expect(saidIt(target, "ahmad you're patient with people")).toBe(true);
    expect(saidRatio(target, "ahmad your patient with people")).toBeGreaterThanOrEqual(0.8);
  });

  it("doesn't need punctuation, capitals or perfect order", () => {
    expect(saidIt("You keep your word.", "keep your word you")).toBe(true);
  });

  it("isn't fooled by a few words", () => {
    expect(saidIt(target, "patient")).toBe(false);
    expect(saidIt(target, "")).toBe(false);
  });

  it("needs a repeated word to be heard that many times", () => {
    expect(saidRatio("you you you", "you")).toBeCloseTo(1 / 3);
  });
});
