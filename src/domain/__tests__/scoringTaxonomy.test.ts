import { CUT_FROM_SCORES, METRICS, SKILL_DEFS, SUBCATEGORIES, SUBCATEGORY_ORDER, TAKE_SKILLS, subcategoriesOf, type SubcategoryId } from "../scoring/taxonomy";
import { fillerScore, paceScore, pitchRangeBand, verdictFor } from "../scoring/bands";

describe("the taxonomy", () => {
  it("names every subcategory once, under a real skill, in the display order", () => {
    expect(new Set(SUBCATEGORY_ORDER).size).toBe(SUBCATEGORY_ORDER.length);
    expect([...SUBCATEGORY_ORDER].sort()).toEqual(Object.keys(SUBCATEGORIES).sort());
    for (const s of Object.values(SUBCATEGORIES)) expect(SKILL_DEFS[s.skill]).toBeDefined();
  });

  it("hangs every metric on a subcategory that exists", () => {
    for (const m of Object.values(METRICS)) expect(SUBCATEGORIES[m.subcategory]).toBeDefined();
  });

  it("scores takes in cadence, impromptu and confidence only, weights adding to 1", () => {
    expect(TAKE_SKILLS).toEqual(["cadence", "impromptu", "confidence"]);
    expect(TAKE_SKILLS.reduce((sum, s) => sum + SKILL_DEFS[s].takeWeight, 0)).toBeCloseTo(1);
  });

  it("keeps media-only judgements out of the totals, so text- and video-judged takes compare", () => {
    for (const s of Object.values(SUBCATEGORIES)) if (s.judged === "media") expect(s.rollsUp).toBe(false);
  });

  it("has no face-voice match, archetype or judge's own overall anywhere in the subcategories", () => {
    expect(Object.keys(CUT_FROM_SCORES)).toEqual(expect.arrayContaining(["congruence", "archetype", "model_overall"]));
    expect(subcategoriesOf("confidence").map((s) => s.id)).not.toContain("congruence");
  });
});

describe("bands", () => {
  it("scores the pace band and the free fillers", () => {
    expect(paceScore(145)).toBe(10);
    expect(paceScore(181)).toBe(7);
    expect(fillerScore(2)).toBe(10);
    expect(fillerScore(4)).toBeCloseTo(8.4);
  });

  it("weighs contextual fillers (like, actually) at half", () => {
    expect(fillerScore(2, 4)).toBeCloseTo(fillerScore(4));
  });

  it("turns a score into the coach card's verdict", () => {
    expect(verdictFor(9)).toBe("good");
    expect(verdictFor(6.5)).toBe("ok");
    expect(verdictFor(4)).toBe("work");
  });
});
