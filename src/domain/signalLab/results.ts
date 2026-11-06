import { READING_IDS, READINGS, type ReadingId } from "./readingTrust";
import type { LabResult, LabStatus, LabTestDef, LabTestEntry } from "./types";

// What the stored runs say about each test and each reading. Pure.

export const MAX_RUNS_PER_TEST = 10;

export type LabResults = Record<string, LabResult[]>;

// Newest first, capped.
export function addResult(results: LabResults, result: LabResult): LabResults {
  const runs = [result, ...(results[result.testId] ?? [])].slice(0, MAX_RUNS_PER_TEST);
  return { ...results, [result.testId]: runs };
}

export function latestResult(results: LabResults, testId: string): LabResult | undefined {
  return results[testId]?.[0];
}

export function statusOf(def: LabTestDef, results: LabResults): LabStatus {
  if (def.blockedBy) return "blocked";
  const latest = latestResult(results, def.id);
  if (!latest) return "not_run";
  if (latest.outcome.pass === true) return "pass";
  if (latest.outcome.pass === false) return "fail";
  return "unclear";
}

export const STATUS_LABELS: Record<LabStatus, string> = {
  not_run: "Not run",
  pass: "Passed",
  fail: "Failed",
  unclear: "Needs another run",
  blocked: "Blocked",
};

export interface ReadingStanding {
  id: ReadingId;
  label: string;
  status: "now" | "probation" | "tuning";
  // Every test that gates it, with where each stands.
  tests: { id: string; title: string; status: LabStatus }[];
  // On probation or tuning and every gating test passed: ready for the owner
  // to promote in code (readingTrust.ts).
  readyToPromote: boolean;
}

export function readingStandings(entries: LabTestEntry[], results: LabResults): ReadingStanding[] {
  return READING_IDS.map((id) => {
    const reading = READINGS[id];
    const tests = reading.tests.map((testId) => {
      const entry = entries.find((e) => e.def.id === testId);
      return { id: testId, title: entry?.def.title ?? testId, status: entry ? statusOf(entry.def, results) : ("blocked" as LabStatus) };
    });
    const allPass = tests.length > 0 && tests.every((t) => t.status === "pass");
    return { id, label: reading.label, status: reading.status, tests, readyToPromote: reading.status !== "now" && allPass };
  });
}

export interface SignalLabExportInput {
  context: { exportedAt: string; app: { version: string; build: string; os: string } };
  entries: LabTestEntry[];
  results: LabResults;
  // Readings counted early in the Dev preview switch.
  preview: Partial<Record<ReadingId, boolean>>;
}

// The file pasted back for tuning: every test with its bars and its recent
// runs, and where each reading stands.
export function buildSignalLabExport({ context, entries, results, preview }: SignalLabExportInput) {
  return {
    kind: "tono-signal-lab",
    version: 1,
    ...context,
    previewSwitch: preview,
    readings: readingStandings(entries, results),
    tests: entries.map(({ def }) => ({
      id: def.id,
      title: def.title,
      status: statusOf(def, results),
      blockedBy: def.blockedBy ?? null,
      bars: def.bars,
      onFail: def.onFail,
      runs: results[def.id] ?? [],
    })),
  };
}
