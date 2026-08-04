// Script Practice mode: a fixed script the user reads aloud, with optional
// on-screen delivery cues (pitch/volume/pause/emphasis) surfaced as the
// teleprompter scrolls past them.

export type CueType =
  | "pitch_up"
  | "pitch_down"
  | "volume_up"
  | "volume_down"
  | "pause"
  | "emphasis"
  | "slow_down";

export interface ScriptCue {
  // 0-based index into script.text.trim().split(/\s+/) — i.e. the Nth
  // whitespace-separated token, punctuation attached (e.g. "half." is one
  // token). Word-indexed rather than line-indexed because line wrapping
  // depends on device width/font size at runtime, but word position in the
  // source text is fixed.
  wordIndex: number;
  type: CueType;
  // Short instruction shown on screen at this cue, e.g. "Inflect up — it's a
  // rhetorical question."
  label: string;
}

export interface Script {
  id: string;
  title: string;
  category: string;
  text: string;
  wordCount: number;
  // Derived from wordCount at ~130 wpm (matches the app's existing 1-5 minute
  // recording range), rounded to the nearest 5 seconds.
  targetDurationSeconds: number;
  cues: ScriptCue[];
}

// The single tokenization rule every cue's wordIndex is defined against —
// shared so the teleprompter (positioning cues on screen) and the Gemini
// grading prompt (describing cues in words the model can locate) never drift
// out of sync with each other.
export function tokenizeScript(text: string): string[] {
  return text.trim().split(/\s+/);
}
