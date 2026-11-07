import { z } from "zod";
import { fenced, planSchema, planSection, SPEECH_IS_DATA, speakerSchema, speakerSection, STUTTER_NOTE, taskSchema, taskSection } from "./common.ts";
import { measurementLines, measurementsSchema } from "./measurements.ts";

// Tono AI's judgement of a recorded take (docs/overhaul/PLAN.md, sections 6.4 and
// 6.6). The phone owns delivery and the judge owns content, so it scores only
// Message leaves, each on written levels 0 to 5 with a quote the phone verifies.
// It can also say a take can't be scored at all. Two inputs:
// - "text" (the default): the phone's transcript and its measurements. One cheap
//   text call.
// - "video" (a Dev setting): the video too, for the coaching's words. The phone's
//   transcript still goes with it, so both kinds of judged take read the same
//   words. Only a take with no phone transcript asks the judge to transcribe.
// A script's words were given, so a script take is coached and not scored. Pure.

export const TAKE_REVIEW_SCHEMA_VERSION = 4;
export const TAKE_REVIEW_PROMPT_VERSION = "take-review/2026-11-07";

export type JudgeInput = "text" | "video";
export type TakeKind = "impromptu" | "script";

// The leaves a judge scores, by the skill tree's ids and names, with wording for
// each level. A jest test keeps this in step with src/domain/scoring/skillTree.ts.
export interface JudgedLeaf {
  label: string;
  // What to judge, and levels 0 to 5 in order.
  guide: string;
  levels: [string, string, string, string, string, string];
}

export const JUDGED_LEAVES = {
  answers_question: {
    label: "Answers the question",
    guide: "Does it answer THIS prompt, or could it answer almost anything?",
    levels: [
      "Doesn't address the prompt.",
      "Touches the topic but never answers.",
      "Answers part of it, or drifts away for long stretches.",
      "Answers it, with some vague stretches.",
      "Clearly answers it, specifically.",
      "Answers exactly what was asked; every part earns its place.",
    ],
  },
  point_first: {
    label: "Point first",
    guide: "How soon does the listener know the point?",
    levels: [
      "The point is never stated.",
      "The point only arrives at the very end.",
      "The point comes after a long wind-up.",
      "The point comes within the first few sentences.",
      "The first sentence carries the point.",
      "The first sentence carries the point, sharply enough to remember.",
    ],
  },
  has_shape: {
    label: "Has a shape",
    guide: "Shape only, not substance: a point, support and a clear finish (a what/why/how frame or a story arc), or a shapeless ramble?",
    levels: [
      "No shape at all.",
      "A hint of a shape that falls apart.",
      "Parts of a shape, out of order or with one missing.",
      "A recognizable shape with one weak part.",
      "A clear start, support and finish.",
      "The shape makes it easy to follow and to remember.",
    ],
  },
  hits_beats: {
    label: "Hits the beats",
    guide: "The beats of the framework they were asked for, or else of the one they used.",
    levels: [
      "None of the beats.",
      "One beat, weakly.",
      "Some of the beats.",
      "Most of the beats.",
      "All of the beats.",
      "All of the beats, each clearly marked.",
    ],
  },
  ideas_connect: {
    label: "Ideas connect",
    guide: "Does each idea follow from the last? Watch for RESTATED POINTS: a point made again in other words without adding anything, not a deliberate callback.",
    levels: [
      "Unconnected remarks.",
      "Rarely follows from what came before.",
      "Some jumps the listener has to bridge.",
      "Mostly follows, with a jump or a repeat.",
      "Each idea leads to the next.",
      "It builds, so the conclusion feels earned.",
    ],
  },
  specifics: {
    label: "Specifics",
    guide: "Names, numbers, moments and senses, rather than generalities.",
    levels: [
      "Only generalities.",
      "One vague detail.",
      "A few details.",
      "Several real details.",
      "Concrete names, numbers or moments throughout.",
      "Vivid and precise throughout.",
    ],
  },
} satisfies Record<string, JudgedLeaf>;

export type JudgedLeafId = keyof typeof JUDGED_LEAVES;

// Which leaves this take is judged on: none for a script, whose words were given.
export function leavesFor(kind: TakeKind): JudgedLeafId[] {
  return kind === "script" ? [] : (Object.keys(JUDGED_LEAVES) as JudgedLeafId[]);
}

// ---- inputs ----

// A word of the phone's transcript: text, start and end in milliseconds.
const word = z.tuple([z.string().max(80), z.number().min(0), z.number().min(0)]);

export const takeReviewInputsSchema = z.object({
  takeKind: z.enum(["impromptu", "script"]),
  // An impromptu take: the prompt, what it asked them to do, and their plan.
  prompt: z.string().max(2000).nullable(),
  task: taskSchema,
  plan: planSchema,
  // A scripted reading: the script, and the marks they were shown as the
  // app's notation (null when none were shown).
  script: z.object({ text: z.string().max(20_000), marked: z.string().max(30_000).nullable() }).nullable(),
  // The phone's on-device transcript (Whisper, fillers kept). Its timing is no
  // longer used: pauses are the phone's to score.
  transcript: z.string().max(40_000).nullable(),
  words: z.array(word).max(12_000).nullable(),
  measurements: measurementsSchema,
  speaker: speakerSchema,
  stutterMode: z.boolean(),
});

