import { buildPath, lessonPosition, nextLessonInUnit, pickActive, replan, type PathInput, type PathUnit } from "../path";
import { LESSONS, UNITS } from "../../content/lessons";
import type { SkillId } from "../../theme/tokens";

const ratings: Record<SkillId, number> = { articulation: 25, cadence: 25, impromptu: 25, confidence: 25, conversation: 25 };
const base: PathInput = { today: "2026-10-18", obstacles: [], contexts: [], events: [], check: null, checkRatings: {}, ratings, lessons: {} };

const order = (path: PathUnit[]) => path.filter((p) => p.status === "active" || p.status === "upcoming").map((p) => p.unitId);
const unit = (id: string) => UNITS.find((u) => u.id === id)!;
const doneLessons = (...unitIds: string[]) => Object.fromEntries(LESSONS.filter((l) => unitIds.includes(l.unitId)).map((l) => [l.id, { done: true }]));

describe("path", () => {
  it("places every unit exactly once", () => {
    const path = buildPath({ ...base, obstacles: ["ramble"], lessons: doneLessons("art_wake") });
    expect(path.map((p) => p.unitId).sort()).toEqual(UNITS.map((u) => u.id).sort());
  });

  it("gives different people different paths", () => {
    const rambler = buildPath({
      ...base,
      obstacles: ["ramble"],
      contexts: ["interviews"],
      events: [{ id: "e", kind: "interview", title: null, date: "2026-10-30" }],
    });
    const nervous = buildPath({ ...base, obstacles: ["nerves", "mumble"] });
    expect(order(rambler).slice(0, 4)).not.toEqual(order(nervous).slice(0, 4));
    expect(order(rambler).slice(0, 4)).toEqual(expect.arrayContaining(["imp_short"]));
    expect(order(nervous).slice(0, 3)).toEqual(expect.arrayContaining(["con_nerves", "art_wake"]));
  });

  it("counts every event in the window, not just the next one", () => {
    const path = buildPath({
      ...base,
      events: [
        { id: "a", kind: "interview", title: null, date: "2026-10-18" },
        { id: "b", kind: "talk", title: null, date: "2026-11-11" },
        { id: "c", kind: "toast", title: null, date: "2027-01-01" },
      ],
    });
    expect(path.find((p) => p.unitId === "cad_pace")!.reasons[0].text).toBe("For your talk in 24 days");
    expect(path.find((p) => p.unitId === "con_nerves")!.reasons[0].text).toBe("For your interview, today");
    expect(path.find((p) => p.unitId === "cad_melody")!.reasons.some((r) => r.kind === "event")).toBe(false);
  });

  it("explains why a unit is there", () => {
    const path = buildPath({ ...base, obstacles: ["fast"], events: [{ id: "e", kind: "talk", title: "Team offsite", date: "2026-10-27" }] });
    const pace = path.find((p) => p.unitId === "cad_pace")!;
    expect(pace.reasons.map((r) => r.text)).toEqual(expect.arrayContaining(["For Team offsite in 9 days", "You said you talk too fast"]));
  });

  it("keeps a skill's units in order across tiers, and advanced work after the foundations", () => {
    const o = order(buildPath({ ...base, obstacles: ["blank"] }));
    // imp_feet (tier 3) is a "blank" target but has to wait.
    expect(o.indexOf("imp_start")).toBeLessThan(o.indexOf("imp_short"));
    const lastFoundation = Math.max(...UNITS.filter((u) => u.tier === 1).map((u) => o.indexOf(u.id)));
    for (const u of UNITS.filter((x) => x.tier === 3)) expect(o.indexOf(u.id)).toBeGreaterThan(lastFoundation);
  });

  it("takes turns between skills", () => {
    const o = order(buildPath(base));
    for (let i = 1; i < 6; i++) expect(unit(o[i]).skill).not.toBe(unit(o[i - 1]).skill);
  });

  it("marks foundations the skill check already showed", () => {
    const path = buildPath({ ...base, checkRatings: { articulation: 44 } });
    expect(path.find((p) => p.unitId === "art_wake")!.status).toBe("tested_out");
    // ...unless something you said points at it.
    const mumbler = buildPath({ ...base, obstacles: ["mumble"], checkRatings: { articulation: 44 } });
    expect(mumbler.find((p) => p.unitId === "art_wake")!.status).not.toBe("tested_out");
  });

  it("picks two active units from different skills, started ones first", () => {
    const lessons = { [LESSONS.find((l) => l.unitId === "cad_pause")!.id]: { done: true } };
    const path = buildPath({ ...base, lessons });
    const active = path.filter((p) => p.status === "active").map((p) => p.unitId);
    expect(active[0]).toBe("cad_pause");
    expect(active).toHaveLength(2);
    expect(unit(active[1]).skill).not.toBe("cadence");
    expect(pickActive(["cad_pace", "cad_pause", "imp_start"])).toEqual(["cad_pace", "imp_start"]);
  });
});

describe("replan", () => {
  it("never moves active or started units, and reports what moved up", () => {
    const old = buildPath(base);
    const active = old.filter((p) => p.status === "active").map((p) => p.unitId);
    const { path, changes } = replan(old, { ...base, events: [{ id: "e", kind: "pitch", title: null, date: "2026-10-25" }] });
    expect(order(path).slice(0, active.length)).toEqual(active);
    expect(path.map((p) => p.unitId).sort()).toEqual(UNITS.map((u) => u.id).sort());
    const moved = changes.find((c) => c.unitId === "con_authority" || c.unitId === "imp_short");
    expect(moved?.reason).toMatch(/your pitch in 7 days/);
  });

  it("moves finished units to done and promotes the next one", () => {
    const old = buildPath(base);
    const first = order(old)[0];
    const { path } = replan(old, { ...base, lessons: doneLessons(first) });
    expect(path.find((p) => p.unitId === first)!.status).toBe("done");
    expect(path.filter((p) => p.status === "active")).toHaveLength(2);
  });

  it("is stable when nothing changed", () => {
    const old = buildPath({ ...base, obstacles: ["ramble"] });
    const { path, changes } = replan(old, { ...base, obstacles: ["ramble"] });
    expect(order(path)).toEqual(order(old));
    expect(changes).toEqual([]);
  });
});

describe("lesson helpers", () => {
  it("finds a lesson's place in its unit and the next lesson", () => {
    const lessons = LESSONS.filter((l) => l.unitId === "cad_pause");
    expect(lessonPosition(lessons[1].id)).toEqual({ unitId: "cad_pause", index: 2, count: lessons.length });
    expect(nextLessonInUnit("cad_pause", { [lessons[0].id]: { done: true } })).toBe(lessons[1].id);
    expect(nextLessonInUnit("cad_pause", doneLessons("cad_pause"))).toBeNull();
  });
});
