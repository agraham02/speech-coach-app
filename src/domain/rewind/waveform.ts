// How the live waveform looks while you tell your day. The recognizer's
// volume meter reads -2..10 (anything at or below 0 is inaudible); this turns
// readings into bar heights and keeps the scrolling window of bars. Pure.

// Bars across the screen.
export const BAR_COUNT = 56;
// A silent moment still draws a hairline, so the line never vanishes.
export const MIN_BAR = 0.04;

// Volume reading -> bar height, 0..1. Quiet speech should still show, so the
// curve lifts the low end.
export function barForVolume(value: number): number {
  if (!(value > 0)) return MIN_BAR;
  const level = Math.min(1, value / 9);
  return Math.max(MIN_BAR, Math.pow(level, 0.6));
}

// Smooths from the last bar toward the new reading: rises quickly, falls more
// slowly, like a level meter, so the line reads as speech and not jitter.
export function smoothBar(previous: number, target: number): number {
  const rate = target > previous ? 0.6 : 0.25;
  return previous + (target - previous) * rate;
}

// The window of bars after a new one arrives: oldest dropped, newest last.
export function pushBar(bars: number[], bar: number, count = BAR_COUNT): number[] {
  const next = bars.length >= count ? bars.slice(bars.length - count + 1) : [...bars];
  next.push(bar);
  while (next.length < count) next.unshift(MIN_BAR);
  return next;
}

export const emptyBars = (count = BAR_COUNT): number[] => Array.from({ length: count }, () => MIN_BAR);
