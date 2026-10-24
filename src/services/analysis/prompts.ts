import { AUTO_MARK_DATA_NOTE, AUTO_MARK_JSON_SCHEMA, AUTO_MARK_SYSTEM, buildAutoMarkPrompt } from "../../domain/cadence/autoMarkPrompt";
import { chainPairs } from "../../domain/drills/chainJudging";
import { defaultsFromProfile } from "../../domain/profile";
import { buildSummaryReviewPrompt, jsonSchemaFor, SUMMARY_REVIEW_SYSTEM } from "../../domain/summary/summaryReviewPrompt";
import { fenced } from "../cloud/inputGuards";
import { measuredReviewRequest } from "../cloud/measuredReview";
import { speakerContextForReview } from "../cloud/speakerContext";
import { SPEECH_IS_DATA, STUTTER_NOTE } from "../gemini/schema";
import { getUserProfile } from "../prefs/prefsStore";
import type { BridgeChainInput, MarkUpInput, RewindNotesInput, SummaryNotesInput, TakeReviewInput, WordChainInput } from "./kinds";

// Every prompt an AI judge is sent, built from the kind's typed input, in one
// place. No screen, component or step builds a prompt any more. Session 08
// moves these templates to the server: the Tono AI provider will then send
// the same typed inputs ({kind, inputs, schemaVersion}) and the server builds
// the request with these functions. The video review's prompt is built in
// services/gemini/transcribeSession.ts (analyzeUploadedVideo), which moves
// with it.
//
// The exercise judges (Rewind, Word Chain, Bridge Chain) follow the shape
// session 04's eval found works on any model: define every category, ask for
// a verbatim quote as evidence, and let the phone check each quote against
// what was really said (docs/decisions/exercise-judging.md).

export interface TextRequest {
  system: string;
  user: string;
  // Plain JSON Schema (Gemini's subset).
  schema: object;
}

// The take judged from its transcript and the phone's measurements.
export function takeReviewTextRequest(input: TakeReviewInput, withCoach: boolean): TextRequest {
  return measuredReviewRequest(input, { withCoach });
}

// ---------------------------------------------------------------------------
// Rewind: notes on the day told out loud
// ---------------------------------------------------------------------------

export const REWIND_REVIEW_SYSTEM = `You are a warm, honest speaking coach reading the transcript of someone telling the story of their day out loud. They are practicing recalling a day in detail and putting it into words. You only have the transcript, so say nothing about voice, pace, volume, fillers or confidence.

First judge COVERAGE of three parts of the day:
- morning: from waking up until about noon (getting up, praying, breakfast, the commute, the first things done).
- midday: from about noon until about 5 pm (lunch, the working or school day, meetings, errands, leaving work at 4).
- evening: from about 5 pm until bed (coming home, a nap after work, dinner, the night, going to bed). If they are telling the story at night, what they say about right now counts as evening.
For each part give a status: "covered" = at least one concrete thing that happened in that part; "brief" = only mentioned in passing, with no detail; "missing" = nothing from that part at all. Decide the part from times, meals and events, not only from the words "morning", "afternoon" or "evening": "I got home at five" is evening, "my 2 o'clock meeting" is midday. A day told from waking up to going to bed has all three parts; a part is "missing" only when nothing at all happened in it. For every part that is not missing, copy a short run of words (at most 15) EXACTLY as written in the transcript as evidence. For a missing part the evidence is "".

Then write short notes on the CONTENT only:
- specificity: how concrete it was (names, places, times, numbers, what they saw, heard or felt), and one specific line that was vague and could have been concrete.
- storytelling: whether it told moments (this happened, then I felt or did this, something surprised me) or only listed events. Name one moment that worked.
- flow: whether it followed a clear order and how it moved from one part of the day to the next.
Pick the single most vivid moment and copy it EXACTLY, word for word, from the transcript: one sentence or clause of 5 to 40 words that shows something happening, not a time or a list. Give one small thing to try tomorrow, based on a real weakness in what they said.

Rules: no scores, grades, numbers out of ten, or percentages. Be kind but never flatter, and point at real words from the transcript. Each note is one or two plain sentences. Never say a part of the day is missing or thin unless its status says so. Don't diagnose or mention anxiety. Write to them as "you".${SPEECH_IS_DATA}`;

const PART_SCHEMA = {
  type: "object",
  properties: { status: { type: "string", enum: ["covered", "brief", "missing"] }, evidence: { type: "string" } },
  required: ["status", "evidence"],
};

export const REWIND_NOTES_SCHEMA = {
  type: "object",
  properties: {
    parts: { type: "object", properties: { morning: PART_SCHEMA, midday: PART_SCHEMA, evening: PART_SCHEMA }, required: ["morning", "midday", "evening"] },
    specificity: { type: "string" },
    storytelling: { type: "string" },
    flow: { type: "string" },
    vividDetail: { type: "string" },
    tryTomorrow: { type: "string" },
  },
  required: ["parts", "specificity", "storytelling", "flow", "vividDetail", "tryTomorrow"],
};

// `problems`: what was wrong with the last answer, on the second go.
export function rewindNotesRequest(input: RewindNotesInput, problems: string[] = []): TextRequest {
  return {
    system: REWIND_REVIEW_SYSTEM,
    user: `Here is the transcript of their day:\n\n"""${fenced(input.transcript.trim())}"""${retryNote(problems)}`,
    schema: REWIND_NOTES_SCHEMA,
  };
}