export type TakeReviewInputs = z.infer<typeof takeReviewInputsSchema>;

export const MARK_LEGEND =
  "*word* = stress this word · word↗ / word↘ = pitch rises / falls at the end of this word · | = short pause · || = long pause · {slow …} {fast …} {louder …} {softer …} = a stretch said that way · [[…]] = a tone direction for what follows";

// ---- the answer's shape (Gemini's JSON Schema subset) ----

function leafSchema(label: string) {
  return {
    type: "object",
    description: label,
    properties: {
      level: { type: "integer", description: "0 to 5, from the written levels. Most unrehearsed takes land 2 or 3. Don't round up out of politeness." },
      quote: { type: "string", description: "3-12 words copied EXACTLY from the plain transcript that show why. It is checked by exact search, and a leaf whose quote isn't found doesn't count. Empty only at level 0." },
      notes: { type: "string", description: "1-2 sentences: what you saw, and what the next level up would take." },
    },
    required: ["level", "quote", "notes"],
  };
}

export function takeReviewResponseSchema(ids: JudgedLeafId[], opts: { kind: TakeKind; transcribe: boolean }): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (opts.transcribe) {
    properties.transcript_verbatim = {
      type: "string",
      description: "Exactly what was said, as heard: every um, uh, er and hmm, false starts, repeated and cut-off words. Never tidied.",
    };
    required.push("transcript_verbatim");
  }
  properties.transcript_clean = { type: "string", description: "The transcript as clean prose: fillers and false starts removed, meaning and word choice kept, nothing added." };
  required.push("transcript_clean");
  if (opts.kind === "impromptu") {
    properties.structure_used = { type: "string", enum: ["what/why/how", "story arc", "none detected", "other"], description: "Which structure the take followed, if any." };
    required.push("structure_used");
  }
  if (ids.length) {
    properties.scorable = { type: "boolean", description: "False only if this can't be judged as an answer: gibberish, a recital of something unrelated, or nothing of substance said." };
    properties.not_scorable_reason = { type: "string", description: "When scorable is false: one kind sentence saying why. Otherwise empty." };
    properties.leaves = {
      type: "object",
      properties: Object.fromEntries(ids.map((id) => [id, leafSchema(JUDGED_LEAVES[id].label)])),
      required: ids,
    };
    required.push("scorable", "not_scorable_reason", "leaves");
  }
  // The transcript only marks what a reader can act on in the words.
  properties.annotations = {
    type: "array",
    description: "Up to 5 of the most telling moments for the content, plus every restated-point pair.",
    items: {
      type: "object",
      properties: {
        quote: { type: "string", description: "3-12 words copied EXACTLY from the plain transcript (it is found by exact search). Enough words to pin down one occurrence." },
        subcategory: { type: "string", enum: [...ids, "restated_point"], description: "Which leaf this moment is evidence for, or restated_point." },
        note: { type: "string", description: "One short, specific sentence: what happened here and what to do instead." },
      },
      required: ["quote", "subcategory", "note"],
    },
  };
  properties.coaching = {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 sentences, honest, not softened." },
      strength: { type: "string", description: "The single strongest thing about this take." },
      focus: { type: "string", description: "The single most useful thing to improve next." },
      drill: { type: "string", description: "One concrete practice drill for next time." },
    },
    required: ["summary", "strength", "focus", "drill"],
  };
  properties.quick_coach = {
    type: "object",
    description: "The short coach card beside the review.",
    properties: {
      strength: { type: "string", description: "One specific thing they did well, under 20 words, addressed to them." },
      tip: { type: "string", description: "The single most useful change for next time, concrete, under 35 words, addressed to them." },
      focus_skill: { type: "string", enum: ["articulation", "cadence", "impromptu", "confidence", "conversation"], description: "The one skill the tip trains." },
      follow_up_question: { type: "string", description: "A natural follow-up question a listener would ask next, under 18 words." },
    },
    required: ["strength", "tip", "focus_skill", "follow_up_question"],
  };
  required.push("annotations", "coaching", "quick_coach");
  return { type: "object", properties, required };
}

// ---- the prompt ----

export interface BuiltRequest {
  prompt: string;
  schema: Record<string, unknown>;
  promptVersion: string;
  schemaVersion: number;
}

