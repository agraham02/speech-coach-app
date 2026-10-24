import { summarizeVolume, type VolumeReading } from "../dsp/volumePauses";

// What a Rewind take shows about itself — only things that can be counted
// from what you said. Never how well you said it, and never a score. Pure.

export const MIN_REWIND_SECONDS = 60;
export const MAX_REWIND_SECONDS = 120;
// Pauses at least this long count as a pause worth mentioning.
export const LONG_PAUSE_MS = 3000;

export type DayPart = "morning" | "midday" | "evening";

export interface Coverage {
  morning: boolean;
  midday: boolean;
  evening: boolean;
}

export interface Details {
  numbers: number;
  times: number;
  names: number;
  senses: number;
  total: number;
}

export interface RewindStats {
  seconds: number;
  words: number;
  coverage: Coverage;
  details: Details;
  longestPauseSeconds: number | null;
  longPauses: number;
}

const WORDS: Record<DayPart, string[]> = {
  morning: ["morning", "woke", "wake", "woken", "alarm", "breakfast", "coffee", "tea", "shower", "commute", "sunrise", "got up", "out of bed", "before work", "brushed"],
  // A day at work or school is the middle of the day for most people.
  midday: ["lunch", "afternoon", "noon", "midday", "midafternoon", "after lunch", "in the middle of the day", "office", "meeting", "meetings", "at work", "left work", "class", "classes", "errands"],
  evening: ["evening", "tonight", "dinner", "supper", "after work", "night", "bedtime", "got home", "on my way home", "this evening", "later on", "winding down", "drove home", "came home", "headed home", "in bed", "to bed", "nap"],
};

const SENSES = [
  "loud", "quiet", "noisy", "bright", "dark", "warm", "cold", "hot", "cool", "rain", "raining", "sunny", "cloudy", "smell", "smelled", "smelt", "taste", "tasted",
  "sounded", "noise", "soft", "heavy", "crowded", "silent", "fresh", "sweet", "bitter", "spicy",
];

const NUMBER_WORDS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "hundred", "thousand", "half", "dozen"];

const lower = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9:' ]+/g, " ").replace(/\s+/g, " ")} `;

// A time said as "8 am", "8:30 pm": the part of the day it points to.
function timesMentioned(text: string): { count: number; parts: DayPart[] } {
  const parts: DayPart[] = [];
  let count = 0;
  const pattern = /\b(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?![a-z])/gi;
  for (const match of text.matchAll(pattern)) {
    count += 1;
    let hour = Number(match[1]) % 12;
    if (/^p/i.test(match[3])) hour += 12;
    parts.push(hour < 12 ? "morning" : hour < 17 ? "midday" : "evening");
  }
  return { count, parts };
}

// Which parts of the day you talked about, from what you said.
export function dayCoverage(text: string): Coverage {
  const t = lower(text);
  const coverage: Coverage = { morning: false, midday: false, evening: false };
  (Object.keys(WORDS) as DayPart[]).forEach((part) => {
    coverage[part] = WORDS[part].some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `) || t.includes(` ${w}ed `));
  });
  for (const part of timesMentioned(text).parts) coverage[part] = true;
  return coverage;
}

// Concrete things — numbers, times, names, what you could see, hear, smell
// or taste. Names need capitals, so they're only counted when the transcript
// has them (on-device Whisper does; the live fallback is all lower case).
export function countDetails(text: string): Details {
  const times = timesMentioned(text).count;
  const t = lower(text);
  const digitNumbers = (text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).length - times;
  const wordNumbers = NUMBER_WORDS.filter((w) => t.includes(` ${w} `)).length;
  const senses = SENSES.filter((w) => t.includes(` ${w} `)).length;

  let names = 0;
  const tokens = text.split(/\s+/);
  let atStart = true;
  for (const raw of tokens) {
    const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, "");
    if (word && /^[A-Z][a-z]+/.test(word) && word !== "I" && !/^I['’]/.test(word) && !atStart) names += 1;
    atStart = /[.!?]["')]*$/.test(raw);
  }

  const numbers = Math.max(0, digitNumbers) + wordNumbers;
  return { numbers, times, names, senses, total: numbers + times + names + senses };
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function rewindStats(input: { transcript: string; seconds: number; volume: VolumeReading[] }): RewindStats {
  const summary = summarizeVolume(input.volume, LONG_PAUSE_MS);
  const longest = summary.pauses.reduce((max, p) => Math.max(max, p.durationMs), 0);
  return {
    seconds: Math.round(input.seconds),
    words: wordCount(input.transcript),
    coverage: dayCoverage(input.transcript),
    details: countDetails(input.transcript),
    longestPauseSeconds: longest > 0 ? Math.round(longest / 100) / 10 : null,
    longPauses: summary.pauses.length,
  };
}

// How many parts of the day came up, 0 to 3.
export const partsCovered = (c: Coverage): number => Number(c.morning) + Number(c.midday) + Number(c.evening);

// Where in the recording the cue ("Morning · Midday · Evening") points: a
// gentle guide, a third of the way each.
export function cueForSeconds(elapsed: number, total = MAX_REWIND_SECONDS): DayPart {
  const share = elapsed / total;
  return share < 1 / 3 ? "morning" : share < 2 / 3 ? "midday" : "evening";
}
