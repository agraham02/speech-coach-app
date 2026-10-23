import {
  MAX_RUNS,
  addRun,
  batteryDrop,
  childrenOf,
  cpuPercent,
  describeCpu,
  describeRun,
  formatDurationMs,
  formatMemory,
  formatMemoryDelta,
  milliampHours,
  pushWindow,
  runsToCsv,
  thermalLabel,
  thermalLevel,
  type MetricRun,
} from "../metrics";

const MB = 1024 * 1024;

const run = (extra: Partial<MetricRun> = {}): MetricRun => ({
  id: "r1",
  kind: "asr",
  label: "Whisper turbo",
  startedAt: "2026-10-22T10:00:00.000Z",
  durationMs: 12_400,
  measured: true,
  avgCpuPercent: 182.4,
  peakCpuPercent: 391,
  cpuCores: 6,
  startMemoryBytes: 200 * MB,
  peakMemoryBytes: 812 * MB,
  endMemoryBytes: 260 * MB,
  worstThermalState: "nominal",
  ...extra,
});

describe("cpuPercent", () => {
  it("is CPU time over wall time, 100 per core", () => {
    expect(cpuPercent({ cpuTimeMs: 1000, atMs: 0 }, { cpuTimeMs: 3000, atMs: 1000 })).toBe(200);
  });
  it("is null for a gap too short or a clock that went backwards", () => {
    expect(cpuPercent({ cpuTimeMs: 0, atMs: 0 }, { cpuTimeMs: 10, atMs: 20 })).toBeNull();
    expect(cpuPercent({ cpuTimeMs: 100, atMs: 0 }, { cpuTimeMs: 50, atMs: 1000 })).toBeNull();
  });
});

describe("formatting", () => {
  it("picks KB, MB or GB", () => {
    expect(formatMemory(512 * 1024)).toBe("512 KB");
    expect(formatMemory(412.4 * MB)).toBe("412 MB");
    expect(formatMemory(3.5 * 1024 * MB)).toBe("3.50 GB");
    expect(formatMemory(undefined)).toBe("-");
  });
  it("signs a change", () => {
    expect(formatMemoryDelta(312 * MB)).toBe("+312 MB");
    expect(formatMemoryDelta(-4 * MB)).toBe("-4 MB");
  });
  it("shows CPU against the core count", () => {
    expect(describeCpu(240, 6)).toBe("240% (2.4 of 6 cores)");
    expect(describeCpu(null, 6)).toBe("-");
    expect(describeCpu(50, undefined)).toBe("50%");
  });
  it("formats durations", () => {
    expect(formatDurationMs(420)).toBe("420 ms");
    expect(formatDurationMs(12_400)).toBe("12.4 s");
    expect(formatDurationMs(125_000)).toBe("2 min 5 s");
  });
});

describe("thermal", () => {
  it("maps both platforms onto one scale", () => {
    expect(thermalLevel("nominal")).toBe(0);
    expect(thermalLevel("none")).toBe(0);
    expect(thermalLevel("fair")).toBe(1);
    expect(thermalLevel("moderate")).toBe(2);
    expect(thermalLevel("serious")).toBe(2);
    expect(thermalLevel("critical")).toBe(3);
    expect(thermalLevel("unknown")).toBeNull();
    expect(thermalLevel(undefined)).toBeNull();
  });
  it("labels in sentence case", () => {
    expect(thermalLabel("serious")).toBe("Serious");
    expect(thermalLabel("unknown")).toBe("Unknown");
  });
});

describe("battery", () => {
  it("reports the drop in points", () => {
    expect(batteryDrop(0.82, 0.8)).toBe(2);
    expect(batteryDrop(undefined, 0.8)).toBeNull();
  });
  it("turns average current into mAh whatever the sign", () => {
    expect(milliampHours(-600_000, 3_600_000)).toBeCloseTo(600);
    expect(milliampHours(300_000, 60_000)).toBeCloseTo(5);
    expect(milliampHours(undefined, 1000)).toBeNull();
  });
});

describe("describeRun", () => {
  it("leads with time, peak and growth, then CPU", () => {
    expect(describeRun(run())).toBe("12.4 s · peak 812 MB (+612 MB) · CPU 182% avg, 391% peak");
  });
  it("adds a warm thermal state and battery drop", () => {
    const text = describeRun(run({ worstThermalState: "serious", startBatteryLevel: 0.8, endBatteryLevel: 0.78 }));
    expect(text).toContain("Serious");
    expect(text).toContain("battery -2%");
  });
  it("says when only the time is known", () => {
    expect(describeRun(run({ measured: false }))).toContain("time only");
  });
});

describe("addRun", () => {
  it("puts the newest first and replaces a run with the same id", () => {
    const list = addRun(addRun([], run({ id: "a" })), run({ id: "b" }));
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(addRun(list, run({ id: "a", label: "again" })).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("trims whole pipeline runs, steps with them", () => {
    let list: MetricRun[] = [];
    list = addRun(list, run({ id: "old", kind: "pipeline" }), 2);
    list = addRun(list, run({ id: "old-step", kind: "step", parentId: "old" }), 2);
    list = addRun(list, run({ id: "mid" }), 2);
    list = addRun(list, run({ id: "new" }), 2);
    expect(list.map((r) => r.id)).toEqual(["new", "mid"]);
  });
  it("keeps steps of a kept run and lists them in order", () => {
    let list: MetricRun[] = [];
    list = addRun(list, run({ id: "p", kind: "pipeline" }));
    list = addRun(list, run({ id: "s2", kind: "step", parentId: "p", startedAt: "2026-10-22T10:00:05.000Z" }));
    list = addRun(list, run({ id: "s1", kind: "step", parentId: "p", startedAt: "2026-10-22T10:00:01.000Z" }));
    expect(childrenOf(list, "p").map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(MAX_RUNS).toBeGreaterThan(10);
  });
});

describe("pushWindow", () => {
  it("keeps the newest values", () => {
    expect(pushWindow([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(pushWindow([1], 2, 3)).toEqual([1, 2]);
  });
});

describe("runsToCsv", () => {
  it("writes a header and quotes labels with commas", () => {
    const csv = runsToCsv([run({ label: "Turbo, filler prompt" })]);
    const [header, row] = csv.split("\n");
    expect(header.startsWith("started_at,kind,label")).toBe(true);
    expect(row).toContain('"Turbo, filler prompt"');
    expect(row).toContain("812.0");
  });
});