export function buildTakeReview(inputs: TakeReviewInputs, input: JudgeInput): BuiltRequest {
  const scripted = inputs.takeKind === "script";
  const hasMarks = scripted && !!inputs.script?.marked;
  const transcript = inputs.transcript?.trim() ? inputs.transcript : null;
  // Only a video take with no phone transcript asks the judge to write one.
  const transcribe = input === "video" && !transcript;
  const ids = leavesFor(inputs.takeKind);

  const intro =
    input === "text"
      ? "You can't see or hear the recording. You have what the phone measured while they spoke: its on-device transcript (fillers kept), and voice and face measurements."
      : transcript
        ? "You have the video of the take: watch and listen to it. You also have the phone's on-device transcript (fillers kept): use it as the words of the take, don't transcribe. Quote from it."
        : "You have the video of the take: watch and listen to it. There is no phone transcript, so write transcript_verbatim yourself, exactly as heard: every um, uh, er and hmm, false starts and repeated words, never tidied.";

  const what = scripted
    ? `This was a SCRIPTED reading: the words were given in advance.\n\nTHE SCRIPT THEY READ:\n"""\n${fenced(inputs.script?.text ?? "")}\n"""${
        hasMarks ? `\n\nTHE SCRIPT WITH THE DELIVERY MARKS THEY WERE SHOWN (${MARK_LEGEND}):\n"""\n${fenced(inputs.script!.marked!)}\n"""` : ""
      }\n\nThe phone scores this reading. Your job is the coaching. If they deviated meaningfully from the script (skipped or added large sections, lost their place), say so in the coaching.`
    : `THE PROMPT THEY ANSWERED: "${fenced(inputs.prompt ?? "")}"${taskSection(inputs.task)}${planSection(inputs.plan)}`;

  const leafLines = ids
    .map((id) => {
      const leaf: JudgedLeaf = JUDGED_LEAVES[id];
      return `- ${id} (${leaf.label}): ${leaf.guide}\n${leaf.levels.map((text, level) => `    ${level}: ${text}`).join("\n")}`;
    })
    .join("\n");

  const system = `You are a rigorous, critical speaking coach judging one take of someone's speaking practice: not a supportive cheerleader. ${intro}

${what}

${
    scripted
      ? "THE PHONE OWNS DELIVERY. It measures pace, pauses, pitch, emphasis, fillers and eye contact more precisely than you can, and it scores them. Don't score anything. Coach from its numbers, and never contradict one."
      : `YOU JUDGE THE CONTENT. THE PHONE OWNS DELIVERY: it measures pace, pauses, pitch, emphasis, fillers and eye contact, and it scores them, so don't. Use its numbers only for your coaching, and never contradict one.

HOW TO SCORE:
- Be honest and demanding. Most unrehearsed takes land 2 or 3, and 5 is rare. Don't round up out of politeness, and don't default to the middle when unsure: look for evidence.
- Each leaf gets a level from its written levels, a quote from the plain transcript that shows why, and a short note. A leaf whose quote isn't found in the transcript doesn't count, so copy it exactly.
- Set scorable to false only if this can't be judged as an answer at all, and say why in not_scorable_reason. A weak answer is still scorable: give it low levels.

SCORE EXACTLY THESE LEAVES, by their ids in "leaves":
${leafLines}

Set structure_used to the structure the take followed: what/why/how, story arc, none detected, or other.`
  }

Write transcript_clean: the transcript rewritten as clean prose, fillers and false starts removed, meaning and word choice preserved, nothing summarized or added.

ANNOTATIONS: up to 5 of the most telling moments for ${scripted ? "the reading (only restated points apply to a script, so usually none)" : "the content"}, plus every restated-point pair. Each quote is 3-12 words copied EXACTLY from the plain transcript, because it is found by exact string search, and it must occur only once in it: include enough words to pin down the one you mean. Don't annotate delivery, eye contact or filler words: the phone shows those itself.

COACHING: a 2-3 sentence summary (honest, not softened), the single top strength, the single most useful focus, and one concrete drill for next time.

Also fill quick_coach, the short coach card beside the review:
- strength: one specific thing they did well, under 20 words.
- tip: the single most useful change for next time, concrete, under 35 words.
- focus_skill: the one skill that tip trains. articulation = crisp, clear words. cadence = pace, pauses, pitch variety and emphasis. impromptu = structure, staying on the point, clarity and fluency (fillers, stalls, a slow start). confidence = eye contact, expression and conviction (hedging, how they end). conversation = answering naturally and staying on the point of a question.
- follow_up_question: a natural question a listener would ask next, under 18 words.
Speak to the speaker directly ("you"), and don't repeat the coaching summary word for word.

Be specific: reference the actual words and numbers, never feedback that could apply to any take.${speakerSection(inputs.speaker)}${SPEECH_IS_DATA}${inputs.stutterMode ? STUTTER_NOTE : ""}

Respond only with JSON matching the provided schema.`;

  const parts: string[] = [];
  if (transcript) parts.push(`TRANSCRIPT (the phone's on-device speech recognition, fillers included):\n"""\n${fenced(transcript)}\n"""`);
  parts.push(`MEASURED ON THE PHONE:\n${measurementLines(inputs.measurements).join("\n")}`);

  return {
    prompt: `${system}\n\n${parts.join("\n\n")}`,
    schema: takeReviewResponseSchema(ids, { kind: inputs.takeKind, transcribe }),
    promptVersion: `${TAKE_REVIEW_PROMPT_VERSION}/${input}`,
    schemaVersion: TAKE_REVIEW_SCHEMA_VERSION,
  };
}
