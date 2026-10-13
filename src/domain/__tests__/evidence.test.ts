import { evidenceFor } from "../innerVoice/evidence";
import { beliefChange, PRESET_THOUGHTS, presetById } from "../innerVoice/thoughts";

const turn = (replied: boolean, latencyMs: number | null = 1200) => ({ replied, latencyMs });

describe("evidence from your own practice", () => {
  it("says how often you replied, for the worry about blanking", () => {
    const lines = evidenceFor({ presetId: "blank", turns: [turn(true), turn(true), turn(false), turn(true)], selfLikes: [], practiceDays: 0 });
    expect(lines[0]).toBe("In your conversation drills you replied on 3 of 4 turns.");
  });

  it("adds a typical reply time once there are enough replies", () => {
    const turns = [turn(true, 900), turn(true, 1500), turn(true, 2100), turn(true, 1200)];
    const lines = evidenceFor({ presetId: "blank", turns, selfLikes: [], practiceDays: 0 });
    expect(lines.some((l) => l.includes("seconds after they finished"))).toBe(true);
    const few = evidenceFor({ presetId: "blank", turns: turns.slice(0, 2), selfLikes: [], practiceDays: 0 });
    expect(few.some((l) => l.includes("seconds after"))).toBe(false);
  });

  it("keeps conversation facts to the worry they speak to", () => {
    const lines = evidenceFor({ presetId: "boring", turns: [turn(true)], selfLikes: [], practiceDays: 0 });
    expect(lines).toEqual([]);
  });

  it("mentions practice days once there are a few, and your own words", () => {
    const lines = evidenceFor({ presetId: "voice", turns: [], selfLikes: ["I listen well", "I am kind", "I keep my word", "I am funny"], practiceDays: 5 });
    expect(lines[0]).toBe("You've shown up to practice on 5 days.");
    expect(lines.filter((l) => l.startsWith("You wrote")).length).toBe(3);
  });

  it("says nothing when there is nothing to say", () => {
    expect(evidenceFor({ presetId: null, turns: [], selfLikes: [], practiceDays: 1 })).toEqual([]);
  });

  it("reads a single day or turn properly", () => {
    const lines = evidenceFor({ presetId: "blank", turns: [turn(true)], selfLikes: [], practiceDays: 3 });
    expect(lines[0]).toBe("In your conversation drills you replied on 1 of 1 turn.");
  });
});

describe("thoughts", () => {
  it("has unique presets with text", () => {
    expect(new Set(PRESET_THOUGHTS.map((p) => p.id)).size).toBe(PRESET_THOUGHTS.length);
    expect(PRESET_THOUGHTS.every((p) => p.text.length > 3)).toBe(true);
    expect(presetById("blank")?.evidence).toBe("replies");
    expect(presetById("nope")).toBeUndefined();
  });

  it("reads a change in how true it feels", () => {
    expect(beliefChange(4, 2)).toBe("lighter");
    expect(beliefChange(3, 3)).toBe("same");
    expect(beliefChange(2, 3)).toBe("heavier");
  });
});
