import { readFileSync } from "fs";
import { join } from "path";

// Keeps the overhaul honest (docs/overhaul/PLAN.md, section 17): the plan's
// machine-readable tree must add up, and nothing can be marked done without
// saying what proved it. Phase 3a adds the comparison with skillTree.ts.

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

describe("the tracking files", () => {
  it("never marks a task done without evidence", () => {
    for (const row of tableRows(read("PROGRESS.md"))) {
      const [id, , status, evidence] = row;
      if (status === "done" || status === "iphone") expect([id, evidence.length > 0]).toEqual([id, true]);
    }
  });

  it("uses only known task statuses", () => {
    for (const row of tableRows(read("PROGRESS.md"))) {
      expect(["todo", "doing", "done", "iphone"]).toContain(row[2]);
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
