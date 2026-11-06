import { addResult, buildSignalLabExport, latestResult, MAX_RUNS_PER_TEST, readingStandings, statusOf, type LabResults } from "../results";
import { READINGS, readingCounts, READING_IDS } from "../readingTrust";
import type { LabOutcome, LabResult, LabTestEntry } from "../types";

const outcome = (pass: boolean | null): LabOutcome => ({ pass, checks: [], summary: "", numbers: {} });
const run = (testId: string, pass: boolean | null, at = "2026-11-06T10:00:00Z"): LabResult => ({
  testId,
  at,
  appVersion: "2.0.0",
  extractorVersion: "x",
  thresholdsVersion: 2,
  outcome: outcome(pass),
});
const entry = (id: string, blockedBy?: string): LabTestEntry => ({
  def: { id, group: "voice", title: id, summary: "", minutes: 1, steps: [], bars: ["a bar"], onFail: "stays Beta", ...(blockedBy ? { blockedBy } : {}) },
  evaluate: () => outcome(true),
});

describe("the lab's test results", () => {
  it("keeps the newest runs first and caps them", () => {
    let results: LabResults = {};
    for (let i = 0; i < MAX_RUNS_PER_TEST + 3; i++) results = addResult(results, run("voice.pauses", i % 2 === 0, `2026-11-06T10:${String(i).padStart(2, "0")}:00Z`));
    expect(results["voice.pauses"]).toHaveLength(MAX_RUNS_PER_TEST);
    expect(latestResult(results, "voice.pauses")?.at).toBe("2026-11-06T10:12:00Z");
  });

  it("reads a test's status from its latest run", () => {
    const e = entry("voice.pauses");
    expect(statusOf(e.def, {})).toBe("not_run");
    expect(statusOf(e.def, { "voice.pauses": [run("voice.pauses", true)] })).toBe("pass");
    expect(statusOf(e.def, { "voice.pauses": [run("voice.pauses", false), run("voice.pauses", true)] })).toBe("fail");
    expect(statusOf(e.def, { "voice.pauses": [run("voice.pauses", null)] })).toBe("unclear");
    expect(statusOf(entry("content.judge", "Needs the hosted eval").def, {})).toBe("blocked");
  });
});

describe("reading trust", () => {
  it("lists every reading with the tests that gate it", () => {
    for (const id of READING_IDS) {
      expect(READINGS[id].id).toBe(id);
      expect(READINGS[id].tests.length).toBeGreaterThan(0);
    }
  });

  it("counts nothing that is on probation or being tuned, unless the Dev preview says so", () => {
    for (const id of READING_IDS) expect(readingCounts(id)).toBe(READINGS[id].status === "now");
    expect(readingCounts("endings_fall")).toBe(false);
    expect(readingCounts("endings_fall", { endings_fall: true })).toBe(true);
    expect(readingCounts("endings_fall", { endings_fall: false })).toBe(false);
  });

  it("marks a reading ready to promote only when every gating test passed", () => {
    const entries = [entry("voice.pitch_variety"), entry("presence.expression")];
    const half: LabResults = { "voice.pitch_variety": [run("voice.pitch_variety", true)] };
    expect(readingStandings(entries, half).find((r) => r.id === "range_across_feelings")?.readyToPromote).toBe(false);
    const both: LabResults = { ...half, "presence.expression": [run("presence.expression", true)] };
    expect(readingStandings(entries, both).find((r) => r.id === "range_across_feelings")?.readyToPromote).toBe(true);
    // A test missing from the registry can't pass.
    expect(readingStandings([entry("voice.pitch_variety")], both).find((r) => r.id === "range_across_feelings")?.readyToPromote).toBe(false);
  });
});

describe("the export", () => {
  it("carries the bars, the runs and each reading's standing", () => {
    const entries = [entry("voice.endings")];
    const out = buildSignalLabExport({
      context: { exportedAt: "2026-11-06T10:00:00Z", app: { version: "2.0.0", build: "Dev", os: "iOS" } },
      entries,
      results: { "voice.endings": [run("voice.endings", true)] },
      preview: { pitch_variety: true },
    });
    expect(out.kind).toBe("tono-signal-lab");
    expect(out.tests[0]).toMatchObject({ id: "voice.endings", status: "pass", bars: ["a bar"], onFail: "stays Beta" });
    expect(out.tests[0].runs).toHaveLength(1);
    expect(out.previewSwitch).toEqual({ pitch_variety: true });
    expect(out.readings.find((r) => r.id === "endings_fall")?.readyToPromote).toBe(true);
  });
});
