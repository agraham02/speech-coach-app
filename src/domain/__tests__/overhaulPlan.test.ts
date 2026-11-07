import { readFileSync } from "fs";
import { join } from "path";
import { JUDGED_SCALE, LEAVES, SCORE_SCALE, SKILL_CHECK_SEED, SKILL_TREE, STARTING_VALUE, TAKE_WEIGHTS } from "../scoring/skillTree";
import { GRID_ROWS, GRID_WEIGHTS, LESSON_TARGETS, getGridRow } from "../../content/skillGrid";
import { ACTIVITIES, ACTIVITY_IDS, activityIdOfStep, drillActivityId, getActivity, warmupActivityId } from "../../content/activities";
import { LESSONS } from "../../content/lessons";

// Keeps the overhaul honest (docs/overhaul/PLAN.md, section 17): the plan's
// machine-readable tree must add up, nothing can be marked done without saying
// what proved it, and the code's tree and grid must say what the plan says. The
// grid's rows and the lessons' targets are compared with the plan's own tables,
// so a mistyped dot or leaf fails here.

const docs = join(__dirname, "..", "..", "..", "docs", "overhaul");
const read = (name: string) => readFileSync(join(docs, name), "utf8").replace(/\r\n/g, "\n");

interface Skill {
  name: string;
  weight: number;
  leaves: [string, number, string][];
}
interface Pillar {
  pillar: string;
  weight: number;
  skills: Skill[];
}

function appendixC() {
  const plan = read("PLAN.md");
  const after = plan.slice(plan.indexOf("## Appendix C"));
  const open = after.indexOf("```json\n") + "```json\n".length;
  return JSON.parse(after.slice(open, after.indexOf("\n```", open))) as {
    scale: { min: number; max: number };
    startingValue: number;
    skillCheckSeed: { min: number; max: number };
    judgedScale: { min: number; max: number; multiplier: number };
    gridWeights: Record<string, number>;
    tree: Pillar[];
    takeWeights: Record<string, number>;
    level: { min: number; max: number; level2At: number; pointsPerLevel: number };
    stages: { name: string; from: number }[];
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function tableRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ID ") && !line.startsWith("|---"))
    .map((line) =>
      line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim()),
    );
}

describe("the plan's tree", () => {
  const data = appendixC();
  const leaves = data.tree.flatMap((p) => p.skills.flatMap((s) => s.leaves));

  it("has the agreed shape", () => {
    expect(data.tree.map((p) => p.pillar)).toEqual(["Message", "Voice", "Connection", "Clarity", "Presence", "Composure"]);
    expect(data.tree.flatMap((p) => p.skills)).toHaveLength(26);
    expect(leaves).toHaveLength(63);
  });

  it("adds up to 100 at every level", () => {
    expect(sum(data.tree.map((p) => p.weight))).toBe(100);
    expect(sum(Object.values(data.takeWeights))).toBe(100);
    for (const pillar of data.tree) {
      expect([pillar.pillar, sum(pillar.skills.map((s) => s.weight))]).toEqual([pillar.pillar, 100]);
      for (const skill of pillar.skills) {
        expect([skill.name, sum(skill.leaves.map((l) => l[1]))]).toEqual([skill.name, 100]);
      }
    }
  });

  it("gives every leaf a unique name, since a leaf has one parent", () => {
    const names = leaves.map((l) => l[0]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reaches level 25 at 97, one level every 3 points", () => {
    const { level } = data;
    expect(level.level2At + (level.max - 2) * level.pointsPerLevel).toBe(97);
  });
});

describe("the code's tree against Appendix C", () => {
  const data = appendixC();

  it("has the same pillars, skills, leaves, weights and trust", () => {
    const code = SKILL_TREE.map((p) => ({
      pillar: p.name,
      weight: p.weight,
      skills: (p.skills as readonly { name: string; weight: number; leaves: readonly { name: string; weight: number; trust: string }[] }[]).map((s) => ({
        name: s.name,
        weight: s.weight,
        leaves: s.leaves.map((l) => [l.name, l.weight, l.trust]),
      })),
    }));
    expect(code).toEqual(data.tree);
  });

  it("has the same scale, starting value, seed range and judged scale", () => {
    expect(SCORE_SCALE).toEqual(data.scale);
    expect(STARTING_VALUE).toBe(data.startingValue);
    expect(SKILL_CHECK_SEED).toEqual(data.skillCheckSeed);
    expect(JUDGED_SCALE).toEqual(data.judgedScale);
  });

  it("has the same take weights and grid weights", () => {
    expect(TAKE_WEIGHTS).toEqual({ message: data.takeWeights.Message, voice: data.takeWeights.Voice, clarity: data.takeWeights.Clarity, presence: data.takeWeights.Presence });
    expect(GRID_WEIGHTS).toEqual(data.gridWeights);
  });
});

// The plan's tables in a stretch of the document: each is its header cells and
// its rows, with markdown emphasis taken out.
function tablesIn(text: string): { header: string[]; rows: string[][] }[] {
  const tables: { header: string[]; rows: string[][] }[] = [];
  let current: string[][] | null = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      current = null;
      continue;
    }
    if (line.startsWith("|---")) continue;
    const cells = line
      .replace(/^\|\s*/, "")
      .replace(/\s*\|\s*$/, "")
      .split(" | ")
      .map((c) => c.replace(/\*\*/g, "").trim());
    if (!current) {
      current = [];
      tables.push({ header: cells, rows: current });
    } else current.push(cells);
  }
  return tables;
}

