// The pure sizing, state and accessibility-sentence logic behind the display
// components in this folder (bands, sentence headline, big number, capsules,
// ladder, accordion, week strip). No React or React Native in here, so it can
// be unit tested without rendering. Numbers come from the redesign canvas CSS
// (px read as dp).

// ---------------------------------------------------------------- Bands

export type BandState = "default" | "done" | "locked";
export type BandPosition = "first" | "middle" | "last" | "only";

export function bandPosition(index: number, count: number): BandPosition {
  if (count <= 1) return "only";
  if (index <= 0) return "first";
  if (index >= count - 1) return "last";
  return "middle";
}

// Tints cycle through the palette's bands in order unless one is given.
export function bandTint(index: number, tints: readonly string[], override?: string): string {
  if (override) return override;
  if (tints.length === 0) return "transparent";
  const i = ((index % tints.length) + tints.length) % tints.length;
  return tints[i];
}

export interface BandBox {
  paddingTop: number;
  paddingBottom: number;
  marginTop: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
}

export const BAND_RADIUS = 22;
export const BAND_OVERLAP = 14;

// `.band{padding:13px 18px 27px;margin-top:-14px;radius:22px 22px 0 0}`; the
// first band has no overlap, the last is fully rounded with a short bottom; a
// done band is tighter (9 / 23); a big band holds children (16 / 30).
export function bandBox(position: BandPosition, state: BandState, big: boolean): BandBox {
  const first = position === "first" || position === "only";
  const last = position === "last" || position === "only";
  const top = big ? 16 : state === "done" ? 9 : 13;
  const bottom = last ? 15 : big ? 30 : state === "done" ? 23 : 27;
  return {
    paddingTop: top,
    paddingBottom: bottom,
    marginTop: first ? 0 : -BAND_OVERLAP,
    borderTopLeftRadius: BAND_RADIUS,
    borderTopRightRadius: BAND_RADIUS,
    borderBottomLeftRadius: last ? BAND_RADIUS : 0,
    borderBottomRightRadius: last ? BAND_RADIUS : 0,
  };
}

// What a screen reader says for a band that has no children of its own.
export function bandLabel(parts: { number?: string | number; title?: string; subtitle?: string; meta?: string; state?: BandState }): string {
  const stateWord = parts.state === "done" ? "done" : parts.state === "locked" ? "locked" : undefined;
  return [parts.number !== undefined ? String(parts.number) : undefined, parts.title, parts.subtitle, parts.meta, stateWord]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(", ");
}

// ------------------------------------------------------ Sentence headline

export type SaySize = "l" | "m" | "s";

