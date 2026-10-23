/// <reference types="node" />
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { DEFAULT_CONFIG, parseServerConfig } from "../config";

// The config row is seeded from SQL, so the seed must not drift from the
// defaults the code and tests are written against.
describe("migration seed", () => {
  const dir = join(__dirname, "..", "..", "..", "migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");

  it("seeds a config row equal to DEFAULT_CONFIG", () => {
    const match = sql.match(/-- config-seed-begin[\s\S]*?\$json\$([\s\S]*?)\$json\$[\s\S]*?-- config-seed-end/);
    expect(match).not.toBeNull();
    const seeded = parseServerConfig(JSON.parse(match![1]));
    expect(seeded).toEqual(DEFAULT_CONFIG);
  });

  it("turns row level security on for every table it creates", () => {
    const created = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(0);
    for (const table of created) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    }
  });
});
