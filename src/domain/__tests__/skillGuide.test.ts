import { SKILL_GUIDE } from "../../content/skillGuide";
import { DRILL_SKILL } from "../drills/drillSpecs";
import { SKILLS } from "../mastery";

// The skill guide must only claim what the app records (docs/overhaul/PLAN.md,
// task 0.6). Warm-ups record nothing today, so no skill may say they feed a
// rating. When warm-ups are scored (phase 3c), update this test with the copy.

const feeds = (skill: (typeof SKILLS)[number]) => SKILL_GUIDE[skill].feeds.join(" | ");

describe("the skill guide", () => {
  it("covers every skill", () => {
    expect(Object.keys(SKILL_GUIDE).sort()).toEqual([...SKILLS].sort());
  });

  it("says warm-ups aren't scored, and never that they feed a rating", () => {
    expect(feeds("confidence")).toMatch(/Warm-ups aren't scored/);
    for (const skill of SKILLS) {
      const mentions = feeds(skill).match(/warm-?ups?[^|]*/gi) ?? [];
      for (const mention of mentions) expect(mention).toMatch(/aren't scored/i);
    }
  });

  it("names the drills it says feed a skill under the skill they really feed", () => {
    expect(DRILL_SKILL.projection).toBe("confidence");
    expect(DRILL_SKILL.breath_count).toBe("confidence");
    expect(feeds("confidence")).toMatch(/Projection and one-breath drills/);
    expect(DRILL_SKILL.twister).toBe("articulation");
    expect(feeds("articulation")).toMatch(/Tongue twisters/);
  });
});
