import { z } from "zod";
import { fenced, planSchema, planSection, SPEECH_IS_DATA, speakerSchema, speakerSection, STUTTER_NOTE, taskSchema, taskSection } from "./common.ts";
import { measurementLines, measurementsSchema } from "./measurements.ts";

// The judged layer of a recorded take, built on the app's scoring taxonomy
// (src/domain/scoring/taxonomy.ts, docs/decisions/scoring-taxonomy.md): the
// judge scores subcategories by their taxonomy ids, each with notes and the
// evidence it rests on. Two inputs:
// - "text" (the default): the phone's transcript with word timings and its
//   measurements. One cheap text call.
// - "video" (a Dev setting): the video too, for Tone fit and Body language.
//   The phone's transcript still goes with it, so the judge doesn't spend
//   output tokens transcribing and both kinds of judged take read the same
//   words. Only a take with no phone transcript asks the judge to transcribe.
// Fluency is never judged: the phone counts fillers and stalls. Pure.

export const TAKE_REVIEW_SCHEMA_VERSION = 3;
export const TAKE_REVIEW_PROMPT_VERSION = "take-review/2026-10-23";

export type JudgeInput = "text" | "video";
export type TakeKind = "impromptu" | "script";

// The subcategories a judge scores, with the taxonomy's names. A jest test
// keeps this in step with src/domain/scoring/taxonomy.ts.
export interface JudgedSubcategory {
  label: string;
  // "media": only a judge that hears or sees the take can score it.
  needs: "text" | "media";
  kinds: TakeKind[];
  // What to judge it from, by input.
  guide: Record<JudgeInput, string>;
}

const BOTH: TakeKind[] = ["impromptu", "script"];
const IMPROMPTU: TakeKind[] = ["impromptu"];

export const JUDGED_SUBCATEGORIES = {
  pace: {
    label: "Pace",
    needs: "text",
    kinds: BOTH,
    guide: {
      text: "from the measured pace and how much it varied, and whether it suited the moment. Pace only: filler words are scored on the phone (Fluency), so don't lower Pace for them. State the numbers.",
      video: "from the measured pace (more precise than your own estimate) and whether it suited the moment, as you hear it. Pace only: fillers are scored on the phone.",
    },
  },
  pauses: {
    label: "Pauses",
    needs: "text",
    kinds: BOTH,
    guide: {
      text: "from the bracketed gaps in the timed transcript and the measured pauses: deliberate pauses where a thought ends (good) against mid-phrase gaps and hesitations (bad). Quote where.",
      video: "deliberate pauses where a thought ends (good) against mid-phrase gaps and hesitations (bad), using the timed transcript and what you hear. Quote where.",
    },
  },
  melody: {
    label: "Pitch variety",
    needs: "text",
    kinds: BOTH,
    guide: {
      text: "from the measured pitch span in semitones and its spread.",
      video: "from the measured pitch span in semitones and how the voice rises and falls as you hear it.",
    },
  },
  emphasis: {
    label: "Emphasis",
    needs: "text",
    kinds: BOTH,
    guide: {
      text: "from the loudness range and the syllable-peak variation: whether the words that carry the point would have stood out.",
      video: "whether they leaned on the words that matter, with loudness and pitch, using the measured loudness numbers and what you hear.",
    },
  },
  tone: {
    label: "Tone fit",
    needs: "media",
    kinds: BOTH,
    guide: { text: "", video: "whether the tone of voice suits what is being said, as you hear it." },
  },
  cues: {
    label: "Following the marks",
    needs: "text",
    kinds: ["script"],
    guide: {
      text: "against the delivery marks in the script they were shown. You can only verify timing here: did they pause where the marks ask (the bracketed gaps) and slow down or speed up where marked? Stress and rises can't be checked from text; say so.",
      video: "against the delivery marks in the script they were shown: pauses, stressed words, rises and falls, slow and soft stretches. Name hits and misses, quoting the words. Reasonable fidelity, not perfection.",
    },
  },
  structure: {
    label: "Structure",
    needs: "text",
    kinds: IMPROMPTU,
    guide: {
      text: "Matt Abrahams' structured spontaneity: a point up front, support, and a clear finish (a what/why/how frame or a story arc), or a shapeless ramble? Shape only, not substance.",
      video: "Matt Abrahams' structured spontaneity: a point up front, support, and a clear finish (a what/why/how frame or a story arc), or a shapeless ramble? Shape only, not substance.",
    },
  },
  relevance: {
    label: "On the point",
    needs: "text",
    kinds: IMPROMPTU,
    guide: {
      text: "does it specifically and concretely answer THIS prompt, or could it answer almost anything? Penalize vagueness.",
      video: "does it specifically and concretely answer THIS prompt, or could it answer almost anything? Penalize vagueness.",
    },
  },
  clarity: {
    label: "Clarity",
    needs: "text",
    kinds: IMPROMPTU,
    guide: {
      text: "clear sentences that move forward. Watch for RESTATED POINTS (a point made, then made again in other words without adding anything, not a deliberate callback): name each in the notes and add a restated_point annotation for BOTH occurrences.",
      video: "clear sentences that move forward. Watch for RESTATED POINTS (a point made, then made again in other words without adding anything, not a deliberate callback): name each in the notes and add a restated_point annotation for BOTH occurrences.",
    },
  },
  eye_contact: {
    label: "Eye contact",
    needs: "text",
    kinds: BOTH,
    guide: {
      text: "from the measured eye contact with the lens, looking down and the longest look-away. Don't restate the number as the judgement: say what it meant for a listener.",
      video: "from the measured share (more precise than the video, which you see about once a second) and what you see: does the gaze come back to the lens?",
    },
  },
  expression: {
    label: "Expression",
    needs: "text",
    kinds: BOTH,
    guide: {
      text: "from the measured expressiveness, smiling and eyebrow raises: does the face move with the words?",
      video: "does the face move with the words? Use the measured expressiveness and what you see.",
    },
  },
  conviction: {
    label: "Conviction",
    needs: "text",
    kinds: IMPROMPTU,
    guide: {
      text: "saying it like they mean it: few hedges (maybe, I guess, kind of, sort of, I think when it softens a claim) and an ending that lands instead of trailing off. Quote the hedges and the last line.",
      video: "saying it like they mean it: few hedges (maybe, I guess, kind of, sort of, I think when it softens a claim) and an ending that lands instead of trailing off. Quote the hedges and the last line.",
    },
  },
  body: {
    label: "Body language",
    needs: "media",
    kinds: BOTH,
    guide: { text: "", video: "posture, gestures and physical energy, as you see them. Specific and evidence-based." },
  },
} satisfies Record<string, JudgedSubcategory>;