// "Stalls ●●●, Ums and uhs ●●" to pairs of leaf and dots. Dots apply to every
// leaf named since the last dots ("Ums and uhs, Like, actually, and Stalls ●"),
// and a leaf named with no dots after it is only an example in the prose.
function movesInCell(cell: string): [string, number][] {
  const names = LEAVES.map((l) => l.name).sort((a, b) => b.length - a.length);
  const out: [string, number][] = [];
  let pending: string[] = [];
  let i = 0;
  while (i < cell.length) {
    if (cell[i] === "●") {
      let dots = 0;
      while (cell[i + dots] === "●") dots++;
      for (const name of pending) out.push([name, dots]);
      pending = [];
      i += dots;
      continue;
    }
    const name = names.find((n) => cell.startsWith(n, i));
    if (name) {
      pending.push(name);
      i += name.length;
    } else i++;
  }
  return out;
}

const DOTS: Record<string, number> = { main: 3, partial: 2, light: 1 };
const byNameThenDots = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]) || a[1] - b[1];

describe("the grid against the plan's section 7", () => {
  const plan = read("PLAN.md");
  const section = plan.slice(plan.indexOf("## 7. The scoring grid"), plan.indexOf("**Lessons** are built from these"));
  // The Takes table has no number column: its rows are prose, and skillGrid.test.ts checks them.
  const tables = tablesIn(section).filter((t) => t.header.includes("The number"));

  // Where the plan's first cell isn't one activity's title.
  const NAMED: Record<string, string[]> = {
    "Mark it up, Line rep, Phrasebook reps, Line of the day": [drillActivityId("marked_reading"), ACTIVITY_IDS.phrasebook],
    "Low breath, Calming sigh": [warmupActivityId("wu_low_breath"), warmupActivityId("wu_sigh")],
    "Speech study, Rehearse": [ACTIVITY_IDS.speechStudy, ACTIVITY_IDS.rehearse],
    "Felt vs measured": [ACTIVITY_IDS.review],
    "Attention rating (conversation drills)": [ACTIVITY_IDS.attention],
    "Live conversation (Plus)": [drillActivityId("conv_live")],
  };
  const idsFor = (name: string): string[] => {
    if (NAMED[name]) return NAMED[name];
    // A lesson can share a title with its drill; the plan's rows here are never lessons.
    const found = ACTIVITIES.filter((a) => a.title === name && a.kind !== "lesson");
    expect({ name, found: found.length }).toEqual({ name, found: 1 });
    return found.map((a) => a.id);
  };

  it("finds the plan's tables", () => {
    expect(tables.length).toBe(6);
    expect(tables.flatMap((t) => t.rows).length).toBeGreaterThan(60);
  });

  it("has the plan's number and moves for every row", () => {
    for (const table of tables) {
      const number = table.header.indexOf("The number");
      const moves = table.header.indexOf("Moves");
      for (const cells of table.rows) {
        for (const id of idsFor(cells[0])) {
          const row = getGridRow(id);
          expect({ id, number: row?.number }).toEqual({ id, number: cells[number] });
          const inCode = (row?.moves ?? []).filter((m) => !m.displayOnly).map((m): [string, number] => [LEAVES.find((l) => l.id === m.leaf)!.name, DOTS[m.weight]]);
          expect({ id, moves: inCode.sort(byNameThenDots) }).toEqual({ id, moves: movesInCell(cells[moves]).sort(byNameThenDots) });
        }
      }
    }
  });

  it("has a gate wherever the plan's table gives one", () => {
    for (const table of tables) {
      const gate = table.header.findIndex((h) => h.startsWith("Gate"));
      if (gate < 0) continue;
      for (const cells of table.rows) for (const id of idsFor(cells[0])) expect({ id, gate: !!getGridRow(id)?.gate }).toEqual({ id, gate: true });
    }
  });

  it("has no row the plan doesn't", () => {
    const planned = new Set(tables.flatMap((t) => t.rows.flatMap((cells) => idsFor(cells[0]))));
    const takes: string[] = [ACTIVITY_IDS.impromptu, ACTIVITY_IDS.concise, ACTIVITY_IDS.freeRecord, ACTIVITY_IDS.script, ACTIVITY_IDS.skillCheck, ACTIVITY_IDS.checkpoint];
    expect(GRID_ROWS.map((r) => r.activityId).filter((id) => !planned.has(id) && !takes.includes(id))).toEqual([]);
  });
});

