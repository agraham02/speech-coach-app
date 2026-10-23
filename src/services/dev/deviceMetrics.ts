import { Paths } from "expo-file-system";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { beginNativeWatch, endNativeWatch, hasDeviceMetrics, readNativeSnapshot, readNativeWatch, type NativeSnapshot, type NativeWatchSummary } from "../../../modules/device-metrics";
import { addRun, cpuPercent, pushWindow, type MetricRun, type RunKind } from "../../domain/dev/metrics";
import { generateId } from "../../utils/generateId";
import { logger } from "../../utils/logger";
import { getDevJson, removeDevKey, setDevJson } from "./devStore";

// Device metrics for the Dev tab: live readings for the Metrics screen and
// the overlay, and recorded runs (pipeline steps, ASR Lab engines, Face Lab,
// manual recordings) with their peaks. Everything is a no-op in production
// builds, and degrades to time-only runs on builds without the native module.

export interface MetricsReading {
  atMs: number;
  native: NativeSnapshot | null;
  // Since the previous live reading; null for the first.
  cpuPercent: number | null;
  // Hermes heap (JS objects only, not native allocations).
  jsHeapBytes: number | null;
  storageFreeBytes: number | null;
  storageTotalBytes: number | null;
}

const RUNS_KEY = "metricRuns";
const OVERLAY_KEY = "metricsOverlay";
const INTERVAL_KEY = "metricsIntervalMs";
// How often a run's watch samples, natively. Fast enough to catch a spike
// from a model load, cheap enough not to show up in the numbers.
const WATCH_INTERVAL_MS = 250;
export const LIVE_WINDOW = 90;
export const INTERVAL_CHOICES = [250, 500, 1000, 2000];

export const metricsEnabled = SHOW_DEV_TOOLS;

export function nativeMetricsAvailable(): boolean {
  return hasDeviceMetrics();
}

function jsHeapBytes(): number | null {
  try {
    const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal;
    const stats = hermes?.getInstrumentedStats?.();
    return typeof stats?.js_heapSize === "number" ? stats.js_heapSize : null;
  } catch {
    return null;
  }
}

function storage(): { free: number | null; total: number | null } {
  try {
    return { free: Paths.availableDiskSpace, total: Paths.totalDiskSpace };
  } catch {
    return { free: null, total: null };
  }
}

// One reading now. `prev` turns cumulative CPU time into a percentage.
export function readMetrics(prev?: MetricsReading | null): MetricsReading {
  const native = readNativeSnapshot();
  const atMs = native?.uptimeMs ?? Date.now();
  const disk = storage();
  return {
    atMs,
    native,
    cpuPercent:
      native && prev?.native ? cpuPercent({ cpuTimeMs: prev.native.cpuTimeMs, atMs: prev.atMs }, { cpuTimeMs: native.cpuTimeMs, atMs }) : null,
    jsHeapBytes: jsHeapBytes(),
    storageFreeBytes: disk.free,
    storageTotalBytes: disk.total,
  };
}

// ---- Live sampling ---------------------------------------------------------

type LiveListener = (latest: MetricsReading, history: MetricsReading[]) => void;

const liveListeners = new Set<LiveListener>();
let liveTimer: ReturnType<typeof setInterval> | null = null;
let liveHistory: MetricsReading[] = [];

export function getLiveInterval(): number {
  const saved = getDevJson<number>(INTERVAL_KEY, 1000);
  return INTERVAL_CHOICES.includes(saved) ? saved : 1000;
}

export function setLiveInterval(ms: number): void {
  setDevJson(INTERVAL_KEY, ms);
  if (liveTimer) {
    stopLive();
    startLive();
  }
}

function tick() {
  const reading = readMetrics(liveHistory[liveHistory.length - 1]);
  liveHistory = pushWindow(liveHistory, reading, LIVE_WINDOW);
  liveListeners.forEach((listener) => listener(reading, liveHistory));
}

function startLive() {
  tick();
  liveTimer = setInterval(tick, getLiveInterval());
}

function stopLive() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = null;
}

// Live readings while anyone listens; the timer stops with the last one.
export function subscribeLive(listener: LiveListener): () => void {
  if (!metricsEnabled) return () => undefined;
  liveListeners.add(listener);
  if (!liveTimer) startLive();
  else if (liveHistory.length) listener(liveHistory[liveHistory.length - 1], liveHistory);
  return () => {
    liveListeners.delete(listener);
    if (liveListeners.size === 0) stopLive();
  };
}

// ---- Overlay ---------------------------------------------------------------

const overlayListeners = new Set<(on: boolean) => void>();

export function isOverlayOn(): boolean {
  return metricsEnabled && getDevJson<boolean>(OVERLAY_KEY, false);
}

export function setOverlayOn(on: boolean): void {
  setDevJson(OVERLAY_KEY, on);
  overlayListeners.forEach((listener) => listener(on));
}