export type JudgedSubcategoryId = keyof typeof JUDGED_SUBCATEGORIES;

// Which subcategories this take is judged on.
export function subcategoriesFor(kind: TakeKind, input: JudgeInput, hasMarks: boolean): JudgedSubcategoryId[] {
  return (Object.keys(JUDGED_SUBCATEGORIES) as JudgedSubcategoryId[]).filter((id) => {
    const def: JudgedSubcategory = JUDGED_SUBCATEGORIES[id];
    if (!def.kinds.includes(kind)) return false;
    if (def.needs === "media" && input !== "video") return false;
    if (id === "cues" && !hasMarks) return false;
    return true;
  });
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
  // The phone's on-device transcript (Whisper, fillers kept), and its timing.
  transcript: z.string().max(40_000).nullable(),
  words: z.array(word).max(12_000).nullable(),
  measurements: measurementsSchema,
  speaker: speakerSchema,
  stutterMode: z.boolean(),
});

export type TakeReviewInputs = z.infer<typeof takeReviewInputsSchema>;

const PAUSE_MARK_MS = 400;

// The transcript with every gap of 0.4 s or more shown in brackets.
export function timedTranscript(words: [string, number, number][]): string {
  const out: string[] = [];
  words.forEach(([text, start], i) => {
    const gap = i > 0 ? start - words[i - 1][2] : 0;
    if (gap >= PAUSE_MARK_MS) out.push(`[${(gap / 1000).toFixed(1)}s]`);
    out.push(text.trim());
  });
  return out.join(" ");
}

export const MARK_LEGEND =
  "*word* = stress this word · word↗ / word↘ = pitch rises / falls at the end of this word · | = short pause · || = long pause · {slow …} {fast …} {louder …} {softer …} = a stretch said that way · [[…]] = a tone direction for what follows";

// ---- the answer's shape (Gemini's JSON Schema subset) ----

const NOTES =
  "2-4 sentences, evidence-based: name a specific number, quote or moment, say what capped the score, and what a 10 would look like. Never generic praise or vague criticism.";

function subscoreSchema(label: string) {
  return {
    type: "object",
    description: label,
    properties: {
      score: { type: "number", description: "1-10. Most unrehearsed takes land 4-7. Don't round up out of politeness." },
      notes: { type: "string", description: NOTES },
      evidence: { type: "string", description: "The evidence this score rests on: an exact quote from the transcript, or a measured number you cited." },
    },
    required: ["score", "notes", "evidence"],
  };
}

