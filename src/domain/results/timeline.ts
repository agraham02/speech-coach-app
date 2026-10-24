import { formatClock } from "../playback/followAlong";

// The shared time axis of the Scores tab's charts (pace, pitch, loudness):
// one viewport, so every chart shows the same stretch of the take with the
// same ticks, and a zoom or a scrub on one moves them all. Pure.

export interface Viewport {
  startMs: number;
  endMs: number;
}

// Zoomed in this far you still see about this much speech at a time.
export const MIN_SPAN_MS = 8_000;
// How much one zoom button press or double tap zooms.
export const ZOOM_STEP = 2;

export function fullViewport(durationMs: number): Viewport {
  return { startMs: 0, endMs: Math.max(1, durationMs) };
}

export function spanOf(vp: Viewport): number {
  return vp.endMs - vp.startMs;
}

export function isZoomed(vp: Viewport, durationMs: number): boolean {
  return spanOf(vp) < durationMs - 1;
}

// Keeps the span (within the smallest allowed and the whole take) and slides
// the window back inside the take.
export function clampViewport(vp: Viewport, durationMs: number, minSpanMs = MIN_SPAN_MS): Viewport {
  const total = Math.max(1, durationMs);
  const span = Math.min(total, Math.max(Math.min(minSpanMs, total), spanOf(vp)));
  const start = Math.min(Math.max(0, vp.startMs), total - span);
  return { startMs: start, endMs: start + span };
}

// factor above 1 zooms in, below 1 out. The moment under `anchorMs` stays
// under the same finger.
export function zoomViewport(vp: Viewport, factor: number, anchorMs: number, durationMs: number): Viewport {
  if (!(factor > 0)) return vp;
  const span = spanOf(vp);
  const rel = span > 0 ? (anchorMs - vp.startMs) / span : 0.5;
  const nextSpan = span / factor;
  const start = anchorMs - rel * nextSpan;
  return clampViewport({ startMs: start, endMs: start + nextSpan }, durationMs);
}

export function panViewport(vp: Viewport, deltaMs: number, durationMs: number): Viewport {
  return clampViewport({ startMs: vp.startMs + deltaMs, endMs: vp.endMs + deltaMs }, durationMs);
}

export function xOfMs(ms: number, vp: Viewport, width: number): number {
  const span = spanOf(vp);
  return span > 0 ? ((ms - vp.startMs) / span) * width : 0;
}

export function msOfX(x: number, vp: Viewport, width: number): number {
  return width > 0 ? vp.startMs + (x / width) * spanOf(vp) : vp.startMs;
}

const TICK_STEPS_MS = [1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000];

// Round-number ticks (0:10, 0:20 ...) inside the viewport, about `target` of
// them. Every chart uses the same ones.
export function timeTicks(vp: Viewport, target = 5): number[] {
  const span = spanOf(vp);
  if (span <= 0) return [];
  const step = TICK_STEPS_MS.find((s) => span / s <= target) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  const first = Math.ceil(vp.startMs / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= vp.endMs + 1; t += step) ticks.push(t);
  return ticks;
}

export const clock = formatClock;

// --- Series ---

// One value per bucket; null is a gap (a pause, or a stretch without a clear
// pitch), drawn as a gap and never as zero.
export interface Series {
  // Bucket start times.
  tMs: number[];
  v: (number | null)[];
  bucketMs: number;
}

export interface Point {
  x: number;
  y: number;
}

// The visible parts of a series as separate runs of points: a gap ends a
// run. A bucket is drawn at its middle. Points just outside the viewport are
// kept so a line runs off the edge instead of stopping short of it.
export function seriesRuns(series: Series, vp: Viewport, width: number, yOf: (value: number) => number): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  const half = series.bucketMs / 2;
  for (let i = 0; i < series.tMs.length; i++) {
    const value = series.v[i];
    const mid = series.tMs[i] + half;
    const outside = mid < vp.startMs - series.bucketMs || mid > vp.endMs + series.bucketMs;
    if (value == null || outside) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push({ x: xOfMs(mid, vp, width), y: yOf(value) });
  }
  if (run.length) runs.push(run);
  return runs;
}

// A run as an SVG path. A single point (a lone voiced bucket) becomes a
// short flat stroke so it still shows.
export function runPath(run: Point[], dotWidth = 2): string {
  if (!run.length) return "";
  if (run.length === 1) return `M${run[0].x.toFixed(1)} ${run[0].y.toFixed(1)}h${dotWidth}`;
  return "M" + run.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L");
}

// The run closed down to the baseline, for a filled area.
export function areaPath(run: Point[], baselineY: number): string {
  if (run.length < 2) return "";
  const last = run[run.length - 1];
  return `${runPath(run)}L${last.x.toFixed(1)} ${baselineY.toFixed(1)}L${run[0].x.toFixed(1)} ${baselineY.toFixed(1)}Z`;
}

// The value of the bucket holding `ms`, or null in a gap or off the ends.
export function valueAtMs(series: Series, ms: number): number | null {
  if (!series.tMs.length || ms < 0) return null;
  const i = Math.floor(ms / series.bucketMs);
  if (i < 0 || i >= series.v.length) return null;
  return series.v[i];
}

// The share of buckets that hold a value, for the "how much of this chart is
// real" line.
export function filledShare(series: Series): number {
  if (!series.v.length) return 0;
  return series.v.filter((x) => x != null).length / series.v.length;
}
