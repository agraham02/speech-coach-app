import type { Mark, MarkLevel } from "./cadence/marks";

// A full speech read aloud (the Speeches shelf of Mark It Up, formerly
// Script Practice), with delivery marks — see domain/cadence/marks.ts and
// content/speeches.ts.

export interface Script {
  id: string;
  title: string;
  category: string;
  text: string;
  wordCount: number;
  // Derived from wordCount at ~130 wpm — a guide, not a limit: reading with
  // the pauses the marks ask for runs longer.
  targetDurationSeconds: number;
  marks: Mark[];
}

export type { MarkLevel };

// The single tokenization rule every mark's word index is defined against —
// shared so the teleprompter and the Gemini grading prompt never drift out
// of sync with each other.
export function tokenizeScript(text: string): string[] {
  return text.trim().split(/\s+/);
}
