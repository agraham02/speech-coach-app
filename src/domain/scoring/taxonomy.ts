import type { SkillId } from "../../theme/tokens";

// The one scoring taxonomy (docs/decisions/scoring-taxonomy.md). Every score
// the app shows or stores is named here: the main categories are the five
// curriculum skills, each split into subcategories, each fed by metrics.
// Screens, the score sheets, mastery and the reviewer prompts all take their
// names from this file, so "Pace" means the same thing on the overview, the
// scores tab, the coach card and the skill detail screen. Pure data.

// Two layers of results. "measured": what the phone measured and the rules
// made of it, the same formula for everyone. "judged": Tono AI's assessment,
// the ground truth for scores on the takes that have it.
export type Layer = "measured" | "judged";

// What a judge needs to score a subcategory. "text": the transcript and the
// phone's measurements are enough. "media": only a judge that hears the
// audio or sees the video can score it (tone, body language).
export type JudgedFrom = "text" | "media";

// What kind of take a subcategory applies to. A scripted reading's words
// were given, so structure, relevance and clarity don't apply to it.
export type TakeKind = "impromptu" | "script";

export type SubcategoryId =
  // cadence
  | "pace"
  | "pauses"
  | "melody"
  | "emphasis"
  | "tone"
  | "cues"
  // impromptu
  | "structure"
  | "relevance"
  | "clarity"
  | "fluency"
  // confidence
  | "eye_contact"
  | "expression"
  | "conviction"
  | "body"
  // articulation (drills only)
  | "clear_words"
  // conversation (drills only)
  | "replies";

export type MetricId =
  | "speaking_rate"
  | "articulation_rate"
  | "pace_variation"
  | "boundary_pauses"
  | "mid_phrase_pauses"
  | "pauses_per_minute"
  | "longest_pause"
  | "breaths"
  | "pitch_variety"
  | "pitch_range"
  | "voiced_share"
  | "loudness_spread"
  | "emphasis_peaks"
  | "hesitation_fillers"
  | "contextual_fillers"
  | "repeated_words"
  | "stalls"
  | "time_to_first_word"
  | "shape"
  | "point_first"
  | "restated_points"
  | "eye_contact"
  | "looking_down"
  | "looking_up"
  | "longest_look_away"
  | "expressiveness"
  | "smiles"
  | "brow_raises"
  | "hedges"
  | "strong_ending"
  | "head_movement"
  | "head_tilt"
  | "blinks"
  | "in_frame"
  | "read_accuracy"
  | "reply_latency"
  | "asked_back";

export type MetricSource = "audio" | "transcript" | "face" | "drill";

export interface MetricDef {
  id: MetricId;
  label: string;
  unit: string;
  // What it means, in plain words.
  definition: string;
  source: MetricSource;
  subcategory: SubcategoryId;
  // Feeds the measured sub-score. False: shown as a fact only.
  scored: boolean;
  // Produced by session 06's signal work; until it lands the metric is absent.
  pending06?: boolean;
}

export interface SubcategoryDef {
  id: SubcategoryId;
  skill: SkillId;
  label: string;
  definition: string;
  // The phone has a formula for it (domain/scoring/bands.ts).
  measured: boolean;
  // What a judge needs to score it, or null when no judge scores it.
  judged: JudgedFrom | null;
  // Counts toward the category and overall scores. Media-only judgements
  // don't, so a text-judged take and a video-judged take stay comparable.
  rollsUp: boolean;
  appliesTo: TakeKind[];
  // Share within its skill (renormalized over what's present).
  weight: number;
}

export interface SkillDef {
  id: SkillId;
  label: string;
  definition: string;
  // Share of a take's overall score. Zero: the skill is trained in drills,
  // not scored on takes.
  takeWeight: number;
}

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  articulation: {
    id: "articulation",
    label: "Articulation",
    definition: "Crisp, clear words that come through the first time.",
    takeWeight: 0,
  },
  cadence: {
    id: "cadence",
    label: "Cadence",
    definition: "How your voice moves: pace, pauses, pitch and emphasis.",
    takeWeight: 0.3,
  },
  impromptu: {
    id: "impromptu",
    label: "Impromptu",
    definition: "Thinking on your feet: a clear point, a shape, and words that keep coming.",
    takeWeight: 0.45,
  },
  confidence: {
    id: "confidence",
    label: "Confidence",
    definition: "How sure you come across: eye contact, expression and conviction.",
    takeWeight: 0.25,
  },
  conversation: {
    id: "conversation",
    label: "Conversation",
    definition: "Replying naturally and keeping the exchange going.",
    takeWeight: 0,
  },
};