export function subscribeOverlay(listener: (on: boolean) => void): () => void {
  overlayListeners.add(listener);
  return () => overlayListeners.delete(listener);
}

// ---- Runs ------------------------------------------------------------------

const runListeners = new Set<(runs: MetricRun[]) => void>();

export function getRuns(): MetricRun[] {
  return getDevJson<MetricRun[]>(RUNS_KEY, []);
}

export function clearRuns(): void {
  removeDevKey(RUNS_KEY);
  runListeners.forEach((listener) => listener([]));
}

export function subscribeRuns(listener: (runs: MetricRun[]) => void): () => void {
  runListeners.add(listener);
  return () => runListeners.delete(listener);
}

function saveRun(run: MetricRun) {
  const next = addRun(getRuns(), run);
  setDevJson(RUNS_KEY, next);
  runListeners.forEach((listener) => listener(next));
}

export interface RunOptions {
  parentId?: string;
  sessionId?: string;
  detail?: MetricRun["detail"];
}

export interface RunHandle {
  id: string;
  // The run so far (for a live "peak so far"), without stopping it.
  peek(): NativeWatchSummary | null;
  // Stops and saves the run. Extra detail is merged in. Safe to call twice.
  end(detail?: MetricRun["detail"]): MetricRun | null;
}

const NOOP_HANDLE: RunHandle = { id: "", peek: () => null, end: () => null };

function toRun(base: Omit<MetricRun, "durationMs" | "measured">, summary: NativeWatchSummary | null, durationMs: number, cores?: number): MetricRun {
  if (!summary) return { ...base, durationMs, measured: false };
  return {
    ...base,
    durationMs: summary.durationMs,
    measured: true,
    avgCpuPercent: summary.avgCpuPercent,
    peakCpuPercent: summary.peakCpuPercent,
    cpuCores: cores,
    startMemoryBytes: summary.startMemoryBytes,
    peakMemoryBytes: summary.peakMemoryBytes,
    endMemoryBytes: summary.endMemoryBytes,
    worstThermalState: summary.worstThermalState,
    startBatteryLevel: summary.startBatteryLevel,
    endBatteryLevel: summary.endBatteryLevel,
    avgCurrentMicroAmps: summary.avgCurrentMicroAmps,
  };
}

// Starts recording a run. Its peaks are sampled natively until end().
export function beginRun(kind: RunKind, label: string, options: RunOptions = {}): RunHandle {
  if (!metricsEnabled) return NOOP_HANDLE;
  const id = generateId();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const watching = beginNativeWatch(id, WATCH_INTERVAL_MS);
  let ended = false;
  return {
    id,
    peek: () => (watching && !ended ? readNativeWatch(id) : null),
    end(detail) {
      if (ended) return null;
      ended = true;
      const summary = watching ? endNativeWatch(id) : null;
      const run = toRun(
        { id, kind, label, parentId: options.parentId, sessionId: options.sessionId, startedAt, detail: { ...options.detail, ...detail } },
        summary,
        Date.now() - startedMs,
        summary ? readNativeSnapshot()?.cpuCores : undefined,
      );
      try {
        saveRun(run);
      } catch (error) {
        logger.warn("[metrics] could not save run: " + (error as Error).message);
      }
      return run;
    },
  };
}

// Records `task` as a run. The run is saved whether it succeeds or throws.
export async function traceRun<T>(kind: RunKind, label: string, task: () => Promise<T>, options: RunOptions = {}): Promise<T> {
  const handle = beginRun(kind, label, options);
  try {
    const result = await task();
    handle.end({ ok: true });
    return result;
  } catch (error) {
    handle.end({ ok: false });
    throw error;
  }
}

// ---- Manual recording ------------------------------------------------------

// Started from the Metrics screen and left running while you use the app
// (for example, a model run on another screen). One at a time.
let manual: { handle: RunHandle; startedMs: number } | null = null;
const manualListeners = new Set<(running: boolean) => void>();

export function isManualRunning(): boolean {
  return manual != null;
}

export function manualStartedMs(): number | null {
  return manual?.startedMs ?? null;
}

export function startManual(): void {
  if (manual) return;
  const count = getRuns().filter((r) => r.kind === "manual").length + 1;
  manual = { handle: beginRun("manual", "Recording " + count), startedMs: Date.now() };
  manualListeners.forEach((listener) => listener(true));
}

export function stopManual(): MetricRun | null {
  if (!manual) return null;
  const run = manual.handle.end();
  manual = null;
  manualListeners.forEach((listener) => listener(false));
  return run;
}

export function peekManual(): NativeWatchSummary | null {
  return manual?.handle.peek() ?? null;
}

export function subscribeManual(listener: (running: boolean) => void): () => void {
  manualListeners.add(listener);
  return () => manualListeners.delete(listener);
}
