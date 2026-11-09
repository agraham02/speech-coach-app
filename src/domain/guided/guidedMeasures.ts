import { saidRatio, SAID_AT } from "../innerVoice/said";
import { countQuestions } from "../conversation/questions";
import { detectFillerWords } from "../transcriptAnnotations";
import { tokenizeHeard } from "../speech/normalize";
import type { VolumeReading } from "../dsp/volumePauses";
import { pauseMarkPositions, pausesAtMarks, timedTokens, type TimedWordInput } from "../drills/timedHeard";
import { buildTarget } from "../speech/speechAlignment";
import { stripPauseMarks } from "../drills/prepareDrill";
import { failedGate, PASSED, type GateVerdict } from "../gates";

// The 26 guided exercises get a mic and a number (docs/overhaul/PLAN.md, 3c.1 and
// the table in section 7). Each speaking step is a "try": a short recording that is
// read by Whisper and checked for what the exercise asks. The exercise's number is
// those checks added up, plus a share from your own rating where the plan says so.
// Three exercises depend on pitch and stress, which are unproven (probation), so
// they stay self-rated and say so. Every threshold here is a first guess marked
// "tune": they come from the plan, not from your recordings yet. Pure.

export interface Clip {
  // Whisper's transcript (or the live words, in a Quick check).
  text: string;
  // Whisper's words with times; null for a Quick check.
  words: TimedWordInput[] | null;
  volume: VolumeReading[];
  // From when recording started to the first word, in ms (null if unknown).
  startDelayMs: number | null;
  // First word to last word, in ms.
  spokenMs: number;
}

export interface TryResult {
  // 0 to 1.
  ok: number;
  // What was found, in plain words.
  note: string;
}

export interface GuidedTry {
  // The instruction step this recording belongs to.
  step: number;
  // What to say, shown on the Record button.
  prompt: string;
  check: (clip: Clip, earlier: (Clip | null)[]) => TryResult;
}

export interface GuidedMeasure {
  tries: GuidedTry[];
  // The share of the number that comes from your 1-5 rating (0 to 1). The rest is the tries.
  selfShare: number;
  // A part of the number that no microphone can hear (breaths done), 0 to 1, given for finishing.
  doneShare?: number;
  // What the number is, for the result.
  explain: string;
}

// ---------------------------------------------------------------------------
// Small readings of a clip
// ---------------------------------------------------------------------------

const wordsIn = (clip: Clip) => tokenizeHeard(clip.text).tokens;

export function wordCountOf(clip: Clip): number {
  return wordsIn(clip).length;
}

// Words a minute over the speaking span. Whisper's times when there are some.
export function clipWpm(clip: Clip): number | null {
  const n = wordCountOf(clip);
  if (clip.words && clip.words.length > 1) {
    const span = clip.words[clip.words.length - 1].endMs - clip.words[0].startMs;
    return span > 500 ? Math.round(n / (span / 60000)) : null;
  }
  return clip.spokenMs > 500 ? Math.round(n / (clip.spokenMs / 60000)) : null;
}

// How loud the clip was while speaking, on the recognizer's meter, and how loud
// its last part was (the last quarter of the speech).
function level(readings: VolumeReading[]): number | null {
  const spoken = readings.filter((r) => r.value > 0);
  return spoken.length ? spoken.reduce((a, r) => a + r.value, 0) / spoken.length : null;
}

export function clipLevel(clip: Clip): number | null {
  return level(clip.volume);
}

function endLevel(clip: Clip): number | null {
  const spoken = clip.volume.filter((r) => r.value > 0);
  if (spoken.length < 4) return null;
  return level(spoken.slice(-Math.max(2, Math.floor(spoken.length / 4))));
}

