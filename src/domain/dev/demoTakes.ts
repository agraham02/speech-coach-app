import { AUDIO_EXTRACTOR_VERSION, hysteresisGate, speechMedianDb, syllablePeaks, tagBreaths, type AudioFeatures } from "../dsp/audioFeatures";
import { percentile } from "../dsp/pitchTracker";
import { BLENDSHAPE_NAMES, expressionFromBlendshapes } from "../faceSignals";
import type { PresenceSample } from "../presenceMetrics";
import { countSyllables } from "../signals/audioSummary";
import type { SubcategoryId } from "../scoring/taxonomy";
import type { SessionType, TranscriptWord } from "../sessionTypes";

// Demo takes for the Dev tab (Dev, App tools, Add demo takes). Everything here
// is pure and made up: the words are written for this file (nobody's real
// transcript), and the "audio" and "face" are numbers drawn from a plan, not a
// recording. The seeding service (services/dev/seedDemo.ts) pushes them
// through the app's own summarizers, score sheet and pipeline stores, so a demo
// take is stored exactly like a real one and cannot drift from them.

// --- Words and their timings ---------------------------------------------------

export interface DemoSpeech {
  // Sentences in order. Fillers are written as spoken ("um,", "uh", "like").
  sentences: string[];
  // How fast the words come while talking, words a minute.
  wpm: number;
  // Silence after a sentence end, and after a comma.
  sentenceGapMs: number;
  commaGapMs: number;
  leadInMs: number;
  tailMs: number;
  // Extra mid-phrase silences: after the n-th word, this long.
  stalls?: { afterWord: number; ms: number }[];
}

export interface DemoWords {
  words: TranscriptWord[];
  durationMs: number;
  // Indices of the last word of each sentence.
  sentenceEnds: number[];
}

const HESITATION = /^(um+|uh+|er+m?|hmm+)[,.]?$/i;

export const isHesitationWord = (text: string) => HESITATION.test(text.trim());

