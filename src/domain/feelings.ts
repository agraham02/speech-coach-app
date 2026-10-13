import { dateFromISODate, daysBetween, isoDateFromDate } from "../utils/dateUtils";

// Feeling of the Week: one emotion from the wheel each week (Parrott's six
// primaries), talked about on camera for a minute or two — a real time you
// felt it, in as much detail as you can. Putting feelings into words is the
// practice; nothing about the story is scored. Pure.

export type EmotionId = "joy" | "love" | "surprise" | "sadness" | "fear" | "anger";

export interface Emotion {
  id: EmotionId;
  label: string;
  // Secondary emotions from the wheel, each with finer words to reach for.
  ladder: { word: string; finer: string[] }[];
}

// Parrott (2001), trimmed to everyday words.
export const EMOTIONS: Emotion[] = [
  {
    id: "joy",
    label: "Joy",
    ladder: [
      { word: "cheerful", finer: ["delighted", "glad", "happy", "amused", "elated"] },
      { word: "excited", finer: ["enthusiastic", "thrilled", "eager", "exhilarated"] },
      { word: "content", finer: ["satisfied", "peaceful", "at ease"] },
      { word: "proud", finer: ["triumphant", "accomplished"] },
      { word: "hopeful", finer: ["optimistic", "encouraged"] },
      { word: "relieved", finer: ["unburdened", "lighter"] },
    ],
  },
  {
    id: "love",
    label: "Love",
    ladder: [
      { word: "affection", finer: ["fondness", "tenderness", "warmth", "caring"] },
      { word: "compassion", finer: ["sympathy", "kindness"] },
      { word: "longing", finer: ["missing someone", "yearning", "nostalgia"] },
      { word: "attraction", finer: ["infatuation", "desire", "admiration"] },
      { word: "gratitude", finer: ["thankful", "appreciated"] },
    ],
  },
  {
    id: "surprise",
    label: "Surprise",
    ladder: [
      { word: "amazed", finer: ["astonished", "awed", "stunned"] },
      { word: "shocked", finer: ["startled", "speechless", "thrown"] },
      { word: "confused", finer: ["bewildered", "disoriented"] },
    ],
  },
  {
    id: "sadness",
    label: "Sadness",
    ladder: [
      { word: "hurt", finer: ["wounded", "anguished"] },
      { word: "disappointed", finer: ["let down", "discouraged", "dismayed"] },
      { word: "lonely", finer: ["isolated", "left out", "homesick", "rejected"] },
      { word: "ashamed", finer: ["guilty", "regretful", "embarrassed", "humiliated"] },
      { word: "grief", finer: ["sorrow", "heartbroken", "mournful"] },
      { word: "low", finer: ["gloomy", "hopeless", "defeated"] },
    ],
  },
  {
    id: "fear",
    label: "Fear",
    ladder: [
      { word: "nervous", finer: ["anxious", "uneasy", "tense", "jittery"] },
      { word: "worried", finer: ["apprehensive", "dread", "on edge"] },
      { word: "scared", finer: ["frightened", "terrified", "panicked"] },
      { word: "insecure", finer: ["inadequate", "exposed", "self-conscious"] },
    ],
  },
  {
    id: "anger",
    label: "Anger",
    ladder: [
      { word: "irritated", finer: ["annoyed", "aggravated", "grumpy"] },
      { word: "frustrated", finer: ["exasperated", "stuck", "fed up"] },
      { word: "resentful", finer: ["bitter", "indignant", "wronged"] },
      { word: "jealous", finer: ["envious", "threatened"] },
      { word: "disgusted", finer: ["repulsed", "contemptuous"] },
      { word: "furious", finer: ["outraged", "livid", "enraged"] },
    ],
  },
];

export function getEmotion(id: EmotionId): Emotion {
  return EMOTIONS.find((e) => e.id === id) ?? EMOTIONS[0];
}

