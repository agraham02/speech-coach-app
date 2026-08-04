export type CueType =
  | "pitch_up"
  | "pitch_down"
  | "volume_up"
  | "volume_down"
  | "pause"
  | "emphasis"
  | "slow_down";

export interface ScriptCue {
  wordIndex: number;
  type: CueType;
  label: string;
}

export interface Script {
  id: string;
  title: string;
  category: string;
  text: string;
  wordCount: number;
  targetDurationSeconds: number;
  cues: ScriptCue[];
}

// Same content as the RN app's src/data/scripts.json (s01), so the prototype
// is testing against real script text/cue density, not lorem ipsum.
export const SAMPLE_SCRIPT: Script = {
  id: "s01",
  title: "The Sixty-Second Fix",
  category: "Pitch",
  text: "Thirty seconds. That's about how long I have before you check your phone, so let's not waste it. My name is [Name], and I build software that gives small business owners back their evenings.\n\nThe average shop owner spends eleven hours a week on scheduling, invoicing, and chasing no-shows. Eleven hours. That's almost a full extra workday, gone, every single week.\n\nWe built a tool that does all of it automatically — booking, reminders, payments — in one place. No spreadsheets. No 11pm panic texts to yourself.\n\nIn the first three months, our early users got an average of nine hours back. Nine hours. Think about what you'd do with an extra morning every week.\n\nThat's the whole pitch. Can I show you how it works?",
  wordCount: 126,
  targetDurationSeconds: 60,
  cues: [
    { wordIndex: 49, type: "emphasis", label: "Standalone repeat — let it land" },
    { wordIndex: 102, type: "emphasis", label: "Second number — echo the first beat" },
    { wordIndex: 119, type: "pitch_up", label: "Genuine question — look up, inflect up" },
  ],
};

export function tokenizeScript(text: string): string[] {
  return text.trim().split(/\s+/);
}