// Deterministic jitter, so the same plan always gives the same take.
export function seededRandom(seed: number): () => number {
  let s = Math.abs(Math.round(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function buildWords(speech: DemoSpeech, seed = 1): DemoWords {
  const rand = seededRandom(seed);
  const words: TranscriptWord[] = [];
  const sentenceEnds: number[] = [];
  const stalls = new Map((speech.stalls ?? []).map((s) => [s.afterWord, s.ms]));
  const msPerSyllable = 60000 / speech.wpm / 1.45;
  let t = speech.leadInMs;
  for (const sentence of speech.sentences) {
    const tokens = sentence.trim().split(/\s+/).filter(Boolean);
    tokens.forEach((token, i) => {
      const hesitation = isHesitationWord(token);
      const slot = hesitation ? 380 : Math.max(1, countSyllables(token)) * msPerSyllable * (0.9 + rand() * 0.2);
      const length = hesitation ? slot : slot * 0.8;
      words.push({ text: token, startMs: Math.round(t), endMs: Math.round(t + length) });
      t += slot;
      if (stalls.has(words.length)) t += stalls.get(words.length)!;
      if (i === tokens.length - 1) sentenceEnds.push(words.length - 1);
      else if (/[,;:]$/.test(token)) t += speech.commaGapMs;
    });
    t += speech.sentenceGapMs;
  }
  const last = words.length ? words[words.length - 1].endMs : 0;
  return { words, durationMs: Math.round(Math.max(last + speech.tailMs, 1000)), sentenceEnds };
}

export const verbatimOf = (words: TranscriptWord[]) => words.map((w) => w.text).join(" ");

// --- Audio ---------------------------------------------------------------------

export interface DemoVoice {
  baseHz: number;
  // Half-height of the pitch swings between words, in semitones: about 0.4 is
  // flat, 3 to 4 is lively.
  swingSt: number;
  // Fall (negative) or rise (positive) on the last word of a sentence.
  endSt: number;
  // How far a few words per sentence stand out, dB.
  accentDb: number;
  speechDb: number;
  noiseDb: number;
  // The microphone heard nothing (muted, or covered).
  silent?: boolean;
}

export const FLAT_VOICE: DemoVoice = { baseHz: 118, swingSt: 0.4, endSt: -0.4, accentDb: 1, speechDb: -26, noiseDb: -64 };
export const STEADY_VOICE: DemoVoice = { baseHz: 124, swingSt: 2, endSt: -2.5, accentDb: 3, speechDb: -25, noiseDb: -64 };
export const LIVELY_VOICE: DemoVoice = { baseHz: 130, swingSt: 4, endSt: -4, accentDb: 5, speechDb: -24, noiseDb: -64 };
export const MUTED_VOICE: DemoVoice = { baseHz: 120, swingSt: 0, endSt: 0, accentDb: 0, speechDb: -70, noiseDb: -70, silent: true };

const HOP_MS = 10;

// The 10 ms feature frames a recording of these words would give: pitch while
// a word is voiced, loudness with a dip between syllables, and the voice
// activity, breath and syllable-peak passes of the real extractor
// (domain/dsp/audioFeatures.ts) run over them.
export function synthFeatures(words: TranscriptWord[], durationMs: number, voice: DemoVoice, seed = 1): AudioFeatures {
  const rand = seededRandom(seed * 7 + 3);
  const frames = Math.max(1, Math.floor(durationMs / HOP_MS));
  const f0 = new Float32Array(frames);
  const confidence = new Float32Array(frames);
  const level = new Float32Array(frames);
  for (let i = 0; i < frames; i++) level[i] = voice.noiseDb + (rand() - 0.5) * 1.6;

  if (!voice.silent) {
    // Which words are accented, and where each sentence ends.
    const ends = new Set<number>();
    words.forEach((w, i) => {
      if (/[.!?]$/.test(w.text)) ends.add(i);
    });
    let sentenceStart = 0;
    let wordSwing = 0;
    words.forEach((w, i) => {
      if (ends.has(i - 1) || i === 0) sentenceStart = i;
      const hesitation = isHesitationWord(w.text);
      const syllables = hesitation ? 1 : Math.max(1, countSyllables(w.text));
      const accented = !hesitation && (w.text.replace(/[^a-z]/gi, "").length > 5 || rand() < 0.2) && rand() < 0.55;
      wordSwing = voice.swingSt * (rand() * 2 - 1);
      const accentDb = accented ? voice.accentDb * (0.6 + rand() * 0.8) : -voice.accentDb * 0.2 * rand();
      const from = Math.round(w.startMs / HOP_MS);
      const to = Math.min(frames - 1, Math.round(w.endMs / HOP_MS));
      const final = ends.has(i);
      const position = Math.min(1, (i - sentenceStart) / 12);
      for (let f = from; f <= to; f++) {
        const p = (f - from) / Math.max(1, to - from);
        // Syllable bumps: the level dips between them.
        const envelope = Math.max(0.35, Math.abs(Math.sin(Math.PI * p * syllables)));
        const edge = p < 0.08 || p > 0.9 ? -5 : 0;
        level[f] = voice.speechDb + accentDb + 20 * Math.log10(envelope) + edge + (rand() - 0.5);
        // Consonants at the edges are not voiced.
        if (p < 0.08 || p > 0.88) continue;
        let st = hesitation ? -0.5 : wordSwing - 0.6 * position;
        if (final && !hesitation) st += voice.endSt * Math.min(1, Math.max(0, (p - 0.3) / 0.7));
        st += (rand() - 0.5) * 0.5;
        f0[f] = voice.baseHz * Math.pow(2, st / 12);
        confidence[f] = 0.82 + rand() * 0.14;
      }
    });
  }

  const sorted = Array.from(level).sort((a, b) => a - b);
  const noiseFloorDb = percentile(sorted, 0.1);
  const speech = hysteresisGate(level, noiseFloorDb);
  tagBreaths(speech, level, f0, speechMedianDb(level, speech, noiseFloorDb));
  const peaks = syllablePeaks(level, speech, speechMedianDb(level, speech, noiseFloorDb));
  return {
    version: AUDIO_EXTRACTOR_VERSION,
    sampleRate: 16000,
    durationMs,
    hopMs: HOP_MS,
    offsetMs: 5,
    f0Hz: f0,
    confidence,
    levelDb: level,
    speech,
    noiseFloorDb,
    peaks,
  };
}

// --- Face ----------------------------------------------------------------------

export interface DemoFace {
  // Share of the time the eyes and head are on the lens.
  onLens: number;
  // A moving face (smiles, brows) against a still one.
  lively: boolean;
  // Share of the take the face is in frame (the rest is out of frame at the end).
  inFrame?: number;
}

const RATE_HZ = 15;

export function synthFace(durationMs: number, face: DemoFace, seed = 1): PresenceSample[] {
  const rand = seededRandom(seed * 13 + 5);
  const samples: PresenceSample[] = [];
  const step = 1000 / RATE_HZ;
  const inFrame = face.inFrame ?? 1;
  const lastPresent = durationMs * inFrame;
  const windowMs = 6000;
  for (let t = 0; t < durationMs; t += step) {
    const tMs = Math.round(t);
    if (t > lastPresent) {
      samples.push({ tMs, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false, blinks: 0 });
      continue;
    }
    const away = (t % windowMs) / windowMs > face.onLens;
    const wave = Math.sin(t / 900);
    const map: Record<string, number> = {
      mouthSmileLeft: face.lively ? Math.max(0, 0.28 + 0.25 * wave) : 0.03,
      mouthSmileRight: face.lively ? Math.max(0, 0.28 + 0.25 * wave) : 0.03,
      cheekSquintLeft: face.lively ? Math.max(0, 0.2 + 0.2 * wave) : 0.02,
      cheekSquintRight: face.lively ? Math.max(0, 0.2 + 0.2 * wave) : 0.02,
      browInnerUp: face.lively ? Math.max(0, 0.15 + 0.3 * Math.sin(t / 1300)) : 0.02,
      browOuterUpLeft: face.lively ? Math.max(0, 0.1 + 0.25 * Math.sin(t / 1300)) : 0.02,
      browOuterUpRight: face.lively ? Math.max(0, 0.1 + 0.25 * Math.sin(t / 1300)) : 0.02,
      jawOpen: 0.15 + 0.15 * Math.abs(Math.sin(t / 180)),
      eyeBlinkLeft: rand() < 0.015 ? 0.8 : 0.05,
      eyeBlinkRight: rand() < 0.015 ? 0.8 : 0.05,
      eyeLookDownLeft: away ? 0.45 : 0.03,
      eyeLookDownRight: away ? 0.45 : 0.03,
    };
    const get = (name: string) => map[name] ?? 0;
    samples.push({
      tMs,
      present: true,
      yaw: away ? 14 + 6 * wave : 2 * wave,
      pitch: away ? -10 : 1 + wave,
      roll: 1.5 * wave,
      ...expressionFromBlendshapes(get),
      framed: true,
      gazeX: away ? 0.4 : 0.04 * wave,
      gazeY: away ? -0.45 : 0.02,
      blinks: rand() < 0.02 ? 1 : 0,
      bs: BLENDSHAPE_NAMES.map(get),
    });
  }
  return samples;
}

// --- Judged answers, written to the real review schema --------------------------

export interface DemoJudgement {
  scores: Partial<Record<SubcategoryId, { score: number; notes: string; evidence: string }>>;
  structureUsed: "what/why/how" | "story arc" | "none detected" | "other";
  annotations: { quote: string; subcategory: SubcategoryId | "restated_point"; note: string }[];
  coaching: { summary: string; strength: string; focus: string; drill: string };
  quickCoach: { strength: string; tip: string; focus_skill: string; follow_up_question: string };
}

// The raw answer, in the shape the server sends (supabase/functions prompts,
// domain/analysis/judgedReview.ts). acceptJudgedReview checks it like a live one.
export function rawReview(judgement: DemoJudgement, transcriptClean: string): unknown {
  return {
    transcript_clean: transcriptClean,
    structure_used: judgement.structureUsed,
    subscores: judgement.scores,
    annotations: judgement.annotations,
    coaching: judgement.coaching,
    quick_coach: judgement.quickCoach,
  };
}

// --- The passages (all original) -------------------------------------------------

export const PASSAGES = {
  bread: [
    "Bread rises because of yeast, which is a tiny living thing that eats sugar.",
    "As the yeast eats, it gives off gas, and the gas gets trapped inside the dough.",
    "The dough is stretchy because of gluten, so it holds the bubbles like a balloon.",
    "When you bake it, the heat makes the bubbles swell one last time.",
    "Then the outside sets into a crust and the shape stays.",
    "That is why a cold kitchen makes a slow loaf and a warm one makes a fast loaf.",
    "If I were teaching a beginner, I would say that patience matters more than any special tool.",
    "So the short version is simple: feed the yeast, trap the gas, and let the oven lock it in.",
  ],
  remote: [
    "I think remote work helps people who already know their job, but it is harder on someone in their first year.",
    "A new person learns a lot by overhearing how others solve problems.",
    "At home that quiet learning mostly disappears.",
    "On the other hand, a long commute eats time that a beginner could spend practicing.",
    "My view is that a mix works best, with a few shared days each week.",
    "Teams should pick those days on purpose, and use them for questions and feedback.",
    "The other days can be for focused work at home.",
    "To sum up, the place matters less than having a plan for how people learn.",
  ],
  train: [
    "Last spring I missed the early train to a job interview.",
    "I stood on the platform watching the tail lights fade, and my stomach dropped.",
    "Then I made a quick choice.",
    "I called a friend who lived nearby, and she drove me to the next station down the line.",
    "We arrived with four minutes to spare.",
    "I walked in a little out of breath, but I told them what happened, and they laughed.",
    "I learned that staying calm is a skill you can practice.",
    "Since then I always leave early, and I keep a backup route in my phone.",
  ],
  saturday: ["Honestly, my favourite part of the week is Saturday morning, when nothing is planned."],
} as const;

export type PassageKey = keyof typeof PASSAGES;

// Hesitations and contextual fillers laid into a passage: "um," at some
// sentence starts, "uh" and "like" mid-sentence, "you know" and "actually"
// now and then. Deterministic.
export function withFillers(sentences: readonly string[], density: number, seed = 1): string[] {
  const rand = seededRandom(seed * 31 + 11);
  const hesitations = ["Um,", "uh", "Uh,", "um"];
  const contextual = ["like", "you know,", "actually", "like"];
  return sentences.map((sentence) => {
    const tokens = sentence.split(" ");
    if (rand() < density) tokens.unshift(hesitations[Math.floor(rand() * hesitations.length)]);
    if (tokens.length > 8 && rand() < density) tokens.splice(3 + Math.floor(rand() * (tokens.length - 6)), 0, contextual[Math.floor(rand() * contextual.length)]);
    if (tokens.length > 10 && rand() < density * 0.6) tokens.splice(5 + Math.floor(rand() * (tokens.length - 8)), 0, hesitations[Math.floor(rand() * hesitations.length)].toLowerCase().replace(",", ""));
    return tokens.join(" ");
  });
}

// --- The takes ---------------------------------------------------------------------

export interface DemoTakeSpec {
  // Short id; the stored id is demoSessionId(key).
  key: string;
  // What this take is there to test, for the Dev screen's list and the docs.
  purpose: string;
  daysAgo: number;
  hour: number;
  promptId: string;
  sessionType: SessionType;
  speech: DemoSpeech;
  voice: DemoVoice;
  face: DemoFace | null;
  judged?: DemoJudgement;
  // Scripted 45-second concise take.
  conciseSeconds?: number;
  seed: number;
}

export const DEMO_ID_PREFIX = "demo-";
export const demoSessionId = (key: string) => `${DEMO_ID_PREFIX}take-${key}`;
export const demoRewindId = (key: string) => `${DEMO_ID_PREFIX}rewind-${key}`;
export const isDemoId = (id: string) => id.startsWith(DEMO_ID_PREFIX);

const talk = (sentences: readonly string[], wpm: number, extra: Partial<DemoSpeech> = {}): DemoSpeech => ({
  sentences: [...sentences],
  wpm,
  sentenceGapMs: 650,
  commaGapMs: 140,
  leadInMs: 900,
  tailMs: 1200,
  ...extra,
});

const TRAIN_JUDGEMENT: DemoJudgement = {
  structureUsed: "story arc",
  scores: {
    pace: { score: 8, notes: "A comfortable pace that was easy to follow, with a little more speed in the middle.", evidence: "about 135 words a minute" },
    pauses: { score: 7.5, notes: "You paused at most sentence ends. A longer beat after the turning point would make it land.", evidence: "Then I made a quick choice." },
    melody: { score: 7, notes: "Your voice moved with the story and dropped at the end of the lines that mattered.", evidence: "pitch range 5.5 semitones" },
    emphasis: { score: 6.5, notes: "The key words stood out some of the time. Lean on 'next station' and 'four minutes'.", evidence: "we arrived with four minutes to spare" },
    tone: { score: 7, notes: "Warm and steady, with a light moment near the end.", evidence: "they laughed" },
    structure: { score: 8.5, notes: "A clear story shape: a setback, a choice, a result and a lesson.", evidence: "Then I made a quick choice." },
    relevance: { score: 8, notes: "Every sentence served the point about staying calm.", evidence: "I learned that staying calm is a skill you can practice." },
    clarity: { score: 8, notes: "Plain words and short sentences. The listener never has to guess who did what.", evidence: "she drove me to the next station down the line" },
    eye_contact: { score: 7, notes: "You looked at the lens for most of the take and glanced away between thoughts.", evidence: "on the lens about 75% of the time" },
    expression: { score: 6, notes: "A little more movement in your face on the funny line would help it come across.", evidence: "expressiveness 38 of 100" },
    conviction: { score: 8, notes: "A firm lesson at the end with no hedging.", evidence: "I learned that staying calm is a skill you can practice." },
  },
  annotations: [
    { quote: "Then I made a quick choice.", subcategory: "structure", note: "The turn of the story: short and clear." },
    { quote: "I learned that staying calm is a skill you can practice.", subcategory: "conviction", note: "A firm closing line that says what it means." },
    { quote: "we arrived with four minutes to spare", subcategory: "emphasis", note: "Say 'four minutes' a touch louder; it is the payoff." },
    { quote: "my stomach dropped", subcategory: "melody", note: "Let your voice drop with the words here." },
  ],
  coaching: {
    summary: "A clear story with a good lesson at the end.",
    strength: "You told it in order and landed on one point.",
    focus: "Slow down on the turning point and let it breathe.",
    drill: "Re-tell it and pause for two beats after 'Then I made a quick choice.'",
  },
  quickCoach: {
    strength: "A clear story with a setback, a choice and a lesson.",
    tip: "Pause for two beats before the turning point so the listener leans in.",
    focus_skill: "cadence",
    follow_up_question: "What would you do differently if the friend had not picked up?",
  },
};

const REMOTE_JUDGEMENT: DemoJudgement = {
  structureUsed: "what/why/how",
  scores: {
    pace: { score: 6.5, notes: "A little fast in the opening sentence, then settled.", evidence: "about 150 words a minute" },
    pauses: { score: 6, notes: "Pauses came at some sentence ends but not before your main point.", evidence: "My view is that a mix works best" },
    melody: { score: 5.5, notes: "Fairly even pitch. Lift the words that carry the argument.", evidence: "pitch range 3.2 semitones" },
    structure: { score: 8, notes: "Point, reason, counter-point, recommendation and a summary.", evidence: "To sum up, the place matters less than having a plan for how people learn." },
    relevance: { score: 7.5, notes: "On topic throughout.", evidence: "remote work helps people who already know their job" },
    clarity: { score: 7, notes: "Clear, with one long opening sentence that could be split.", evidence: "I think remote work helps people who already know their job" },
    conviction: { score: 6, notes: "The opening 'I think' softens a point you then support well.", evidence: "I think remote work helps" },
  },
  annotations: [
    { quote: "My view is that a mix works best", subcategory: "structure", note: "A clear statement of your position." },
    { quote: "I think remote work helps", subcategory: "conviction", note: "Try dropping 'I think' and stating it." },
  ],
  coaching: {
    summary: "A well-built argument with a slightly hesitant opening.",
    strength: "A clear structure that ends on a summary.",
    focus: "State the first point without 'I think'.",
    drill: "Say the first sentence three times, each time with fewer words.",
  },
  quickCoach: {
    strength: "A clear argument that ends on a summary.",
    tip: "Open with the point itself and drop 'I think'.",
    focus_skill: "impromptu",
    follow_up_question: "Which shared days would you pick for a new team?",
  },
};

// The takes, newest first. Days ago and hours chosen so that: the last six days
// each have a take (a six-day streak ending today), and the older ones spread
// across about four months (Library month groups and averages, Trends lines).
export const DEMO_TAKES: DemoTakeSpec[] = [
  {
    key: "free-measured",
    purpose: "A free take with no Tono AI: measured scores only, a couple of fillers.",
    daysAgo: 0,
    hour: 9,
    promptId: "t006",
    sessionType: "spontaneous",
    speech: talk(withFillers(PASSAGES.bread, 0.22, 3), 138),
    voice: STEADY_VOICE,
    face: { onLens: 0.7, lively: true },
    seed: 11,
  },
  {
    key: "judged",
    purpose: "A take judged by Tono AI (demo): judged scores lead, with notes, annotations and a coach card.",
    daysAgo: 1,
    hour: 18,
    promptId: "t004",
    sessionType: "spontaneous",
    speech: talk(PASSAGES.train, 132),
    voice: LIVELY_VOICE,
    face: { onLens: 0.78, lively: true },
    judged: TRAIN_JUDGEMENT,
    seed: 12,
  },
  {
    key: "lively",
    purpose: "Half of the lively-pitch against flat-pitch pair (the same words).",
    daysAgo: 2,
    hour: 19,
    promptId: "t005",
    sessionType: "spontaneous",
    speech: talk(PASSAGES.remote, 140),
    voice: LIVELY_VOICE,
    face: { onLens: 0.8, lively: true },
    seed: 13,
  },
  {
    key: "flat",
    purpose: "The flat-pitch half of the pair: a narrow pitch range, low melody score.",
    daysAgo: 2,
    hour: 8,
    promptId: "t005",
    sessionType: "spontaneous",
    speech: talk(PASSAGES.remote, 140),
    voice: FLAT_VOICE,
    face: { onLens: 0.35, lively: false },
    seed: 14,
  },
  {
    key: "fillers",
    purpose: "Many ums, uhs, likes and you knows, slower, with two long mid-phrase stalls.",
    daysAgo: 3,
    hour: 12,
    promptId: "t002",
    sessionType: "spontaneous",
    speech: talk(withFillers(PASSAGES.remote, 0.9, 5), 112, { stalls: [{ afterWord: 14, ms: 2300 }, { afterWord: 52, ms: 2600 }] }),
    voice: STEADY_VOICE,
    face: { onLens: 0.45, lively: false },
    seed: 15,
  },
  {
    key: "very-short",
    purpose: "A take of about seven seconds: short-take wording and empty charts.",
    daysAgo: 4,
    hour: 20,
    promptId: "t012",
    sessionType: "spontaneous",
    speech: talk(PASSAGES.saturday, 120, { leadInMs: 500, tailMs: 600 }),
    voice: STEADY_VOICE,
    face: { onLens: 0.8, lively: true },
    seed: 16,
  },
  {
    key: "silent",
    purpose: "A take whose microphone heard no voice: no pitch, no loudness, 'not enough clear voice' charts.",
    daysAgo: 5,
    hour: 10,
    promptId: "t017",
    sessionType: "spontaneous",
    speech: talk(["I just wanted to say that my favourite small thing is the first cup of tea in the morning."], 120),
    voice: MUTED_VOICE,
    face: { onLens: 0.6, lively: false },
    seed: 17,
  },
  {
    key: "concise",
    purpose: "A concise 45-second take with a target length.",
    daysAgo: 7,
    hour: 13,
    promptId: "t011",
    sessionType: "concise",
    conciseSeconds: 45,
    speech: talk(PASSAGES.bread.slice(0, 4), 135),
    voice: STEADY_VOICE,
    face: { onLens: 0.65, lively: false },
    seed: 18,
  },
  {
    key: "m1-a",
    purpose: "An earlier measured take (about a month ago): the second month in Library and Trends.",
    daysAgo: 24,
    hour: 18,
    promptId: "t009",
    sessionType: "spontaneous",
    speech: talk(PASSAGES.train, 150, { sentenceGapMs: 380 }),
    voice: STEADY_VOICE,
    face: { onLens: 0.5, lively: false },
    seed: 21,
  },
  {
    key: "m1-b",
    purpose: "A judged take from about a month ago: judged average in a past month.",
    daysAgo: 31,
    hour: 17,
    promptId: "t015",
    sessionType: "spontaneous",
    speech: talk(PASSAGES.remote, 128),
    voice: STEADY_VOICE,
    face: { onLens: 0.6, lively: true },
    judged: REMOTE_JUDGEMENT,
    seed: 22,
  },
  {
    key: "m2-a",
    purpose: "A measured take from about two months ago, fast and flat.",
    daysAgo: 52,
    hour: 11,
    promptId: "t001",
    sessionType: "spontaneous",
    speech: talk(withFillers(PASSAGES.remote, 0.5, 9), 165, { sentenceGapMs: 250 }),
    voice: FLAT_VOICE,
    face: { onLens: 0.4, lively: false },
    seed: 23,
  },
  {
    key: "m3-a",
    purpose: "A measured take from about three months ago, the start of the trend line.",
    daysAgo: 84,
    hour: 16,
    promptId: "t014",
    sessionType: "spontaneous",
    speech: talk(withFillers(PASSAGES.bread, 0.6, 4), 118, { sentenceGapMs: 450 }),
    voice: FLAT_VOICE,
    face: { onLens: 0.35, lively: false },
    seed: 24,
  },
  {
    key: "m4-a",
    purpose: "The oldest take, about four months ago.",
    daysAgo: 118,
    hour: 9,
    promptId: "t020",
    sessionType: "spontaneous",
    speech: talk(withFillers(PASSAGES.train, 0.7, 6), 125),
    voice: FLAT_VOICE,
    face: null,
    seed: 25,
  },
];

// ISO time (UTC) of a take, from "N days ago at this local hour".
export function recordedAtFor(daysAgo: number, hour: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 7 + ((daysAgo * 11) % 40), 0, 0);
  // A take "today" must not be in the future.
  if (d.getTime() > now.getTime()) d.setTime(now.getTime() - 15 * 60_000);
  return d.toISOString();
}

// --- Rewinds ------------------------------------------------------------------------

export interface DemoRewindSpec {
  key: string;
  purpose: string;
  daysAgo: number;
  hour: number;
  seconds: number;
  speech: DemoSpeech;
  // Notes from Tono AI (demo), in the Rewind review answer's shape.
  notes?: unknown;
}

const REWIND_TEXT = [
  "This morning I woke up at seven and made coffee before the house was awake.",
  "The commute was loud because of road works near the bridge, and I was twenty minutes late to the stand-up meeting.",
  "At lunch I walked to the market and bought two oranges and a warm roll for four dollars.",
  "In the afternoon I spent three hours fixing a stubborn bug, and when it finally worked I laughed out loud at my desk.",
  "Later in the evening I cooked a sweet, spicy soup with my sister and we talked until ten.",
  "Right before bed I wrote tomorrow's list on a sticky note and turned the lights off.",
];

export const DEMO_REWINDS: DemoRewindSpec[] = [
  {
    key: "with-notes",
    purpose: "A Rewind with words, counts and notes from Tono AI (demo).",
    daysAgo: 1,
    hour: 21,
    seconds: 84,
    speech: talk(REWIND_TEXT, 128),
    notes: {
      parts: {
        morning: { status: "covered", evidence: "This morning I woke up at seven and made coffee before the house was awake." },
        midday: { status: "covered", evidence: "At lunch I walked to the market and bought two oranges and a warm roll for four dollars." },
        evening: { status: "covered", evidence: "Later in the evening I cooked a sweet, spicy soup with my sister and we talked until ten." },
      },
      specificity: "You gave real numbers and objects: two oranges, a warm roll, twenty minutes late.",
      storytelling: "The bug fix has a small arc: three hours of struggle and then you laughed out loud.",
      flow: "You moved through the day in order, which made it easy to follow.",
      vividDetail: "when it finally worked I laughed out loud at my desk",
      tryTomorrow: "Pick one moment and say how it sounded or smelled.",
    },
  },
  {
    key: "plain",
    purpose: "An older Rewind with counts only (no notes).",
    daysAgo: 3,
    hour: 21,
    seconds: 67,
    speech: talk(REWIND_TEXT.slice(0, 4), 125),
  },
];

// --- Drill attempts (Word Chain and Bridge Chain) --------------------------------------

export interface DemoChainSpec {
  key: string;
  drill: "word_chain" | "chain_bridge";
  daysAgo: number;
  hour: number;
  level: number;
  // What the person said. A Bridge Chain needs a reason for each link.
  transcript: string;
  speakingMs: number;
}

export const DEMO_CHAINS: DemoChainSpec[] = [
  {
    key: "word-chain",
    drill: "word_chain",
    daysAgo: 6,
    hour: 15,
    level: 2,
    transcript: "pen ink octopus aquarium water boat harbor sea salt pepper garden tomato soup spoon kitchen window",
    speakingMs: 27000,
  },
  {
    key: "bridge-chain",
    drill: "chain_bridge",
    daysAgo: 8,
    hour: 15,
    level: 2,
    transcript: "ink because a pen writes with ink, paper because ink goes on paper, tree because paper comes from a tree, forest because trees grow in a forest",
    speakingMs: 40000,
  },
];