// Skills in display order (the same order as everywhere else in the app).
export const SKILL_ORDER: SkillId[] = ["articulation", "cadence", "impromptu", "confidence", "conversation"];

const BOTH: TakeKind[] = ["impromptu", "script"];
const IMPROMPTU: TakeKind[] = ["impromptu"];

export const SUBCATEGORIES: Record<SubcategoryId, SubcategoryDef> = {
  pace: {
    id: "pace",
    skill: "cadence",
    label: "Pace",
    definition: "How fast you talk while you're talking, and whether it suits what you're saying.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1,
  },
  pauses: {
    id: "pauses",
    skill: "cadence",
    label: "Pauses",
    definition: "Pausing where a thought ends, not in the middle of one.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1,
  },
  melody: {
    id: "melody",
    skill: "cadence",
    label: "Pitch variety",
    definition: "How much your voice rises and falls. A narrow range sounds flat.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1,
  },
  emphasis: {
    id: "emphasis",
    skill: "cadence",
    label: "Emphasis",
    definition: "Leaning on the words that matter, with loudness and pitch.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1,
  },
  tone: {
    id: "tone",
    skill: "cadence",
    label: "Tone fit",
    definition: "Whether your tone suits what you're saying. Needs a judge that hears you.",
    measured: false,
    judged: "media",
    rollsUp: false,
    appliesTo: BOTH,
    weight: 1,
  },
  cues: {
    id: "cues",
    skill: "cadence",
    label: "Following the marks",
    definition: "On a marked script: whether the pauses, stresses and rises you were shown shaped how you read it.",
    measured: false,
    judged: "text",
    rollsUp: true,
    appliesTo: ["script"],
    weight: 1,
  },
  structure: {
    id: "structure",
    skill: "impromptu",
    label: "Structure",
    definition: "Whether the answer had a shape: a point up front, support, and a clear finish.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: IMPROMPTU,
    weight: 1,
  },
  relevance: {
    id: "relevance",
    skill: "impromptu",
    label: "On the point",
    definition: "Whether you answered this prompt with specifics, not something that could answer anything.",
    measured: false,
    judged: "text",
    rollsUp: true,
    appliesTo: IMPROMPTU,
    weight: 1,
  },
  clarity: {
    id: "clarity",
    skill: "impromptu",
    label: "Clarity",
    definition: "Clear sentences that move forward, without circling back to say the same thing again.",
    measured: false,
    judged: "text",
    rollsUp: true,
    appliesTo: IMPROMPTU,
    weight: 1,
  },
  fluency: {
    id: "fluency",
    skill: "impromptu",
    label: "Fluency",
    definition: "Words that keep coming: few ums and uhs, no stalls in the middle of a phrase.",
    measured: true,
    judged: null,
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1,
  },
  eye_contact: {
    id: "eye_contact",
    skill: "confidence",
    label: "Eye contact",
    definition: "Looking at the lens, as if it were one person's eyes.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1.2,
  },
  expression: {
    id: "expression",
    skill: "confidence",
    label: "Expression",
    definition: "A face that moves with what you're saying. A still face makes the voice sound flat too.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: BOTH,
    weight: 1,
  },
  conviction: {
    id: "conviction",
    skill: "confidence",
    label: "Conviction",
    definition: "Saying it like you mean it: few hedges, and an ending that lands instead of trailing off.",
    measured: true,
    judged: "text",
    rollsUp: true,
    appliesTo: IMPROMPTU,
    weight: 0.8,
  },
  body: {
    id: "body",
    skill: "confidence",
    label: "Body language",
    definition: "Posture, gestures and energy. Only a judge that watches the video can see it.",
    measured: false,
    judged: "media",
    rollsUp: false,
    appliesTo: BOTH,
    weight: 1,
  },
  clear_words: {
    id: "clear_words",
    skill: "articulation",
    label: "Clear words",
    definition: "Read-aloud and twister accuracy: how many words came through as said.",
    measured: true,
    judged: null,
    rollsUp: false,
    appliesTo: [],
    weight: 1,
  },
  replies: {
    id: "replies",
    skill: "conversation",
    label: "Replies",
    definition: "How quickly a reply starts and whether it keeps the exchange going. Process only, never content.",
    measured: true,
    judged: null,
    rollsUp: false,
    appliesTo: [],
    weight: 1,
  },
};