export function takeReviewResponseSchema(ids: JudgedSubcategoryId[], opts: { kind: TakeKind; transcribe: boolean }): Record<string, unknown> {
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
  properties.subscores = {
    type: "object",
    properties: Object.fromEntries(ids.map((id) => [id, subscoreSchema(JUDGED_SUBCATEGORIES[id].label)])),
    required: ids,
  };
  properties.annotations = {
    type: "array",
    description: "4-8 of the most impactful moments behind the scores, plus every restated-point pair.",
    items: {
      type: "object",
      properties: {
        quote: { type: "string", description: "3-12 words copied EXACTLY from the plain transcript (it is found by exact search). Enough words to pin down one occurrence." },
        subcategory: { type: "string", enum: [...ids, "restated_point"], description: "Which subcategory this moment is evidence for, or restated_point." },
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
  required.push("subscores", "annotations", "coaching", "quick_coach");
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
  const ids = subcategoriesFor(inputs.takeKind, input, hasMarks);

  const intro =
    input === "text"
      ? "You can't see or hear the recording. You have what the phone measured while they spoke: its on-device transcript (fillers kept) with word timings, and voice and face measurements."
      : transcript
        ? "You have the video of the take: watch and listen to it. You also have the phone's on-device transcript (fillers kept) with word timings: use it as the words of the take, don't transcribe. Quote from it."
        : "You have the video of the take: watch and listen to it. There is no phone transcript, so write transcript_verbatim yourself, exactly as heard: every um, uh, er and hmm, false starts and repeated words, never tidied.";

  const what = scripted
    ? `This was a SCRIPTED reading: the words were given in advance.\n\nTHE SCRIPT THEY READ:\n"""\n${fenced(inputs.script?.text ?? "")}\n"""${
        hasMarks ? `\n\nTHE SCRIPT WITH THE DELIVERY MARKS THEY WERE SHOWN (${MARK_LEGEND}):\n"""\n${fenced(inputs.script!.marked!)}\n"""` : ""
      }\n\nOnly delivery and presence are being practiced. If they deviated meaningfully from the script (skipped or added large sections, lost their place), say so in the coaching.`
    : `THE PROMPT THEY ANSWERED: "${fenced(inputs.prompt ?? "")}"${taskSection(inputs.task)}${planSection(inputs.plan)}`;

  const subLines = ids.map((id) => `- ${id} (${JUDGED_SUBCATEGORIES[id].label}): ${JUDGED_SUBCATEGORIES[id].guide[input]}`).join("\n");

  const system = `You are a rigorous, critical speaking coach judging one take of someone's speaking practice: not a supportive cheerleader. ${intro}

${what}

HOW TO SCORE (read before scoring anything):
- Be honest and demanding. Most unrehearsed takes land 4-7. Reserve 8-10 for genuinely strong, polished delivery. Don't round up out of politeness, and don't default to the middle when unsure: look for evidence either way.
- Anchors: 1-2 unacceptable, 3-4 weak, 5-6 developing (competent with clear, nameable flaws), 7-8 strong, 9-10 exceptional.
- The phone's measurements are facts, measured more precisely than you can: use them as evidence for your scores and quote them in your notes. Never contradict a measured number (don't claim a different pace or eye-contact share).
- Every subscore has notes that name specific evidence and say what's missing to reach a 10, and an evidence field: an exact quote from the transcript or a measured number you cited.

SCORE EXACTLY THESE SUBCATEGORIES, by their ids in "subscores", each 1-10:
${subLines}

Don't score filler words, stalls or repeated words: the phone measures Fluency itself. You may mention them in notes.
${scripted ? "" : "\nSet structure_used to the structure the take followed: what/why/how, story arc, none detected, or other.\n"}
Write transcript_clean: the transcript rewritten as clean prose, fillers and false starts removed, meaning and word choice preserved, nothing summarized or added.

ANNOTATIONS: 4-8 of the most impactful moments behind the scores, plus the restated-point pairs. Each quote is 3-12 words copied EXACTLY from the plain transcript (not the timed one), because it is found by exact string search; if a phrase occurs more than once, include enough words to pin down the one you mean. Any subcategory scored 6 or below gets at least one annotation at the moment that caused it. Don't annotate filler words.

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
  if (transcript && inputs.words?.length) {
    parts.push(`TIMED TRANSCRIPT (gaps of ${PAUSE_MARK_MS / 1000} s or more shown in [brackets]):\n"""\n${fenced(timedTranscript(inputs.words as [string, number, number][]))}\n"""`);
  }
  parts.push(`MEASURED ON THE PHONE:\n${measurementLines(inputs.measurements).join("\n")}`);

  return {
    prompt: `${system}\n\n${parts.join("\n\n")}`,
    schema: takeReviewResponseSchema(ids, { kind: inputs.takeKind, transcribe }),
    promptVersion: `${TAKE_REVIEW_PROMPT_VERSION}/${input}`,
    schemaVersion: TAKE_REVIEW_SCHEMA_VERSION,
  };
}