// 34/38 by default; m 27/31 and s 22/27 for tighter places.
export const SAY_SIZES: Record<SaySize, { fontSize: number; lineHeight: number; letterSpacing: number }> = {
  l: { fontSize: 34, lineHeight: 38, letterSpacing: -0.9 },
  m: { fontSize: 27, lineHeight: 31, letterSpacing: -0.6 },
  s: { fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
};

export interface SaySegment {
  text: string;
  // Same weight as the rest, but in full ink.
  strong?: boolean;
  // A tappable phrase: full ink, dotted brand underline.
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const SAY_DEFAULT_HINT = "Double tap to change";

// Quiet by default; strong and tappable parts are in full ink.
export function sayTone(segment: SaySegment): "muted" | "primary" {
  return segment.strong || segment.onPress ? "primary" : "muted";
}

export function sayPlainText(segments: readonly SaySegment[]): string {
  return segments.map((s) => s.text).join("");
}

// ------------------------------------------------------------- Big number

export const BIG_NUMBER_BASE = { fontSize: 52, lineHeight: 54, letterSpacing: -3.4 } as const;

// The display style scaled to another size (76, say), keeping its proportions.
export function bigNumberStyle(size: number = BIG_NUMBER_BASE.fontSize): { fontSize: number; lineHeight: number; letterSpacing: number } {
  const k = size / BIG_NUMBER_BASE.fontSize;
  return {
    fontSize: size,
    lineHeight: Math.round(BIG_NUMBER_BASE.lineHeight * k),
    letterSpacing: Math.round(BIG_NUMBER_BASE.letterSpacing * k * 10) / 10,
  };
}

// A word unit ("min", "wpm") sits a space away from the number; a symbol
// ("%", "/100") hugs it.
export function bigNumberUnitText(unit: string): string {
  return /^[\p{L}]/u.test(unit) ? ` ${unit}` : unit;
}

export function bigNumberLabel(value: string | number, unit?: string): string {
  return unit ? `${value}${bigNumberUnitText(unit)}` : String(value);
}

// --------------------------------------------------------------- Capsules

export type CapsuleState = "done" | "current" | "todo";

export interface CapsuleStep {
  minutes: number;
  state: CapsuleState;
  name?: string;
}

// Each capsule's flex grows with its minutes; a missing or zero length counts
// as one so it still shows.
export function capsuleFlexes(steps: readonly CapsuleStep[]): number[] {
  return steps.map((s) => (Number.isFinite(s.minutes) && s.minutes > 0 ? s.minutes : 1));
}

// The step the sentence names: the current one, else the next to do, else the
// last (all done).
export function capsuleCurrentIndex(steps: readonly CapsuleStep[]): number {
  const current = steps.findIndex((s) => s.state === "current");
  if (current >= 0) return current;
  const next = steps.findIndex((s) => s.state === "todo");
  if (next >= 0) return next;
  return Math.max(steps.length - 1, 0);
}

// "Step 3 of 5, Drill"
export function capsuleLabel(steps: readonly CapsuleStep[]): string {
  if (steps.length === 0) return "No steps";
  const i = capsuleCurrentIndex(steps);
  const name = steps[i].name;
  return `Step ${i + 1} of ${steps.length}${name ? `, ${name}` : ""}`;
}

// ----------------------------------------------------------------- Ladder

export type LadderState = "done" | "current" | "todo";

export const LADDER_HEIGHT = 56;

// Bars rise evenly up to the full height.
export function ladderHeights(count: number, max: number = LADDER_HEIGHT): number[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => Math.round((max * (i + 1)) / count));
}

// `current` is the 1-based stage the person is on: those before are done.
export function ladderState(index: number, current: number): LadderState {
  const stage = index + 1;
  if (stage < current) return "done";
  if (stage === current) return "current";
  return "todo";
}

// "Stage 3 of 5, Steady"
export function ladderLabel(current: number, count: number, names?: readonly string[], noun = "Stage"): string {
  if (count <= 0) return `No ${noun.toLowerCase()}s`;
  const stage = Math.min(Math.max(Math.round(current), 1), count);
  const name = names?.[stage - 1];
  return `${noun} ${stage} of ${count}${name ? `, ${name}` : ""}`;
}

// -------------------------------------------------------------- Accordion

// Open and close: height and fade ease out over the motion tokens. With
// Reduce Motion the body just shows and hides (height 0 = no animation) with
// a 150 ms fade.
export function accordionTiming(reduced: boolean, durations: { fast: number; base: number }): { height: number; fade: number } {
  return reduced ? { height: 0, fade: 150 } : { height: durations.base, fade: durations.fast };
}

// ------------------------------------------------------------- Week strip

export type WeekDayState = "full" | "part" | "frozen" | "missed" | "future";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export const WEEK_STATE_WORDS: Record<WeekDayState, string> = {
  full: "practised",
  part: "partly practised",
  frozen: "streak frozen",
  missed: "missed",
  future: "not yet",
};

// The seven days in display order; `weekStartsOn` is 0 for Sunday, 1 for
// Monday (the default).
export function weekOrder(weekStartsOn: 0 | 1 = 1): { dow: number; letter: string; name: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dow = (weekStartsOn + i) % 7;
    return { dow, letter: DAY_LETTERS[dow], name: DAY_NAMES[dow] };
  });
}

// "Tuesday, practised" / "Thursday, today, not yet"
export function weekDayLabel(name: string, state: WeekDayState, today: boolean): string {
  return `${name}, ${today ? "today, " : ""}${WEEK_STATE_WORDS[state]}`;
}

// How a day's circle is drawn, apart from colour: full is filled; part a 3dp
// ring; frozen a 2dp ring on a tint with a snowflake; missed and future a 2dp
// dashed ring.
export function weekCircle(state: WeekDayState): { filled: boolean; ringWidth: number; dashed: boolean; glyph?: "snow" } {
  switch (state) {
    case "full":
      return { filled: true, ringWidth: 0, dashed: false };
    case "part":
      return { filled: false, ringWidth: 3, dashed: false };
    case "frozen":
      return { filled: false, ringWidth: 2, dashed: false, glyph: "snow" };
    default:
      return { filled: false, ringWidth: 2, dashed: true };
  }
}