// Sentences, by the punctuation Whisper writes; null when there is none to go by.
export function sentencesIn(clip: Clip): number | null {
  if (!clip.words) return null;
  const marks = clip.text.match(/[.!?]+(\s|$)/g)?.length ?? 0;
  return marks > 0 ? marks : wordCountOf(clip) >= 3 ? 1 : 0;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const yes = (note: string): TryResult => ({ ok: 1, note });
const no = (note: string): TryResult => ({ ok: 0, note });
const verdict = (ok: boolean, good: string, bad: string): TryResult => (ok ? yes(good) : no(bad));

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

// Said a given line (the words, not how they sounded).
const saidLine = (line: string): GuidedTry["check"] => (clip) => {
  const r = saidRatio(line, clip.text);
  return verdict(r >= SAID_AT, "Said it", `Heard ${Math.round(r * 100)}% of the line`);
};

// Said again, and louder than the first time.
const saidAndLouder = (line: string): GuidedTry["check"] => (clip, earlier) => {
  const said = saidLine(line)(clip, earlier);
  if (said.ok < 1) return said;
  const louder = louderThanFirst(clip, earlier);
  return { ok: louder.ok === 1 ? 1 : 0.5, note: louder.ok === 1 ? "Said again, louder" : louder.note };
};

// Said a given line, not rushed (about 150 words a minute or slower).
const UNHURRIED_WPM = 150;
const saidUnhurried = (line: string): GuidedTry["check"] => (clip) => {
  const said = saidRatio(line, clip.text) >= SAID_AT;
  const wpm = clipWpm(clip);
  if (!said) return no("Didn't hear the whole line");
  if (wpm != null && wpm > UNHURRIED_WPM) return { ok: 0.5, note: `Said it, but quickly (${wpm} words a minute)` };
  return yes("Said it, unhurried");
};

const askedQuestion: GuidedTry["check"] = (clip) => verdict(countQuestions(clip.text) > 0, "Asked a question", "No question in it");

// One or two sentences, then a question (or an offer to say more).
const OFFER = /\b(long story|if you (ever )?want|if you(?:'|’)d like|happy to|ask me|want to hear|tell you more|more about)\b/i;
const shortThen = (kind: "question" | "offer"): GuidedTry["check"] => (clip) => {
  const sentences = sentencesIn(clip);
  const then = kind === "question" ? countQuestions(clip.text) > 0 : OFFER.test(clip.text) || countQuestions(clip.text) > 0;
  const brief = sentences == null || sentences <= 3;
  if (wordCountOf(clip) < 4) return no("Too little to check");
  if (!then) return no(kind === "question" ? "No question handed back" : "No offer to say more");
  return brief ? yes(kind === "question" ? "Short, then handed back" : "Short, with an offer") : { ok: 0.5, note: "Kept going past two sentences" };
};

// A comment first, then a question.
const commentThenQuestion: GuidedTry["check"] = (clip) => {
  if (wordCountOf(clip) < 5) return no("Too little to check");
  if (countQuestions(clip.text) === 0) return no("No question");
  // Live words have no punctuation to tell sentences apart: a question is enough.
  if (!clip.words) return yes("A question");
  const first = clip.text.split(/(?<=[.!?])\s+/)[0] ?? "";
  return countQuestions(first) > 0 ? no("Started with the question") : yes("A comment, then a question");
};

// Said something of its own, of some length, soon after starting.
const REPLY_IN_MS = 4000;
const repliedInTime: GuidedTry["check"] = (clip) => {
  if (wordCountOf(clip) < 3) return no("Didn't hear a reply");
  if (clip.startDelayMs != null && clip.startDelayMs > REPLY_IN_MS) return { ok: 0.5, note: "Said something, but it took a while" };
  return yes("Replied in time");
};

const saidSomething = (min: number, note: string): GuidedTry["check"] => (clip) => verdict(wordCountOf(clip) >= min, note, "Didn't hear enough");

// ---------------------------------------------------------------------------
// Checks that compare tries, or listen to a pattern
// ---------------------------------------------------------------------------

const louderThanFirst: GuidedTry["check"] = (clip, earlier) => {
  const a = earlier.find(Boolean);
  const first = a ? clipLevel(a) : null;
  const now = clipLevel(clip);
  if (first == null || now == null) return { ok: 0.5, note: "Couldn't compare the volume" };
  return verdict(now > first + 0.3, "Louder the second time", "Not louder than the first");
};

// The last words as loud as the rest (the recognizer's meter, not true decibels: tune).
const LAST_WORD_DROP = 2;
const holdsToTheEnd: GuidedTry["check"] = (clip) => {
  const all = clipLevel(clip);
  const end = endLevel(clip);
  if (all == null || end == null) return { ok: 0.5, note: "Couldn't hear the end clearly" };
  return verdict(all - end <= LAST_WORD_DROP, "Held the volume to the last word", "Faded at the end");
};

// A pause at each bar of a marked passage ("|" short, "||" long), by Whisper's word times.
const PASSAGE_PAUSE_MS = 250;
function pausesAtBars(passage: string): GuidedTry["check"] {
  const plain = stripPauseMarks(passage.replace(/\|\|/g, "//").replace(/\|/g, "/"));
  const after = pauseMarkPositions(passage.replace(/\|\|/g, "//").replace(/\|/g, "/"));
  const target = buildTarget(plain);
  return (clip) => {
    if (!clip.words?.length) return { ok: 0.5, note: "Needs the transcription model to hear the pauses" };
    const found = pausesAtMarks(target, timedTokens(clip.words), after, PASSAGE_PAUSE_MS);
    return { ok: found.marks ? found.held / found.marks : 0, note: `${found.held} of ${found.marks} pauses held` };
  };
}

// Two-second holds and pauses after the point, over a run of three tries: six chances.
const HOLD_MS = 1800;
const holdsAndPauses: GuidedTry["check"] = (clip) => {
  if (!clip.words || clip.words.length < 2) return { ok: 0.5, note: "Needs the transcription model to time the silences" };
  let holds = clip.startDelayMs != null && clip.startDelayMs >= HOLD_MS ? 1 : 0;
  for (let i = 1; i < clip.words.length; i++) if (clip.words[i].startMs - clip.words[i - 1].endMs >= HOLD_MS) holds += 1;
  return { ok: clamp01(holds / 6), note: `${Math.min(holds, 6)} of 6 long silences held` };
};

// A quick telling against a slow one: the faster over the slower; 1.5 or more is full marks.
const RATE_FULL = 1.5;
const slowerThanFirst: GuidedTry["check"] = (clip, earlier) => {
  const first = earlier.find(Boolean);
  const fast = first ? clipWpm(first) : null;
  const slow = clipWpm(clip);
  if (fast == null || slow == null || slow <= 0) return { ok: 0, note: "Couldn't time both tellings" };
  const ratio = fast / slow;
  return { ok: clamp01((ratio - 1) / (RATE_FULL - 1)), note: `${fast} words a minute fast, ${slow} slow` };
};

// Ums in a clip, from Whisper's transcript (it keeps them; the live words don't).
const umsIn = (clip: Clip) => detectFillerWords(clip.text).filter((m) => m.type === "hesitation").length;
const fewerUmsThanFirst: GuidedTry["check"] = (clip, earlier) => {
  const first = earlier.find(Boolean);
  if (!first) return no("No first try to compare");
  if (!clip.words) return { ok: 0.5, note: "Needs the transcription model to hear the ums" };
  const before = umsIn(first);
  const after = umsIn(clip);
  const ok = before === 0 ? (after === 0 ? 1 : clamp01(1 - after / 3)) : clamp01(1 - after / before);
  return { ok, note: `${before} ums, then ${after}` };
};

// Pauses between words long enough to hear, in a clip.
const GAP_MS = 250;
const gapsIn = (clip: Clip) => (clip.words ?? []).filter((w, i, all) => i > 0 && w.startMs - all[i - 1].endMs >= GAP_MS).length;
// The longest run of words with no pause.
const longestRun = (clip: Clip) => {
  const words = clip.words ?? [];
  let best = 0;
  let run = 0;
  words.forEach((w, i) => {
    run = i > 0 && w.startMs - words[i - 1].endMs >= GAP_MS ? 1 : run + 1;
    best = Math.max(best, run);
  });
  return best;
};
const needsTimes = (clip: Clip) => !clip.words || clip.words.length < 4;
const choppy: GuidedTry["check"] = (clip) => (needsTimes(clip) ? { ok: 0.5, note: "Needs the transcription model to hear the pauses" } : verdict(gapsIn(clip) >= 3, "Choppy: pauses between bursts", "Not choppy enough"));
const flowing: GuidedTry["check"] = (clip) => (needsTimes(clip) ? { ok: 0.5, note: "Needs the transcription model to hear the pauses" } : verdict(gapsIn(clip) <= 1, "Flowing: one run", "Too many pauses for flowing"));
const mixed: GuidedTry["check"] = (clip) => (needsTimes(clip) ? { ok: 0.5, note: "Needs the transcription model to hear the pauses" } : verdict(gapsIn(clip) >= 2 && longestRun(clip) >= 6, "Mixed: a long run and short bursts", "Not both long and short"));

// Named at least three things.
const namedThree: GuidedTry["check"] = (clip) => {
  const items = clip.text
    .split(/[,.]| and |\n/i)
    .map((s) => s.trim())
    .filter((s) => tokenizeHeard(s).tokens.length > 0);
  const n = Math.min(3, items.length);
  return { ok: n / 3, note: `${n} of 3 things named` };
};

// A plan with an if and a then.
const ifThenPlan: GuidedTry["check"] = (clip) => {
  const t = clip.text.toLowerCase();
  const hasIf = /\b(when|if|whenever)\b/.test(t);
  const hasThen = /\b(i(?:'|’)ll|i will|then|i can|i would)\b/.test(t);
  return verdict(hasIf && hasThen && wordCountOf(clip) >= 8, "An if-then plan", "Not quite an if-then plan");
};

// A number from 0 to 10 said out loud.
const saidPrediction: GuidedTry["check"] = (clip) => {
  const words = wordsIn(clip).map((t) => t.norm);
  const digits = words.some((w) => /^(10|[0-9])$/.test(w));
  const spelled = words.some((w) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].includes(w));
  return verdict(digits || spelled, "Said a number", "Didn't hear a number");
};

// Three plain replies in a run.
const threeReplies: GuidedTry["check"] = (clip) => {
  const parts = clip.text.split(/[.?!]+|\bthen\b/).filter((s) => tokenizeHeard(s).tokens.length >= 2);
  const n = Math.min(3, Math.max(parts.length, countQuestions(clip.text) > 0 && parts.length === 0 ? 1 : parts.length));
  return { ok: n / 3, note: `${n} of 3 replies` };
};

// Said it back, then answered: more than a bare answer.
const restatedThenAnswered: GuidedTry["check"] = (clip) => {
  const sentences = sentencesIn(clip);
  const words = wordCountOf(clip);
  if (words < 6) return no("Too little to check");
  return sentences == null || sentences >= 2 || countQuestions(clip.text) > 0 || /^\s*(so|you mean|you(?:'|’)re asking)/i.test(clip.text)
    ? yes("Said it back, then answered")
    : { ok: 0.5, note: "Answered without saying it back" };
};

// No detour phrases.
const DETOURS = /\b(by the way|anyway|that reminds me|speaking of)\b/i;
const noDetours: GuidedTry["check"] = (clip) => (wordCountOf(clip) < 5 ? no("Too little to check") : verdict(!DETOURS.test(clip.text), "No detours", "Took a detour"));
const onePointSentence: GuidedTry["check"] = (clip) => {
  const s = sentencesIn(clip);
  if (wordCountOf(clip) < 4) return no("Too little to check");
  return verdict(s == null || s <= 1, "One sentence", "More than one sentence");
};

// Beats of leaving well: something warm and specific, a reason or plan, a goodbye.
const exitBeats: GuidedTry["check"] = (clip) => {
  const t = clip.text.toLowerCase();
  const warm = /\b(loved|enjoyed|great|glad|fun|nice|appreciate|liked)\b/.test(t);
  const reason = /\b(going to|gotta|got to|have to|need to|grab|run|head)\b/.test(t);
  const bye = /\b(bye|goodbye|talk soon|see you|catch you|take care|later|good night)\b/.test(t);
  const found = [warm, reason, bye].filter(Boolean).length;
  return { ok: found / 3, note: `${found} of 3 beats` };
};

// ---------------------------------------------------------------------------
// The exercises
// ---------------------------------------------------------------------------

const PHRASES =
  "When you speak, | breathe at the pauses, | not in the middle of a thought. || Each phrase gets its own breath, | and each sentence gets a full finish.";

const t = (step: number, prompt: string, check: GuidedTry["check"]): GuidedTry => ({ step, prompt, check });

// An exercise that isn't here is self-rated only: pitch and stress are unproven
// (Endings that fall, Stress on the right words, Range across feelings are on
// probation), so no number is claimed for Emphasis shift, Statement or question?
// and Same line, different feeling until Signal Lab proves them.
export const GUIDED_MEASURES: Record<string, GuidedMeasure> = {
  gd_reappraisal: {
    tries: [t(1, "Say: I'm excited.", saidLine("I'm excited")), t(2, "Say it again, louder.", saidAndLouder("I'm excited"))],
    selfShare: 0.4,
    explain: "Said it twice, the second louder, and how energized you feel (your rating).",
  },
  gd_breath_reset: {
    tries: [t(2, "Say your opening line on a slow out-breath.", saidUnhurried("Thanks for having me — let me start with a quick story"))],
    selfShare: 0,
    doneShare: 0.5,
    explain: "The sighs done (half) and the line said unhurried (half). A silent breath can't be heard, so it counts for finishing.",
  },
  gd_phrase_breath: {
    tries: [t(0, "Read the passage, pausing at each bar.", pausesAtBars(PHRASES)), t(2, "Read it again, a little slower.", pausesAtBars(PHRASES))],
    selfShare: 0,
    explain: "Pauses at the bars, over two reads.",
  },
  gd_breath_volume: {
    tries: [t(1, "Say the sentence at that volume.", holdsToTheEnd), t(2, "Once more, louder, with a bigger breath.", (c, e) => ({ ok: 0.7 * holdsToTheEnd(c, e).ok + 0.3 * louderThanFirst(c, e).ok, note: "Held to the end and louder than the first" }))],
    selfShare: 0,
    explain: "The last word held up (70%) and the third read louder (30%).",
  },
  gd_power_pause: {
    tries: [t(3, "Hold two seconds, say your point, pause, give a reason. Three times.", holdsAndPauses)],
    selfShare: 0,
    explain: "Two-second holds and pauses after the point, out of six.",
  },
  gd_rate_contrast: {
    tries: [t(0, "Tell the 3-sentence story, quickly.", saidSomething(8, "Told it")), t(1, "Say the last sentence again, slowly.", slowerThanFirst)],
    selfShare: 0,
    explain: "How much faster the first telling was than the slow one. 1.5 times or more is full marks.",
  },
  gd_catch_um: {
    tries: [t(0, "Talk for 30 seconds about your morning.", saidSomething(15, "Talked")), t(1, "30 seconds on your weekend. Pause instead of um.", fewerUmsThanFirst)],
    selfShare: 0,
    explain: "Fewer ums in the second 30 seconds than the first.",
  },
  gd_rhythm: {
    tries: [t(0, "Say it in short, choppy bursts.", choppy), t(1, "Now as one flowing sentence.", flowing), t(2, "Now mix them.", mixed)],
    selfShare: 0,
    explain: "Versions with the right pause pattern, out of three.",
  },
  gd_attention_check: {
    tries: [t(2, "Name three things you can see, out loud.", namedThree)],
    selfShare: 0.4,
    explain: "Three things named aloud (60%) and how easy it was to move your attention outward (40%, your rating).",
  },
  gd_spark: {
    tries: [t(2, "Ask the question you'd ask about it.", askedQuestion)],
    selfShare: 0,
    explain: "You asked a question about the spark.",
  },
  gd_drop_rehearsal: {
    tries: [t(2, "Say your if-then plan.", ifThenPlan)],
    selfShare: 0.3,
    explain: "An if-then plan said aloud (70%) and how confident you are (30%, your rating).",
  },
  gd_liking_gap: {
    tries: [t(1, "Say your prediction, 0 to 10.", saidPrediction)],
    selfShare: 0,
    explain: "Your prediction said aloud. The other half, whether it was worse than reality, comes when you rate the conversation in Debrief.",
  },
  gd_good_enough: {
    tries: [t(1, "Say three plain replies.", threeReplies)],
    selfShare: 0,
    explain: "Plain replies said, out of three.",
  },
  gd_story_questions: {
    tries: [t(0, "Turn \"What do you do?\" into a story question.", askedQuestion), t(1, "Turn \"How was your weekend?\" into one.", askedQuestion), t(2, "Turn \"Where are you from?\" into one.", askedQuestion)],
    selfShare: 0,
    explain: "Open questions asked, out of three.",
  },
  gd_me_too: {
    tries: [t(1, "One sentence of your own, then hand it back.", shortThen("question")), t(2, "Again with: I've been getting into running.", shortThen("question"))],
    selfShare: 0,
    explain: "Tries with one or two sentences and a question handed back, out of two.",
  },
  gd_recover: {
    tries: [
      t(0, "Say: Good question — give me a second.", saidUnhurried("Good question give me a second")),
      t(1, "Say: I totally lost my thought. Go on.", saidUnhurried("I totally lost my thought Go on")),
      t(2, "Breathe, then: Wait, tell me more about that.", saidUnhurried("Wait tell me more about that")),
    ],
    selfShare: 0,
    explain: "Lines said calmly, not rushed, out of three.",
  },
  gd_detours: {
    tries: [t(1, "Say the main point in one sentence.", onePointSentence), t(2, "Once more, with no detours at all.", noDetours)],
    selfShare: 0,
    explain: "A clean last try with no detours (60%) and your point in one sentence (40%).",
  },
  gd_offer_more: {
    tries: [t(1, "Answer \"What do you do?\" briefly and end with an offer.", shortThen("offer")), t(2, "Again for: How was your trip?", shortThen("offer"))],
    selfShare: 0,
    explain: "Tries with one or two sentences and an offer to say more, out of two.",
  },
  gd_exaggerate: {
    tries: [t(0, "Say a playful exaggeration.", repliedInTime), t(1, "Try the bank one.", repliedInTime), t(2, "Try the fridge one.", repliedInTime)],
    selfShare: 0,
    explain: "Replies that came in time, out of three. (Whether they were funny is for Tono AI or you to say, not the microphone.)",
  },
  gd_kind_tease: {
    tries: [t(0, "Say something curious.", askedQuestion), t(1, "A light, kind tease.", saidSomething(4, "Said it")), t(2, "Something genuine.", saidSomething(4, "Said it"))],
    selfShare: 0,
    explain: "A curious question asked and two lines said, out of three.",
  },
  gd_buy_time: {
    tries: [t(1, "Say the question back, then answer it.", restatedThenAnswered), t(2, "Same for: famous or rich?", restatedThenAnswered), t(3, "And: something you changed your mind about.", restatedThenAnswered)],
    selfShare: 0,
    explain: "Said it back, then answered, out of three.",
  },
  gd_opener: {
    tries: [t(1, "A plain comment, then a question.", commentThenQuestion), t(2, "Again with something else.", commentThenQuestion), t(3, "Now your own opener for a real place.", commentThenQuestion)],
    selfShare: 0,
    explain: "A comment, then a question, out of three tries.",
  },
  gd_exit: {
    tries: [t(2, "Say all three: something specific, a reason, a goodbye.", exitBeats), t(3, "Again, a little firmer and still warm.", exitBeats)],
    selfShare: 0,
    explain: "Beats of leaving well found, out of six.",
  },
};

export const SELF_RATED_ONLY: Record<string, string> = {
  gd_emphasis: "Whether the right word stood out isn't proven yet, so this stays a rating and moves no skill.",
  gd_inflection: "Whether your pitch rose or fell isn't proven yet, so this stays a rating and moves no skill.",
  gd_emotion_read: "Whether your voice changed with the feeling isn't proven yet, so this stays a rating and moves no skill.",
};

export function isMeasured(guidedId: string): boolean {
  return guidedId in GUIDED_MEASURES;
}

// ---------------------------------------------------------------------------
// The number
// ---------------------------------------------------------------------------

export interface GuidedScore {
  // 0 to 1, or null when it couldn't be scored.
  score: number | null;
  gate: GateVerdict;
  parts: { label: string; note: string; ok: number }[];
}

// The rating (1 to 5) as 0 to 1.
const ratingShare = (rating: number | null) => (rating == null ? 0 : clamp01((rating - 1) / 4));

// Gate: something was said in at least one try, or the number is a rating and a promise.
export function scoreGuided(guidedId: string, clips: (Clip | null)[], rating: number | null): GuidedScore {
  const measure = GUIDED_MEASURES[guidedId];
  if (!measure) return { score: null, gate: PASSED, parts: [] };
  const heard = clips.filter((c): c is Clip => !!c && wordCountOf(c) >= 2);
  if (!heard.length) {
    return { score: null, gate: failedGate("We didn't hear you say anything, so this one isn't scored. Say the lines out loud."), parts: [] };
  }
  const results = measure.tries.map((spec, i) => {
    const clip = clips[i];
    if (!clip || wordCountOf(clip) < 2) return { label: spec.prompt, note: "Not said", ok: 0 };
    const r = spec.check(clip, clips.slice(0, i));
    return { label: spec.prompt, note: r.note, ok: r.ok };
  });
  const triesMean = results.reduce((a, r) => a + r.ok, 0) / results.length;
  const done = measure.doneShare ?? 0;
  const tryShare = 1 - measure.selfShare - done;
  const score = clamp01(tryShare * triesMean + measure.selfShare * ratingShare(rating) + done);
  return { score, gate: PASSED, parts: results };
}
