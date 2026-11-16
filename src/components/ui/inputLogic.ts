// The thinking behind the shared input controls, kept free of React so it can
// be tested on its own (task 8.2).

// ---------- Days ----------

// Day numbers follow Date.getDay(): 0 is Sunday. The picker shows Monday first.
export const DAYS_MONDAY_FIRST: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

export const DAY_NAMES: readonly string[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_INITIALS: readonly string[] = ["S", "M", "T", "W", "T", "F", "S"];

function isDay(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 6;
}

// Valid, unique day numbers in ascending order (0 to 6).
export function normalizeDays(days: readonly number[]): number[] {
  return Array.from(new Set(days.filter(isDay))).sort((a, b) => a - b);
}

// Switch one day on or off. The last day left on can't be switched off: a
// plan with no days isn't a plan, so the selection is returned unchanged.
export function toggleDay(selected: readonly number[], day: number): number[] {
  const current = normalizeDays(selected);
  if (!isDay(day)) return current;
  if (current.includes(day)) return current.length <= 1 ? current : current.filter((d) => d !== day);
  return normalizeDays([...current, day]);
}

// The selection a shortcut sets; days is never empty.
export function shortcutDays(shortcut: "every" | "weekdays"): number[] {
  return shortcut === "every" ? [...EVERY_DAY] : [...WEEKDAYS];
}

export function sameDays(a: readonly number[], b: readonly number[]): boolean {
  const x = normalizeDays(a);
  const y = normalizeDays(b);
  return x.length === y.length && x.every((d, i) => d === y[i]);
}

// ---------- Rating ----------

export function clampStop(n: number, max = 5): number {
  return Math.min(max, Math.max(1, Math.round(n)));
}

// What a screen reader's increment or decrement does. From "not rated",
// increment lands on the first stop and decrement does nothing (no stop is
// "below" nothing, and presetting a middle value would anchor the answer).
// Returns null when there is nothing to change.
export function stepRating(value: number | null, direction: 1 | -1, max = 5): number | null {
  if (value == null) return direction === 1 ? 1 : null;
  const next = clampStop(value + direction, max);
  return next === clampStop(value, max) ? null : next;
}

export function ratingValueText(value: number | null, max = 5): string {
  return value == null ? "Not rated" : `${clampStop(value, max)} out of ${max}`;
}

// ---------- Compare track ----------

export type MarkerKey = "felt" | "after" | "measured";

export const MARKER_LABELS: Record<MarkerKey, string> = { felt: "You", after: "After", measured: "Measured" };

// Where a 1-to-5 value sits along the track, 0 (left end) to 1 (right end).
// Fractions are fine; values outside the scale pin to the ends.
export function markerPosition(value: number, min = 1, max = 5): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

// Whole numbers print plain, fractions to one place (3.6), never "3.0".
export function formatScore(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface CompareValues {
  felt?: number | null;
  after?: number | null;
  measured?: number | null;
}

// "You felt 3, after watching 4, measured 3.6 out of 5". Parts that are
// missing are left out; with none it says so.
export function compareSentence({ felt, after, measured }: CompareValues, max = 5): string {
  const parts: string[] = [];
  if (felt != null) parts.push(`You felt ${formatScore(felt)}`);
  if (after != null) parts.push(`${parts.length ? "after" : "After"} watching ${formatScore(after)}`);
  if (measured != null) parts.push(`${parts.length ? "measured" : "Measured"} ${formatScore(measured)}`);
  if (parts.length === 0) return "No ratings yet";
  return `${parts.join(", ")} out of ${max}`;
}

export interface PlacedMarker {
  key: MarkerKey;
  value: number;
  position: number;
  // Which side of the line its label sits on, so close markers don't print
  // their labels on top of each other.
  side: "above" | "below";
  // The names its label shows: its own, plus any marker too close to label
  // on either side (a tie reads "You · Measured"). Empty when it joined
  // another marker's label.
  names: MarkerKey[];
}

// Markers in felt, after, measured order, placed along the track. A label
// goes above its marker unless another label above is closer than `minGap`
// (a fraction of the track); then it goes below, and if both sides are
// crowded it takes the side with more room.
export function placeMarkers(values: CompareValues, min = 1, max = 5, minGap = 0.22): PlacedMarker[] {
  const order: MarkerKey[] = ["felt", "after", "measured"];
  const present = order.flatMap((key) => {
    const value = values[key];
    return value == null ? [] : [{ key, value, position: markerPosition(value, min, max) }];
  });
  const taken: Record<"above" | "below", { key: MarkerKey; position: number }[]> = { above: [], below: [] };
  const room = (side: "above" | "below", position: number) => Math.min(Infinity, ...taken[side].map((t) => Math.abs(t.position - position)));
  const sides = new Map<MarkerKey, "above" | "below">();
  const names = new Map<MarkerKey, MarkerKey[]>();
  // Place left to right so the crowding is judged in reading order.
  for (const m of [...present].sort((a, b) => a.position - b.position)) {
    const above = room("above", m.position);
    const below = room("below", m.position);
    if (above >= minGap || below >= minGap) {
      const side = above >= minGap ? "above" : "below";
      taken[side].push(m);
      sides.set(m.key, side);
      names.set(m.key, [m.key]);
      continue;
    }
    // No room either side: join the nearest label instead of printing over it.
    const nearest = [...taken.above, ...taken.below].sort((a, b) => Math.abs(a.position - m.position) - Math.abs(b.position - m.position))[0];
    sides.set(m.key, sides.get(nearest.key)!);
    names.get(nearest.key)!.push(m.key);
    names.set(m.key, []);
  }
  return present.map((m) => ({ ...m, side: sides.get(m.key)!, names: names.get(m.key)! }));
}

// ---------- Checklist and filter chips ----------

// Switch a key on or off, keeping the list in the order of `order`.
export function toggleKey(selected: readonly string[], key: string, order: readonly string[]): string[] {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return order.filter((k) => next.has(k));
}

// The selection after tapping a filter chip. Multi: toggles. Single: replaces,
// and tapping the chosen chip again keeps it unless `allowClear`.
export function nextFilterSelection(selected: readonly string[], key: string, order: readonly string[], multiple: boolean, allowClear = false): string[] {
  if (multiple) return toggleKey(selected, key, order);
  if (selected.includes(key)) return allowClear ? [] : [key];
  return [key];
}

// ---------- Segmented control ----------

export interface SegmentIndicator {
  // The thumb's width, and how far it sits from the start edge (the left edge
  // in left-to-right, the right edge in right-to-left), in the track's inner
  // space.
  width: number;
  offset: number;
}

// Where the thumb goes, from the segments' measured widths. Measuring each
// segment (rather than dividing the track evenly) keeps it right for any
// count and when text scale changes the widths. Returns null until the
// selected segment and all before it have been measured.
export function segmentIndicator(widths: readonly (number | undefined)[], index: number): SegmentIndicator | null {
  if (index < 0 || index >= widths.length) return null;
  let offset = 0;
  for (let i = 0; i < index; i++) {
    const w = widths[i];
    if (!w) return null;
    offset += w;
  }
  const width = widths[index];
  return width ? { width, offset } : null;
}

// The horizontal translation for a thumb pinned to the start edge: positive
// is to the right, so right-to-left runs the other way.
export function indicatorTranslateX(indicator: SegmentIndicator, rtl: boolean): number {
  return rtl ? -indicator.offset : indicator.offset;
}

// ---------- Value row ----------

// At the largest text sizes the value drops under the label instead of
// squeezing it.
export function stacksValue(fontScale: number): boolean {
  return fontScale >= 1.5;
}
