// Prints where the overhaul stands: the session-start hook runs this so a new
// session picks up the current phase and next task. Reads docs/overhaul/PROGRESS.md.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "docs", "overhaul", "PROGRESS.md");
if (!existsSync(path)) process.exit(0);

let section = "";
let next = null;
const blocked = [];
for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
  if (line.startsWith("## ")) section = line.slice(3);
  const waiting = /^\| ([^ |]+) \| (.+?) \| blocked \|/.exec(line);
  if (waiting) blocked.push(waiting[1]);
  const row = /^\| ([^ |]+) \| (.+?) \| (todo|doing) \|/.exec(line);
  if (row && !next) next = { section, id: row[1], task: row[2], status: row[3] };
}

console.log("Tono overhaul in progress. Read docs/overhaul/PLAN.md and PROGRESS.md before working; log any change to the plan in DECISIONS.md.");
console.log(next ? `Current: ${next.section}. Next task ${next.id} (${next.status}): ${next.task}` : "Every task is marked done.");
if (blocked.length) console.log(`Waiting on something outside the code (see PROGRESS.md): ${blocked.join(", ")}`);
