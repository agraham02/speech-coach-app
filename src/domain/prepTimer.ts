import type { PrepNote } from "./promptTask";

// The prep and research clock. It runs against a deadline on the wall clock,
// not a counter ticking once a second: research happens in another app (a web
// search) and a counter would freeze there, so coming back would show the
// time you had when you left. Pure.

export const PREP_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 30, label: "30 s" },
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
  { seconds: 300, label: "5 min" },
];

// Research is for a topic you don't know: it starts at a minute and tops out
// at five, past which it stops being impromptu.
export const RESEARCH_MIN_SECONDS = 60;
export const RESEARCH_MAX_SECONDS = 300;
export const EXTEND_SECONDS = 30;
// A take with research behind it still counts, but less toward the impromptu
// skill: it was prepared, not spoken cold.
export const RESEARCH_IMPROMPTU_WEIGHT = 0.6;
// Prep shorter than this wasn't prep: a tap on "Start now" right away.
const MIN_COUNTED_PREP_SECONDS = 5;

export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function deadlineFor(nowMs: number, seconds: number): number {
  return nowMs + seconds * 1000;
}

// More time, never past five minutes from now.
export function extendDeadline(deadlineMs: number, nowMs: number, seconds: number = EXTEND_SECONDS): number {
  const base = Math.max(deadlineMs, nowMs);
  return Math.min(base + seconds * 1000, nowMs + RESEARCH_MAX_SECONDS * 1000);
}

// Switching to research makes sure there's a real window to work in.
export function startResearch(deadlineMs: number, nowMs: number): number {
  return Math.max(deadlineMs, nowMs + RESEARCH_MIN_SECONDS * 1000);
}

export function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// What counted as preparation, for the reviewer and your history. A take
// started within seconds of the countdown opening had none.
export function prepUsedFrom(args: {
  startedMs: number | null;
  endedMs: number;
  researched: boolean;
  notes?: string;
  searched?: boolean;
  notesOnScreen?: boolean;
}): PrepNote {
  const elapsed = args.startedMs == null ? 0 : Math.round((args.endedMs - args.startedMs) / 1000);
  const seconds = elapsed < MIN_COUNTED_PREP_SECONDS ? 0 : elapsed;
  const notes = args.notes?.trim();
  return {
    seconds,
    researched: args.researched && seconds > 0,
    ...(notes ? { notes } : {}),
    ...(args.searched ? { searched: true } : {}),
    ...(args.notesOnScreen && notes ? { notesOnScreen: true } : {}),
  };
}

// Topics where looking something up first is worth a minute. Explain and
// Debate prompts lean on facts or examples you might not have to hand.
export function researchHelps(prompt: { category: string }): boolean {
  return prompt.category === "Explain" || prompt.category === "Debate";
}

// The search a "Search the web" button opens: the prompt itself, minus the
// framing that isn't a search term.
export function searchUrl(promptText: string): string {
  const query = promptText
    .replace(/^(closing|opening) only:\s*/i, "")
    .replace(/\bmake up the details\.?/i, "")
    .trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