// Subcategory order inside each skill, as shown.
export const SUBCATEGORY_ORDER: SubcategoryId[] = [
  "pace",
  "pauses",
  "melody",
  "emphasis",
  "tone",
  "cues",
  "structure",
  "relevance",
  "clarity",
  "fluency",
  "eye_contact",
  "expression",
  "conviction",
  "body",
  "clear_words",
  "replies",
];

const m = (
  id: MetricId,
  subcategory: SubcategoryId,
  label: string,
  unit: string,
  source: MetricSource,
  scored: boolean,
  definition: string,
  pending06 = false,
): MetricDef => ({ id, subcategory, label, unit, source, scored, definition, ...(pending06 ? { pending06 } : {}) });

export const METRICS: Record<MetricId, MetricDef> = {
  speaking_rate: m("speaking_rate", "pace", "Speaking rate", "words a minute", "transcript", true, "Words a minute from your first word to your last."),
  articulation_rate: m("articulation_rate", "pace", "Articulation rate", "syllables a second", "audio", false, "Syllables a second while you're actually talking, pauses left out.", true),
  pace_variation: m("pace_variation", "pace", "Pace changes", "words a minute", "transcript", false, "How much your pace moved across the take (speeding up when nervous is the classic one).", true),
  boundary_pauses: m("boundary_pauses", "pauses", "Pauses at full stops", "% of sentence ends", "transcript", true, "Share of sentence ends followed by a real pause."),
  mid_phrase_pauses: m("mid_phrase_pauses", "pauses", "Mid-phrase pauses", "count", "audio", false, "Pauses that land inside a phrase rather than between thoughts."),
  pauses_per_minute: m("pauses_per_minute", "pauses", "Pauses a minute", "a minute", "audio", false, "Silences of 0.3 s or more, a minute."),
  longest_pause: m("longest_pause", "pauses", "Longest pause", "seconds", "audio", false, "The longest silence between your first and last word."),
  breaths: m("breaths", "pauses", "Breaths", "count", "audio", false, "Audible breaths inside pauses, tagged so they don't split a pause in two.", true),
  pitch_variety: m("pitch_variety", "melody", "Pitch variety", "semitones", "audio", false, "How far your pitch moves around your own middle (standard deviation, in semitones).", true),
  pitch_range: m("pitch_range", "melody", "Pitch range", "semitones", "audio", true, "The span your voice covers (10th to 90th percentile). Semitones, so low and high voices are scored alike."),
  voiced_share: m("voiced_share", "melody", "Voice heard", "% of frames", "audio", false, "How much of the take had a readable pitch. Too little and pitch isn't scored.", true),
  loudness_spread: m("loudness_spread", "emphasis", "Loudness range", "dB", "audio", false, "How much your loudness moves while you speak (silences left out), relative to your own middle.", true),
  emphasis_peaks: m("emphasis_peaks", "emphasis", "Emphasis", "dB", "audio", true, "How much the loudest syllables stand out from the rest.", true),
  hesitation_fillers: m("hesitation_fillers", "fluency", "Ums and uhs", "a minute", "transcript", true, "Sound fillers (um, uh, er): always fillers."),
  contextual_fillers: m("contextual_fillers", "fluency", "Like, actually…", "a minute", "transcript", true, "Words that are fillers only in context (like, actually, you know, basically). Counted apart and weighed at half.", true),
  repeated_words: m("repeated_words", "fluency", "Repeated words", "count", "transcript", false, "The same word twice in a row (\"I I think\"). Never counted against someone who stutters."),
  stalls: m("stalls", "fluency", "Stalls", "a minute", "audio", true, "Silent gaps of 2 s or more in the middle of a phrase."),
  time_to_first_word: m("time_to_first_word", "fluency", "Time to first word", "seconds", "audio", false, "How long it took to start."),
  shape: m("shape", "structure", "Shape", "framework", "transcript", true, "The structure the phone's rules recognised (PREP, story, problem-solution…), if any."),
  point_first: m("point_first", "structure", "Point up front", "yes/no", "transcript", false, "Whether the first sentence made the point."),
  restated_points: m("restated_points", "clarity", "Repeated ideas", "count", "transcript", false, "Points made again in other words without adding anything (found by the judge)."),
  eye_contact: m("eye_contact", "eye_contact", "On the lens", "% of the time", "face", true, "Of the time your face was in view, how much your head and eyes were on the lens."),
  looking_down: m("looking_down", "eye_contact", "Looking down", "% of the time", "face", false, "Eyes well below the lens (notes, the floor, your own preview)."),
  looking_up: m("looking_up", "eye_contact", "Looking up", "% of the time", "face", false, "Eyes above the lens (thinking).", true),
  longest_look_away: m("longest_look_away", "eye_contact", "Longest look away", "seconds", "face", false, "The longest stretch away from the lens."),
  expressiveness: m("expressiveness", "expression", "Expression", "0 to 100", "face", true, "How much your face moved (smile, brows, cheeks). From session 06 it leaves out the jaw, which moves with every syllable."),
  smiles: m("smiles", "expression", "Smiling", "% of the time", "face", false, "Time with a clear smile."),
  brow_raises: m("brow_raises", "expression", "Eyebrow lifts", "a minute", "face", false, "Lifts of the eyebrows, the face's way of underlining a word."),
  hedges: m("hedges", "conviction", "Hedges", "count", "transcript", true, "\"I think\", \"maybe\", \"I guess\": softeners on your own points."),
  strong_ending: m("strong_ending", "conviction", "Ending", "clear / trailed off", "transcript", true, "Whether the last sentence landed or trailed off (\"so yeah\")."),
  head_movement: m("head_movement", "body", "Head movement", "degrees", "face", false, "How much your head moved. Shown, not scored: nods help, constant bobbing doesn't, and the number can't tell which."),
  head_tilt: m("head_tilt", "body", "Head tilt", "% of the time", "face", false, "Time with the head clearly tilted. Shown, not scored (near zero with a phone on a stand)."),
  blinks: m("blinks", "body", "Blinks", "a minute", "face", false, "Blinks a minute. Shown, never scored: it rises with stress but can't be changed on purpose."),
  in_frame: m("in_frame", "body", "In frame", "% of the time", "face", false, "Time your face was in the frame. Under 40% and the face scores are left out."),
  read_accuracy: m("read_accuracy", "clear_words", "Read accuracy", "% of words", "drill", true, "Words recognized as read, in the read-aloud and twister drills."),
  reply_latency: m("reply_latency", "replies", "Reply start", "seconds", "drill", true, "Time from the partner's line to your first word."),
  asked_back: m("asked_back", "replies", "Asked back", "yes/no", "drill", true, "Whether you asked something back."),
};

