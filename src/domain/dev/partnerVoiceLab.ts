import { percentiles } from "../conversation/live/stream";

// The Dev tab's Partner voices lab: one row per line played, and the table
// it shows (time to the words, to the first sound, per voice). Pure.

export interface LabRun {
  at: string;
  // "speak" (a line spoken), "turn" (a partner turn written and spoken), or
  // "device" (the phone's own voice, for comparison).
  kind: "speak" | "turn" | "device";
  voice: string;
  speed: number;
  session: "conversation" | "playback";
  line: string;
  // From tapping to the event, measured on the phone.
  toLineMs: number | null;
  toFirstSoundMs: number | null;
  totalMs: number | null;
  // What the server said it took.
  server: { llmMs: number | null; ttsFirstAudioMs: number | null; totalMs: number } | null;
  audioSeconds: number | null;
  streamed: boolean | null;
  error?: string;
}

export interface LabVoiceRow {
  voice: string;
  runs: number;
  firstSoundMedianMs: number | null;
  firstSoundP90Ms: number | null;
  turnFirstSoundMedianMs: number | null;
  rating: number | null;
}

export const LAB_HISTORY_KEY = "partnerVoiceLab.runs";
export const LAB_RATINGS_KEY = "partnerVoiceLab.ratings";
export const LAB_MAX_RUNS = 400;

export function addRun(history: LabRun[], run: LabRun): LabRun[] {
  return [run, ...history].slice(0, LAB_MAX_RUNS);
}

export function labTable(history: LabRun[], ratings: Record<string, number>): LabVoiceRow[] {
  const voices = [...new Set(history.map((r) => r.voice))];
  for (const v of Object.keys(ratings)) if (!voices.includes(v)) voices.push(v);
  return voices
    .map((voice) => {
      const ok = history.filter((r) => r.voice === voice && !r.error);
      const spoken = percentiles(ok.filter((r) => r.kind === "speak" || r.kind === "device").map((r) => r.toFirstSoundMs ?? NaN));
      const turns = percentiles(ok.filter((r) => r.kind === "turn").map((r) => r.toFirstSoundMs ?? NaN));
      return {
        voice,
        runs: ok.length,
        firstSoundMedianMs: spoken.median,
        firstSoundP90Ms: spoken.p90,
        turnFirstSoundMedianMs: turns.median,
        rating: ratings[voice] ?? null,
      };
    })
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.voice.localeCompare(b.voice));
}

// The lines the lab plays: everyday partner lines in three moods, so a voice
// is heard warm, curious and amused, as in a real conversation.
export const LAB_LINES: { text: string; mood: string }[] = [
  { text: "I just got back from a week in Portugal. Honestly, the food was unreal.", mood: "warm" },
  { text: "Wait, really? How did you end up doing that?", mood: "curious" },
  { text: "Okay, I have to admit, I set three alarms this morning and slept through every single one.", mood: "amused" },
];

// A fixed partner turn for timing the whole cascade (the line written, then
// spoken), with no mic: the turn the device test plan repeats 20 times.
export const LAB_TURN = {
  scene: {
    setting: "At work, by the coffee machine, on an ordinary weekday",
    partner: { name: "Alex", role: "a coworker from another team you know a little" },
    opener: "I just got back from a week in Portugal. The food was unreal.",
  },
  focus: "thread" as const,
  level: 1 as const,
  history: [
    { who: "partner" as const, text: "I just got back from a week in Portugal. The food was unreal." },
    { who: "you" as const, text: "oh nice what was the best thing you ate" },
  ],
  turnsLeft: 3,
  stutterMode: false,
};
