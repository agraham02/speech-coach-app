// Pure helpers for the Dev tab's Metrics screen: turning raw readings into
// the numbers shown (CPU percent, sizes, thermal levels) and keeping the list
// of recorded runs. No React Native imports, so it is unit tested.

export type RunKind = "pipeline" | "step" | "asr" | "face" | "manual";

// One recorded stretch of work: a pipeline run, one of its steps, an ASR Lab
// engine run, a Face Lab session, or a manual recording.
export interface MetricRun {
  id: string;
  kind: RunKind;
  label: string;
  // A pipeline step points at its run.
  parentId?: string;
  sessionId?: string;
  startedAt: string;
  durationMs: number;
  // False when the build has no native metrics (only the time is known).
  measured: boolean;
  // 100 = one full core.
  avgCpuPercent?: number;
  peakCpuPercent?: number;
  cpuCores?: number;
  startMemoryBytes?: number;
  peakMemoryBytes?: number;
  endMemoryBytes?: number;
  worstThermalState?: string;
  startBatteryLevel?: number;
  endBatteryLevel?: number;
  avgCurrentMicroAmps?: number;
  // Free-form facts about the run (audio seconds, engine id, outcome).
  detail?: Record<string, string | number | boolean | null>;
}

export const MAX_RUNS = 60;

// Newest first. A step's run is kept with its parent: when the list is
// trimmed, whole pipeline runs go together.
export function addRun(runs: MetricRun[], run: MetricRun, max = MAX_RUNS): MetricRun[] {
  const next = [run, ...runs.filter((r) => r.id !== run.id)];
  const tops = next.filter((r) => !r.parentId);
  if (tops.length <= max) return next;
  const keep = new Set(tops.slice(0, max).map((r) => r.id));
  return next.filter((r) => (r.parentId ? keep.has(r.parentId) : keep.has(r.id)));
}

export function childrenOf(runs: MetricRun[], parentId: string): MetricRun[] {
  return runs.filter((r) => r.parentId === parentId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

// CPU use between two readings of cumulative process CPU time. 100 = one
// full core, so a busy 6-core phone can show up to 600. Null when the gap is
// too short to mean anything or the clock went backwards.
export function cpuPercent(prev: { cpuTimeMs: number; atMs: number }, next: { cpuTimeMs: number; atMs: number }): number | null {
  const wall = next.atMs - prev.atMs;
  const cpu = next.cpuTimeMs - prev.cpuTimeMs;
  if (wall < 50 || cpu < 0) return null;
  return (cpu / wall) * 100;
}

// "240%" plus how much of the device that is ("2.4 of 6 cores").
export function describeCpu(percent: number | null | undefined, cores: number | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return "-";
  const text = Math.round(percent) + "%";
  if (!cores) return text;
  return text + " (" + (percent / 100).toFixed(1) + " of " + cores + " cores)";
}

// Bytes in the unit a person would use: KB, MB under a gigabyte, then GB.
export function formatMemory(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  const abs = Math.abs(bytes);
  if (abs < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  if (abs < 1024 * 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// A signed change ("+312 MB", "-4 MB").
export function formatMemoryDelta(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  return (bytes >= 0 ? "+" : "-") + formatMemory(Math.abs(bytes));
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + " ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + " s";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return minutes + " min " + seconds + " s";
}

// iOS and Android name thermal levels differently; both map onto 0..3 so the
// screen can color them the same way: 0 fine, 1 warm, 2 throttling, 3 severe.
const THERMAL_LEVEL: Record<string, number> = {
  nominal: 0,
  none: 0,
  fair: 1,
  light: 1,
  moderate: 2,
  serious: 2,
  severe: 3,
  critical: 3,
  emergency: 3,
  shutdown: 3,
};

export function thermalLevel(state: string | null | undefined): number | null {
  if (!state) return null;
  const level = THERMAL_LEVEL[state];
  return level === undefined ? null : level;
}

export function thermalLabel(state: string | null | undefined): string {
  if (!state || state === "unknown") return "Unknown";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

// Battery used over a run, in percentage points (positive = drained). Null
// when either end is missing.
export function batteryDrop(start: number | undefined, end: number | undefined): number | null {
  if (start == null || end == null) return null;
  return Math.round((start - end) * 1000) / 10;
}

// Charge drawn over a run from the average current (Android). Makers differ
// on the sign, so the size is what counts.
export function milliampHours(avgMicroAmps: number | undefined, durationMs: number): number | null {
  if (avgMicroAmps == null || durationMs <= 0) return null;
  return (Math.abs(avgMicroAmps) / 1000) * (durationMs / 3_600_000);
}

// The one-line summary under a run in the list.
export function describeRun(run: MetricRun): string {
  const parts = [formatDurationMs(run.durationMs)];
  if (!run.measured) return parts.concat("time only (this build has no native metrics)").join(" · ");
  if (run.peakMemoryBytes != null) {
    const growth = run.startMemoryBytes != null ? " (" + formatMemoryDelta(run.peakMemoryBytes - run.startMemoryBytes) + ")" : "";
    parts.push("peak " + formatMemory(run.peakMemoryBytes) + growth);
  }
  if (run.avgCpuPercent != null) {
    parts.push("CPU " + Math.round(run.avgCpuPercent) + "% avg" + (run.peakCpuPercent != null ? ", " + Math.round(run.peakCpuPercent) + "% peak" : ""));
  }
  const level = thermalLevel(run.worstThermalState);
  if (level != null && level > 0) parts.push(thermalLabel(run.worstThermalState));
  const drop = batteryDrop(run.startBatteryLevel, run.endBatteryLevel);
  if (drop != null && drop !== 0) parts.push("battery " + (drop > 0 ? "-" : "+") + Math.abs(drop) + "%");
  const mah = milliampHours(run.avgCurrentMicroAmps, run.durationMs);
  if (mah != null && mah >= 0.1) parts.push(mah.toFixed(1) + " mAh");
  return parts.join(" · ");
}

// A rolling window for the live charts: the newest `max` values.
export function pushWindow<T>(window: T[], value: T, max: number): T[] {
  const next = window.length >= max ? window.slice(window.length - max + 1) : window.slice();
  next.push(value);
  return next;
}

// The runs as a CSV, one row each, for pasting into a sheet.
export function runsToCsv(runs: MetricRun[]): string {
  const header = ["started_at", "kind", "label", "parent", "duration_ms", "avg_cpu_pct", "peak_cpu_pct", "start_mem_mb", "peak_mem_mb", "end_mem_mb", "worst_thermal", "battery_drop_pct", "avg_current_ua"];
  const mb = (n: number | undefined) => (n == null ? "" : (n / (1024 * 1024)).toFixed(1));
  const num = (n: number | undefined | null, digits = 0) => (n == null ? "" : n.toFixed(digits));
  const quote = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const rows = runs.map((r) =>
    [
      r.startedAt,
      r.kind,
      quote(r.label),
      r.parentId ?? "",
      num(r.durationMs),
      num(r.avgCpuPercent, 1),
      num(r.peakCpuPercent, 1),
      mb(r.startMemoryBytes),
      mb(r.peakMemoryBytes),
      mb(r.endMemoryBytes),
      r.worstThermalState ?? "",
      num(batteryDrop(r.startBatteryLevel, r.endBatteryLevel), 1),
      num(r.avgCurrentMicroAmps),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