// A different angle for each rep in the same week.
export const ANGLES: { title: (label: string) => string; prompt: (label: string) => string }[] = [
  { title: (l) => `A time you felt ${l.toLowerCase()}`, prompt: (l) => `Talk about a time you felt ${l.toLowerCase()}.` },
  { title: (l) => `A small moment of ${l.toLowerCase()}`, prompt: (l) => `Talk about a small, everyday moment of ${l.toLowerCase()} — recent, ordinary, real.` },
  { title: (l) => `How ${l.toLowerCase()} shows up in you`, prompt: (l) => `Describe how ${l.toLowerCase()} shows up in you — your body, your voice, your face, what you do.` },
  { title: () => "What you wish you'd said", prompt: (l) => `Think of a time you felt ${l.toLowerCase()}. What do you wish you'd said or done then?` },
];

// Shown during prep, hidden while you talk.
export const DETAIL_PROMPTS = [
  "Where were you?",
  "Who was there?",
  "What did you see or hear?",
  "What did it feel like in your body?",
  "What was the thought in your head?",
  "When did it peak?",
  "What changed after?",
];

export const GUARDRAIL =
  "Pick a memory you can talk about without being swept back into it. It doesn't have to be the biggest one.";

export const RULES = ["Be honest.", "Be vulnerable.", "Be real with the feeling."];

// --- weekly rotation ---------------------------------------------------------

const ROTATION: EmotionId[] = ["joy", "love", "surprise", "sadness", "fear", "anger"];

// The local-date Monday that starts the week containing `date` (YYYY-MM-DD).
export function weekStart(date: string): string {
  const d = dateFromISODate(date);
  const dayFromMonday = (d.getDay() + 6) % 7;
  return isoDateFromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayFromMonday));
}

// The rotation starts on Joy in your first week — a gentle way in — and
// moves one emotion along each week after.
export function rotationEmotion(firstWeek: string, week: string): EmotionId {
  const weeks = Math.round(daysBetween(dateFromISODate(firstWeek), dateFromISODate(week)) / 7);
  return ROTATION[((weeks % ROTATION.length) + ROTATION.length) % ROTATION.length];
}

// --- what's measured (process only) -------------------------------------------

const EXTRA_FORMS: Record<string, string[]> = {
  happy: ["happiness"],
  sad: ["sadness"],
  angry: ["anger", "mad"],
  afraid: ["fear", "scared"],
  anxious: ["anxiety"],
  overwhelmed: [],
  calm: [],
  grateful: ["gratitude"],
  lonely: ["loneliness"],
  proud: ["pride"],
  embarrassed: ["embarrassment"],
  ashamed: ["shame"],
  guilty: ["guilt"],
  jealous: ["jealousy"],
  hopeful: ["hope"],
  excited: ["excitement"],
  frustrated: ["frustration"],
  disappointed: ["disappointment"],
  relieved: ["relief"],
  upset: [],
  nervous: ["nerves"],
  terrified: ["terror"],
  worried: ["worry"],
  joy: ["joyful"],
  love: ["loved", "loving"],
  surprised: ["surprise"],
  shocked: ["shock"],
  heartbroken: ["heartbreak"],
  numb: [],
  peaceful: ["peace"],
  awkward: [],
};

function feelingLexicon(): Map<string, string> {
  const words = new Map<string, string>();
  const add = (canonical: string, form = canonical) => words.set(form.toLowerCase(), canonical.toLowerCase());
  for (const e of EMOTIONS) {
    add(e.label);
    for (const rung of e.ladder) {
      add(rung.word);
      rung.finer.forEach((f) => add(f));
    }
  }
  for (const [canonical, forms] of Object.entries(EXTRA_FORMS)) {
    add(canonical);
    forms.forEach((f) => add(canonical, f));
  }
  return words;
}

let lexicon: Map<string, string> | null = null;

// Feeling words you actually used, in the order you first said them — shown
// back as a celebration, never as a score.
export function feelingWordsUsed(transcript: string): string[] {
  lexicon ??= feelingLexicon();
  const text = ` ${transcript.toLowerCase().replace(/[^a-z' -]/g, " ").replace(/\s+/g, " ")} `;
  const found: { at: number; word: string }[] = [];
  for (const [form, canonical] of lexicon) {
    const at = text.indexOf(` ${form} `);
    if (at >= 0 && !found.some((f) => f.word === canonical)) found.push({ at, word: canonical });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.word);
}

export const MIN_FEELING_SECONDS = 45;