describe("the lessons against the plan's Appendix A", () => {
  const plan = read("PLAN.md");
  const rows = tablesIn(plan.slice(plan.indexOf("## Appendix A"), plan.indexOf("## Appendix B"))).flatMap((t) => t.rows);
  const straight = (s: string) => s.replace(/[“”]/g, '"');
  const lessonNamed = (title: string) => LESSONS.find((l) => straight(l.title) === title);

  it("lists all 71, and each is a lesson in the app", () => {
    expect(rows).toHaveLength(71);
    expect(rows.filter((r) => !lessonNamed(r[0])).map((r) => r[0])).toEqual([]);
  });

  it("gives each lesson the plan's target leaf", () => {
    for (const [title, target] of rows) {
      const lesson = lessonNamed(title)!;
      const name = LEAVES.find((l) => l.id === LESSON_TARGETS[lesson.id])?.name;
      expect({ title, target: name }).toEqual({ title, target: target.replace(", for now", "") });
    }
  });

  it("has the steps the plan lists, in order", () => {
    // The plan's short names for what the app calls something longer, and titles
    // that lose their commas in the plan's comma-separated list.
    const ALIAS: Record<string, string> = { twister: "tongue twister", "line rep": "mark it up", rep: "impromptu" };
    const normal = (s: string) => s.toLowerCase().replace(/,/g, "");
    for (const [title, , steps] of rows) {
      const planned = steps.split(", ").flatMap((part) => {
        const [, name, times] = part.match(/^(.*?)(?: ×(\d))?$/)!;
        return Array.from({ length: Number(times ?? 1) }, () => ALIAS[normal(name)] ?? normal(name));
      });
      const inApp = lessonNamed(title)!.steps.map((step) => normal(getActivity(activityIdOfStep(step))!.title));
      expect({ title, steps: inApp }).toEqual({ title, steps: planned });
    }
  });
});

describe("the tracking files", () => {
  it("never marks a task done without evidence", () => {
    for (const row of tableRows(read("PROGRESS.md"))) {
      const [id, , status, evidence] = row;
      if (status === "done" || status === "iphone") expect([id, evidence.length > 0]).toEqual([id, true]);
    }
  });

  it("uses only known task statuses", () => {
    for (const row of tableRows(read("PROGRESS.md"))) {
      expect(["todo", "doing", "done", "iphone", "blocked"]).toContain(row[2]);
    }
  });

  it("lists all 53 requirements, each with evidence once done", () => {
    const rows = tableRows(read("REQUIREMENTS.md"));
    expect(rows.map((r) => r[0])).toEqual(Array.from({ length: 53 }, (_, i) => `R${i + 1}`));
    for (const row of rows) {
      const [id, , , , , status, evidence] = row;
      expect(["todo", "doing", "done", "iphone"]).toContain(status);
      if (status === "done" || status === "iphone") expect([id, evidence.length > 0]).toEqual([id, true]);
    }
  });
});