// What was cut from the scores, and why (the doc explains each).
export const CUT_FROM_SCORES = {
  congruence: "Face-voice match: a judge watching 1 frame a second can't line a face up with a voice, nobody could act on it, and it overlapped Tone fit and Expression.",
  archetype: "Archetype (Motivator, Educator, Coach, Friend): a label that changed take to take, tied to no drill or skill.",
  model_overall: "The judge's own holistic overall: the overall is now worked out from the sub-scores, so the summary always agrees with its breakdown.",
  head_level: "Head level: scored full marks on every take with the phone on a stand.",
  tension: "Tension (frown or pressed lips): read 0% on every take; untuned.",
  volume_variation: "Volume variation in dBFS over the whole take: it measured how much you paused, not your voice. Replaced by session 06's speech-only loudness.",
  rich_delivery: "The old curriculum engine's \"rich delivery\" composite: never called since the path engine replaced it.",
} as const;

export function subcategoriesOf(skill: SkillId): SubcategoryDef[] {
  return SUBCATEGORY_ORDER.map((id) => SUBCATEGORIES[id]).filter((s) => s.skill === skill);
}

export function metricsOf(subcategory: SubcategoryId): MetricDef[] {
  return (Object.values(METRICS) as MetricDef[]).filter((x) => x.subcategory === subcategory);
}

// Skills a take can be scored in, in display order.
export const TAKE_SKILLS: SkillId[] = SKILL_ORDER.filter((s) => SKILL_DEFS[s].takeWeight > 0);