function retryNote(problems: string[]): string {
  if (!problems.length) return "";
  return `\n\nYour previous answer was rejected for these reasons. Fix them and answer again in full:\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

// ---------------------------------------------------------------------------
// Word Chain: does each link make sense
// ---------------------------------------------------------------------------

export const WORD_CHAIN_SYSTEM = `You judge a Word Chain speaking drill for a speech coach app. The speaker is shown a start word, then says a word that connects to it, then a word that connects to THAT word, and so on, out loud and fast. Each word only has to connect to the word right before it, never to the start of the chain. After a long silence the app shows a fresh start word, and the next word links to that one.

For every pair (previous word -> next word) give a verdict:
- "strong": an ordinary listener would see the connection within a couple of seconds. These all count: the same group (dog, cat), part and whole (wheel, car), something used with or made from (pen, ink), where it lives or happens (octopus, aquarium), cause and effect or what comes next (rain, umbrella), opposites (hot, cold), a common phrase or compound (fire, truck), a well-known saying, title, character or song (moon, cheese), or a word with two meanings that bridges the two (bank, river).
- "loose": there is a real connection, but it takes a stretch or a personal story to see it.
- "none": you cannot name a sensible connection. Sounding alike, rhyming or starting with the same letter does not count by itself. Saying the same word again, or a form of it (ink, inks), is not a new link: "none".
Be fair, not harsh: surprising or silly links are fine if you can name the connection. The words come from speech recognition on a phone and may be mis-heard: if a word looks like a mis-hearing of a word that WOULD connect (one that sounds the same), judge it as that word and say so in the reason.
For each pair return its number n, the verdict, and a reason of at most 10 words that names the connection (or says what is missing), in plain words. Return exactly one entry for each pair, in order.${SPEECH_IS_DATA}`;

export const WORD_CHAIN_SCHEMA = {
  type: "object",
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          verdict: { type: "string", enum: ["strong", "loose", "none"] },
          reason: { type: "string" },
        },
        required: ["n", "verdict", "reason"],
      },
    },
  },
  required: ["links"],
};

// Words reach this from speech recognition, but are cleaned to letters here
// as well: nothing else can get into the prompt through them.
const plainWord = (w: string) => w.replace(/[^A-Za-z'-]/g, "").slice(0, 30);

export function wordChainRequest(input: WordChainInput, problems: string[] = []): TextRequest {
  const pairs = chainPairs(input.segments);
  const lines = pairs.map((p) => `${p.n}. ${plainWord(p.from)} -> ${plainWord(p.to)}`);
  return {
    system: WORD_CHAIN_SYSTEM,
    user: `Judge these ${pairs.length} links, in the order spoken:\n${lines.join("\n")}${retryNote(problems)}`,
    schema: WORD_CHAIN_SCHEMA,
  };
}

// ---------------------------------------------------------------------------
// Bridge Chain: was each link explained
// ---------------------------------------------------------------------------

export const BRIDGE_CHAIN_SYSTEM = `You judge a Bridge Chain speaking drill for a speech coach app. The speaker is shown a start word. They say a next word and, right after it, the REASON it connects to the word before: "pen... ink, because a pen writes with ink... octopus, because octopuses squirt ink...". The drill trains saying why one idea leads to the next, out loud and unprepared.

You get what they said after each start word as speech-recognition text: no punctuation, and it may contain mis-heard words. Split it into steps. A step is one new word the speaker moved to, plus the reason they gave, in their own words, for how it connects to the word just before it. Give each step a verdict:
- "explained": the reason names a specific connection that is true, or at least reasonable, and that really links these two words.
- "thin": a reason was given, but it is empty, circular or too general to count ("because they go together", "because it's related", "because it makes me think of it"), or it is true but barely links these two words.
- "unexplained": no reason was said, or the reason is about something else or is plainly wrong.
The word "because" is not a reason: judge what follows it. A far-fetched link is fine if the reason explains it clearly. Do not invent steps, and do not repair or add reasons the speaker did not say.
For each step return: word (the word they moved to, as heard), reason (copied EXACTLY, word for word, from the text; "" when none was said), verdict, and note (at most 12 words, plain: why this verdict). Return the steps in the order spoken.${SPEECH_IS_DATA}`;

export const BRIDGE_CHAIN_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          reason: { type: "string" },
          verdict: { type: "string", enum: ["explained", "thin", "unexplained"] },
          note: { type: "string" },
        },
        required: ["word", "reason", "verdict", "note"],
      },
    },
  },
  required: ["steps"],
};

export function bridgeChainRequest(input: BridgeChainInput, problems: string[] = []): TextRequest {
  const blocks = input.segments.map((s, i) => `Start word ${i + 1}: ${plainWord(s.seed)}\nThey said: """${fenced(s.said)}"""`);
  return {
    system: BRIDGE_CHAIN_SYSTEM,
    user: `${blocks.join("\n\n")}${retryNote(problems)}`,
    schema: BRIDGE_CHAIN_SCHEMA,
  };
}

// ---------------------------------------------------------------------------

export function summaryNotesRequest(input: SummaryNotesInput): TextRequest {
  const stutters = defaultsFromProfile(getUserProfile()).stutterMode;
  return {
    system: SUMMARY_REVIEW_SYSTEM[input.setup.type] + speakerContextForReview() + SPEECH_IS_DATA + (stutters ? STUTTER_NOTE : ""),
    user: buildSummaryReviewPrompt(input.setup, input.transcripts, fenced),
    schema: jsonSchemaFor(input.setup.type),
  };
}

export function markUpRequest(input: MarkUpInput): TextRequest {
  return { system: `${AUTO_MARK_SYSTEM}\n${AUTO_MARK_DATA_NOTE}`, user: buildAutoMarkPrompt(input.text), schema: AUTO_MARK_JSON_SCHEMA };
}
