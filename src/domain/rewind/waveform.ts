// How the live waveform looks while you tell your day. The recognizer's
// volume meter reads -2..10 (anything at or below 0 is inaudible) but only
// about every 100 ms on an iPhone, and unevenly. So the picture never moves
// when a reading arrives: it runs on its own clock, every display frame. The
// level glides toward the latest reading, and a new bar is laid down on a
// fixed beat while the row scrolls at one steady speed. Pure; the functions
// marked "worklet" run on the UI thread, every frame.

// Bars across the screen.
export const BAR_COUNT = 56;
// A new bar every beat, so the screen shows about four seconds.
export const BAR_MS = 70;
// Bars kept: the visible ones, one entering and one leaving.
export const RING = BAR_COUNT + 2;
// A silent moment still draws a hairline, so the line never vanishes.
export const MIN_BAR = 0.04;
// The level rises quickly and falls slowly, like a level meter, so the line
// reads as speech and not as jitter.
const ATTACK_MS = 45;
const RELEASE_MS = 180;
// With no reading for this long (the recognizer restarting), settle to silence.
export const STALE_MS = 400;

// Volume reading -> bar height, 0..1. Quiet speech should still show, so the
// curve lifts the low end.
export function barForVolume(value: number): number {
  "worklet";
  if (!(value > 0)) return MIN_BAR;
  const level = Math.min(1, value / 9);
  return Math.max(MIN_BAR, Math.pow(level, 0.6));
}

// Moves `current` toward `target` over `dtMs`. Exponential, so the same
// time gives the same result at 30, 60 or 120 frames a second.
export function followLevel(current: number, target: number, dtMs: number): number {
  "worklet";
  const tau = target > current ? ATTACK_MS : RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-dtMs / tau));
}

export interface WaveState {
  // A ring of bar heights (0..1); `head` is the newest.
  bars: number[];
  head: number;
  // Milliseconds since the newest bar was laid down (0..BAR_MS).
  phase: number;
  // The smoothed level the next bar is made from.
  level: number;
}

export function newWave(): WaveState {
  return { bars: Array.from({ length: RING }, () => MIN_BAR), head: 0, phase: 0, level: MIN_BAR };
}

// Advances the wave by one frame. Changes `wave` in place: it runs every
// display frame, so it doesn't allocate.
export function stepWave(wave: WaveState, target: number, dtMs: number): void {
  "worklet";
  wave.level = followLevel(wave.level, target, dtMs);
  wave.phase += dtMs;
  while (wave.phase >= BAR_MS) {
    wave.phase -= BAR_MS;
    wave.head = (wave.head + 1) % RING;
    wave.bars[wave.head] = wave.level;
  }
}

// Where the bar `age` beats old is drawn (its center). Bars enter off the
// right edge and slide left, one bar-width per beat, so the row moves at a
// constant speed and a new bar never pops into view.
export function barX(age: number, phase: number, width: number, step: number): number {
  "worklet";
  return width + step / 2 - (age + phase / BAR_MS) * step;
}
