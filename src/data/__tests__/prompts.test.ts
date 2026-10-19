import { TOPICS, PROMPT_FIELDS } from "../topics";
import { CONTEXT_PROMPTS, randomContextPrompt } from "../contextPrompts";
import { LESSONS } from "../../content/lessons";
import { FRAMEWORK_PROMPT_CATEGORIES } from "../../domain/coach/structureHeuristics";
import { defaultDifficultyTier } from "../../domain/promptDifficulty";
import { pickRandomPrompt } from "../../domain/pickTodaysPrompt";
import { taskForCategory, taskOf } from "../../domain/promptTask";
import type { Prompt } from "../../domain/sessionTypes";

const byCategory = (category: string) => TOPICS.filter((t) => t.category === category);
const KNOWN_CATEGORIES = ["Opinion", "Personal", "Story", "Explain", "Hypothetical", "Persuade", "Creative", "Debate", "One word"];

describe("topic bank", () => {
  it("has no duplicate ids or texts", () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    expect(new Set(TOPICS.map((t) => t.text.toLowerCase())).size).toBe(TOPICS.length);
  });

  it("retired the self-contradicting respect topic, under its old id", () => {
    expect(TOPICS.find((t) => t.id === "t098")).toBeUndefined();
    expect(TOPICS.some((t) => /everyone's respect/i.test(t.text))).toBe(false);
  });

  it("only uses categories the app knows a task for", () => {
    for (const t of TOPICS) expect(KNOWN_CATEGORIES).toContain(t.category);
    expect(taskForCategory("Debate")).toBe("debate");
  });

  it("has a real spread of genres", () => {
    for (const c of ["Persuade", "Creative", "Debate"]) expect(byCategory(c).length).toBeGreaterThanOrEqual(15);
    expect(byCategory("One word").length).toBeGreaterThanOrEqual(80);
    expect(byCategory("Spontaneous")).toHaveLength(0);
  });

  it("offers one-word prompts at every level, and never bumps them for being short", () => {
    const words = byCategory("One word");
    for (const tier of ["easy", "medium", "hard"]) expect(words.filter((t) => t.tier === tier).length).toBeGreaterThanOrEqual(10);
    expect(defaultDifficultyTier("One word", "Keys.")).toBe("medium");
    // A real one-word prompt is a word, and nothing else.
    for (const t of words) expect(t.text.replace(/\.$/, "").trim().split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it("covers fields a person may know little about, each with one they could try cold", () => {
    const required = [
      "politics", "psychology", "kinesiology", "health", "biology", "physics", "chemistry", "music", "history", "philosophy",
      "law", "finance", "technology", "environment", "art", "language", "sports", "food", "travel", "education", "work",
    ];
    for (const field of required) {
      expect(PROMPT_FIELDS).toContain(field);
      const inField = TOPICS.filter((t) => t.field === field);
      expect(inField.length).toBeGreaterThanOrEqual(4);
      expect(inField.some((t) => t.tier && t.tier !== "hard")).toBe(true);
    }
  });

  it("gives every framework prompts it can use", () => {
    for (const categories of Object.values(FRAMEWORK_PROMPT_CATEGORIES)) {
      const count = TOPICS.filter((t) => categories.includes(t.category)).length;
      expect(count).toBeGreaterThanOrEqual(20);
    }
  });

  it("only points lessons at categories with enough prompts to pick from", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind !== "rep" || !step.promptCategories) continue;
        for (const c of step.promptCategories) expect(byCategory(c).length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("brings the new genres into the curriculum", () => {
    const used = new Set(LESSONS.flatMap((l) => l.steps.flatMap((s) => (s.kind === "rep" ? s.promptCategories ?? [] : []))));
    for (const c of ["One word", "Debate", "Persuade", "Creative"]) expect(used.has(c)).toBe(true);
    expect(LESSONS.find((l) => l.id === "imp_14_angle")?.unitId).toBe("imp_feet");
    expect(LESSONS.find((l) => l.id === "imp_15_side")?.unitId).toBe("imp_structure");
    expect(LESSONS.find((l) => l.id === "con_8_case")?.unitId).toBe("con_authority");
  });
});

describe("context prompts", () => {
  const all = Object.values(CONTEXT_PROMPTS).flat();

  it("says what each one is, and names its task", () => {
    expect(all).toHaveLength(64);
    for (const p of all) {
      expect(p.task).toBeTruthy();
      expect(p.text.length).toBeGreaterThan(15);
    }
  });

  it("makes part-of-a-talk prompts say which part, and supply a topic", () => {
    const parts = all.filter((p) => p.task === "opening" || p.task === "closing");
    expect(parts.length).toBeGreaterThanOrEqual(5);
    for (const p of parts) {
      expect(p.text.startsWith(p.task === "opening" ? "Opening only:" : "Closing only:")).toBe(true);
      // "…a talk on cooking", "…a meeting about an offsite": never a bare "the end".
      expect(p.text).toMatch(/ (on|about|of) /);
    }
    // And nothing that sounds like a part is left as a plain prompt.
    for (const p of all.filter((x) => x.task !== "opening" && x.task !== "closing")) {
      expect(p.text).not.toMatch(/^(Opening|Closing) only/);
      expect(p.text).not.toMatch(/last minute of a talk|the part people will remember/i);
    }
  });

  it("gives a role-play its situation, and says when to make details up", () => {
    for (const p of all.filter((x) => x.task === "scenario")) {
      expect(p.text.length).toBeGreaterThan(40);
    }
    const colleague = all.find((p) => /take on one more project/.test(p.text));
    expect(colleague?.task).toBe("scenario");
  });

  it("carries the task onto the ad-hoc prompt it makes", () => {
    const prompt = randomContextPrompt("presentations", () => 0.5);
    expect(prompt.id.startsWith("adhoc_")).toBe(true);
    expect(taskOf(prompt)).toBe(CONTEXT_PROMPTS.presentations[4].task);
  });
});

describe("variety when picking", () => {
  const prompt = (id: string, category: string): Prompt => ({ id, category, text: id, difficultyTier: "medium" });
  const pool = [...Array.from({ length: 6 }, (_, i) => prompt(`a${i}`, "Opinion")), ...Array.from({ length: 6 }, (_, i) => prompt(`b${i}`, "Story"))];

  it("avoids the category just used when it can", () => {
    for (let i = 0; i < 50; i++) expect(pickRandomPrompt(pool, [], "Opinion").category).toBe("Story");
  });

  it("allows it when nothing else is left", () => {
    const onlyOpinion = pool.filter((p) => p.category === "Opinion");
    expect(pickRandomPrompt(onlyOpinion, [], "Opinion").category).toBe("Opinion");
  });
});
