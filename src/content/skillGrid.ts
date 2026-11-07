import { ACTIVITY_IDS, guidedActivityId, lessonActivityId, warmupActivityId, drillActivityId } from "./activities";
import { LESSONS, lessonsInUnit } from "./lessons";
import { isContentLeaf, isInnerLeaf, type LeafId } from "../domain/scoring/skillTree";

// The scoring grid (docs/overhaul/PLAN.md, section 7, and Appendix A): every
// activity, its number, its gate, and which leaves it moves by how much. It is
// one data file, keyed by the catalogue's ids (activities.ts), so a new activity
// with no row fails a test, and a test compares the rows with the plan's tables.
// What it moves is worked out in domain/scoring/leafEvidence.ts.

// Dots in the plan: main ●●● 1, partial ●● 0.5, light ● 0.25.
export type GridWeight = "main" | "partial" | "light";
export const GRID_WEIGHTS: Record<GridWeight, number> = { main: 1, partial: 0.5, light: 0.25 };

// A lesson's or checkpoint's target leaf moves this much more on a rep.
export const TARGET_MULTIPLIER = 1.5;

export interface LeafMove {
  leaf: LeafId;
  weight: GridWeight;
  // Moves only when this is true of the attempt.
  only?: "has_topic" | "no_prep" | "timing_exists";
  // Shown, never counted (Felt vs measured).
  displayOnly?: boolean;
}

export interface GridRow {
  activityId: string;
  // How the attempt's number is worked out.
  number: string;
  // What must be true before the attempt can move a score. Enforced from 3b.1.
  gate?: string;
  moves: LeafMove[];
  // Its leaves come from elsewhere: the skill check sets starting values for
  // whatever its pieces touch; a checkpoint moves its unit's target leaf.
  dynamic?: "seeds_starting_values" | "unit_target";
  // Anything else the row asks for that isn't a fixed leaf.
  note?: string;
}

type Dots = 1 | 2 | 3;
const WEIGHT: Record<Dots, GridWeight> = { 3: "main", 2: "partial", 1: "light" };

function row(activityId: string, number: string, moves: [LeafId, Dots][], gate?: string): GridRow {
  return { activityId, number, gate, moves: moves.map(([leaf, dots]) => ({ leaf, weight: WEIGHT[dots] })) };
}

// -----------------------------------------------------------------------------
// Takes. "Every Voice, Clarity and Presence leaf a take can measure ●●●; Message
// leaves ●●● judged, ● phone estimate": the phone-estimate part is the general
// rule in effectiveWeight below, so the rows just say main.
// -----------------------------------------------------------------------------

// A take has no marks to hold pauses at, no target speed, and no breath or
// stress exercise, so Deliberate pauses, Pace control, Breath length and Knowing
// where to stress come from drills.
const TAKE_VOICE: LeafId[] = ["speaking_rate", "rhythm", "sentence_ends", "pitch_variety", "endings_fall", "stand_out_stress", "stress_right_words", "volume_carry"];
// "A rep can't yet measure Clear words on a take" (Appendix A).
const TAKE_CLARITY: LeafId[] = ["ums_uhs", "like_actually", "stalls", "restarts"];
// Range across feelings needs four reads of one line.
const TAKE_PRESENCE: LeafId[] = ["on_lens", "long_lookaways", "hedges", "clear_endings", "face_movement"];
// What a talk can show about its content. Explains why, Within limits, Keeps the
// core, Word retrieval, Word links, Story and Feeling words need a drill or a set
// limit. Starting fast counts only when there was no prep.
const TAKE_MESSAGE: LeafId[] = ["answers_question", "point_first", "has_shape", "hits_beats", "ideas_connect", "plain_words", "no_detours", "specifics"];

const moves = (leaves: LeafId[], weight: GridWeight): LeafMove[] => leaves.map((leaf) => ({ leaf, weight }));

const TAKE_DELIVERY: LeafMove[] = [...moves(TAKE_VOICE, "main"), ...moves(TAKE_CLARITY, "main"), ...moves(TAKE_PRESENCE, "main")];
const TAKE_ALL: LeafMove[] = [...TAKE_DELIVERY, ...moves(TAKE_MESSAGE, "main"), { leaf: "starting_fast", weight: "main", only: "no_prep" }];

const TAKE_NUMBER = "Each leaf uses its own formula from 6.2";
const TAKE_GATE = "Enough words; on-topic check; judge can say \"not scorable\"";

const TAKES: GridRow[] = [
  { activityId: ACTIVITY_IDS.impromptu, number: TAKE_NUMBER, gate: TAKE_GATE, moves: TAKE_ALL },
  { activityId: ACTIVITY_IDS.concise, number: TAKE_NUMBER, gate: TAKE_GATE, moves: [...TAKE_ALL, { leaf: "within_limits", weight: "main" }] },
  {
    activityId: ACTIVITY_IDS.freeRecord,
    number: TAKE_NUMBER,
    gate: "Coherence check",
    moves: TAKE_ALL.map((m) => (m.leaf === "answers_question" ? { ...m, only: "has_topic" as const } : m)),
  },
  {
    // No Message, since the words were given. The same goes for Conviction,
    // which reads the words too, so Presence here is the eyes and the face.
    activityId: ACTIVITY_IDS.script,
    number: TAKE_NUMBER,
    gate: "Read 80%+ of the script (70% if English isn't your first language)",
    moves: [...moves(TAKE_VOICE, "main"), { leaf: "read_accuracy", weight: "main" }, ...moves(TAKE_CLARITY, "partial"), ...moves(["on_lens", "long_lookaways", "face_movement"], "partial")],
  },
  { activityId: ACTIVITY_IDS.skillCheck, number: "Sets starting values for every leaf it touches", moves: [], dynamic: "seeds_starting_values" },
  { activityId: ACTIVITY_IDS.checkpoint, number: "A 1-minute rep, scored on the unit's target leaf", gate: "Pass at 70 (tune); units whose target is on probation finish on lessons alone until it passes", moves: [], dynamic: "unit_target" },
];

// -----------------------------------------------------------------------------
// Reading and voice drills
// -----------------------------------------------------------------------------

const LINE_NUMBER = "Marks matched; words read; pause at pause marks; peak on stressed words";
const LINE_MOVES: [LeafId, Dots][] = [["where_to_stress", 2], ["read_accuracy", 2], ["deliberate_pauses", 2], ["stress_right_words", 2]];

const READING: GridRow[] = [
  row(drillActivityId("twister"), "Accuracy × speed factor", [["speed_clarity", 3], ["read_accuracy", 2]], "Accuracy"),
  row(drillActivityId("minimal_pairs"), "% recognized", [["tricky_sounds", 3]], "Accuracy"),
  row(drillActivityId("pace_reading"), "In band × accuracy", [["pace_control", 3], ["read_accuracy", 1]], "70%+ accuracy"),
  row(drillActivityId("pause_reading"), "Pauses at marks ÷ marks", [["deliberate_pauses", 3], ["read_accuracy", 1]], "70%+ accuracy"),
  {
    activityId: drillActivityId("shadowing"),
    number: "Accuracy; later, timing against the model",
    gate: "Claims only what it measures: words",
    moves: [
      { leaf: "read_accuracy", weight: "partial" },
      { leaf: "rhythm", weight: "light", only: "timing_exists" },
    ],
  },
  row(drillActivityId("marked_reading"), LINE_NUMBER, LINE_MOVES, "Words read"),
  row(ACTIVITY_IDS.phrasebook, LINE_NUMBER, LINE_MOVES, "Words read"),
  row(drillActivityId("move_it"), "Lift over your plain take", [["pitch_variety", 3], ["stand_out_stress", 3]], "Line heard"),
  row(drillActivityId("projection"), "% at target, against your own normal that session", [["volume_carry", 3]], "Words heard"),
  row(drillActivityId("breath_count"), "Count ÷ target", [["breath_length", 3]], "A silence gap ends the count"),
];

// -----------------------------------------------------------------------------
// Thinking drills
// -----------------------------------------------------------------------------

const THINKING: GridRow[] = [
  row(drillActivityId("category_fluency"), "Checked words ÷ target", [["word_retrieval", 3]], "Each word checked against the category"),
  row(drillActivityId("letter_fluency"), "Words on the letter ÷ target", [["word_retrieval", 3]], "Already sound"),
  row(drillActivityId("word_chain"), "Links that connect ÷ target, minus resets", [["word_links", 3], ["bouncing_back", 1]], "Links checked by phone or Tono AI"),
  row(drillActivityId("chain_bridge"), "Explained links ÷ target", [["explains_why", 3], ["word_links", 1]], "Needs a judge"),
  row(drillActivityId("random_word_story"), "Required words + coherence or rubric", [["story", 3], ["word_retrieval", 1]], "Coherence check"),
  row(drillActivityId("just_a_minute"), "Slips and talk time", [["stalls", 3], ["ums_uhs", 2], ["starting_fast", 2]], "On-topic, no heavy repetition"),
  row(drillActivityId("sum_up"), "Limits × content", [["within_limits", 3], ["keeps_core", 3]], "Content multiplies the score"),
  row(drillActivityId("relay"), "Key words + limits", [["keeps_core", 3], ["within_limits", 2]], "Key words hit"),
  row(drillActivityId("explain_simple"), "Plainness × accuracy", [["plain_words", 3], ["within_limits", 2], ["ideas_connect", 2]], "Key term or similarity"),
];

// -----------------------------------------------------------------------------
// Conversation drills. Reply length of 3+ words is the gate for all of them.
// -----------------------------------------------------------------------------

const REPLY_GATE = "Reply length of 3+ words";

const CONVERSATION: GridRow[] = [
  row(drillActivityId("conv_reply"), "Timing", [["reply_start", 3], ["keeps_replying", 2]], REPLY_GATE),
  row(drillActivityId("conv_beat"), "Beat held in the window", [["bouncing_back", 2], ["reply_start", 1]], REPLY_GATE),
  row(drillActivityId("conv_thread"), "Asked + used their words", [["follow_ups", 3]], REPLY_GATE),
  row(drillActivityId("conv_held"), "Asked + used their words", [["follow_ups", 3]], REPLY_GATE),
  row(drillActivityId("conv_outsider"), "Asked + used their words", [["follow_ups", 3], ["open_questions", 2]], REPLY_GATE),
  row(drillActivityId("conv_echo"), "Beats ÷ required", [["echo", 3], ["follow_ups", 1], ["hand_back", 1]], REPLY_GATE),
  row(drillActivityId("conv_group"), "Turns taken ÷ turns", [["join_in", 3], ["reply_start", 1]], REPLY_GATE),
  row(drillActivityId("conv_replay"), "Timing", [["bouncing_back", 3]], REPLY_GATE),
  row(drillActivityId("land_plane"), "Point first + in time + no trail-off", [["point_first", 3], ["within_limits", 3], ["clear_endings", 2]], REPLY_GATE),
  row(drillActivityId("squeeze"), "Words kept + in time", [["keeps_core", 3], ["within_limits", 2]], REPLY_GATE),
  row(drillActivityId("callback"), "Called back + replies", [["callbacks", 3]], REPLY_GATE),
  row(drillActivityId("conv_react"), "Replied in time; the self-rating is dropped", [["reactions", 3]], REPLY_GATE),
  row(drillActivityId("conv_live"), "Per-turn scores (exists), plus a listening verdict in the debrief", [["reply_start", 2], ["keeps_replying", 2], ["follow_ups", 2], ["hand_back", 2], ["reactions", 1]], REPLY_GATE),
];

// -----------------------------------------------------------------------------
// The 26 guided exercises. These turn on the mic (3c.1); "said" is saidRatio.
// -----------------------------------------------------------------------------

const GUIDED_ROWS: GridRow[] = [
  row(guidedActivityId("gd_reappraisal"), "Said twice 40, second louder 20, how energized 40", [["settling", 2], ["volume_carry", 1]]),
  row(guidedActivityId("gd_breath_reset"), "Long out-breaths done 50, line said unhurried 50", [["settling", 3]]),
  row(guidedActivityId("gd_phrase_breath"), "Pauses at bars ÷ bars, over 2 reads", [["deliberate_pauses", 3], ["breath_length", 1]]),
  row(guidedActivityId("gd_breath_volume"), "Last word within 6 dB 70, third read louder 30", [["volume_carry", 3]]),
  row(guidedActivityId("gd_power_pause"), "2-second holds and post-point pauses ÷ 6", [["deliberate_pauses", 3]]),
  row(guidedActivityId("gd_rate_contrast"), "Fast speed ÷ slow speed; 1.5+ = 100", [["pace_control", 3]]),
  row(guidedActivityId("gd_emphasis"), "Reads with the loudest word on the asked word ÷ reads", [["stress_right_words", 3]]),
  row(guidedActivityId("gd_catch_um"), "Ums in the second 30s vs the first", [["ums_uhs", 3]]),
  row(guidedActivityId("gd_inflection"), "End of line falls or rises as asked, % right", [["endings_fall", 3]]),
  row(guidedActivityId("gd_rhythm"), "Versions with the right pause pattern ÷ 3", [["rhythm", 3]]),
  row(guidedActivityId("gd_emotion_read"), "Difference across 4 reads", [["range_feelings", 3]]),
  row(guidedActivityId("gd_attention_check"), "Named 3 things aloud 60, how easy 40", [["outward_focus", 3]]),
  row(guidedActivityId("gd_spark"), "Asked a question using a word from a clip the app plays (today: \"find a podcast\")", [["follow_ups", 3]]),
  row(guidedActivityId("gd_drop_rehearsal"), "Said an if-then plan 70, confidence 30", [["outward_focus", 2]]),
  row(guidedActivityId("gd_liking_gap"), "Prediction now 50; actual at or under it later 50", [["forecast_gap", 3]]),
  row(guidedActivityId("gd_good_enough"), "Replies said ÷ 3", [["reactions", 2], ["reply_start", 1]]),
  row(guidedActivityId("gd_story_questions"), "Open questions ÷ 3", [["open_questions", 3]]),
  row(guidedActivityId("gd_me_too"), "Tries with 1–2 sentences and a question ÷ 2", [["hand_back", 3]]),
  row(guidedActivityId("gd_recover"), "Lines said unhurried ÷ 3", [["recovery_lines", 3]]),
  row(guidedActivityId("gd_detours"), "Clean final try 60, one-sentence point 40", [["no_detours", 3], ["point_first", 1]]),
  row(guidedActivityId("gd_offer_more"), "Tries with 1–2 sentences and an offer ÷ 2", [["within_limits", 3], ["hand_back", 1]]),
  row(guidedActivityId("gd_exaggerate"), "Replied in time ÷ 3; rubric if judged", [["playfulness", 2]]),
  row(guidedActivityId("gd_kind_tease"), "Asked a question + lines said; rubric if judged", [["playfulness", 2], ["follow_ups", 1]]),
  row(guidedActivityId("gd_buy_time"), "Restated + short answer ÷ 3", [["starting_fast", 3], ["point_first", 2]]),
  row(guidedActivityId("gd_opener"), "Comment then question ÷ 3", [["start_leave", 3]]),
  row(guidedActivityId("gd_exit"), "Beats found ÷ 6", [["start_leave", 3]]),
];

// -----------------------------------------------------------------------------
// Warm-ups
// -----------------------------------------------------------------------------

const WARM_UP_ROWS: GridRow[] = [
  row(warmupActivityId("wu_low_breath"), "Rounds finished ÷ rounds (a silent breath can't be heard)", [["settling", 1]]),
  row(warmupActivityId("wu_sigh"), "Rounds finished ÷ rounds (a silent breath can't be heard)", [["settling", 1]]),
  row(warmupActivityId("wu_hiss"), "Seconds of steady sound ÷ 10, and how even it was", [["breath_length", 3]]),
  row(warmupActivityId("wu_articulators"), "Pa-ta-ka syllables a second; 5+ = 100", [["speed_clarity", 2]]),
  row(warmupActivityId("wu_resonance"), "Lowest-to-highest siren in semitones; 12+ = 100", [["pitch_variety", 1]]),
];

// -----------------------------------------------------------------------------
// Personal and real-world
// -----------------------------------------------------------------------------

const PERSONAL: GridRow[] = [
  {
    ...row(ACTIVITY_IDS.rewind, "Parts of the day ÷ 3 (40), details a minute (40), talk time (20); Tono AI's checked coverage replaces the keywords", [["specifics", 3], ["ums_uhs", 1], ["like_actually", 1], ["stalls", 1]]),
    note: "The filler and stall moves have a switch in Settings",
  },
  row(ACTIVITY_IDS.feeling, "Different feeling words; seconds spoken. A count, not a grade.", [["feeling_words", 3]]),
  row(ACTIVITY_IDS.threeThings, "Different items ÷ 3 (50), said aloud (50)", [["self_kindness", 3]]),
  row(ACTIVITY_IDS.talkBack, "Steps ÷ 6 (40), belief drop (40), fairer line said (20)", [["reframing", 3]]),
  row(ACTIVITY_IDS.prime, "Fields filled ÷ 6; questions open", [["open_questions", 1], ["forecast_gap", 1]]),
  row(ACTIVITY_IDS.debrief, "Predicted vs actual; fields filled; blanks named", [["real_world", 3], ["forecast_gap", 3]]),
  row(ACTIVITY_IDS.eventBefore, "Nerves + focus written", [["nerves_trend", 1]]),
  row(ACTIVITY_IDS.eventAfter, "How it went, focus done, nerves vs forecast, fields filled", [["real_world", 3], ["nerves_trend", 3], ["forecast_gap", 3]]),
  {
    ...row(ACTIVITY_IDS.mission, "Logged ÷ target", [["missions", 3]]),
    note: "Plus the mission's own leaf ● (for example, \"Ask two follow-ups\" feeds Follow-up questions)",
  },
  row(ACTIVITY_IDS.comfort, "1–5 slider", [["nerves_trend", 2]]),
  row(ACTIVITY_IDS.attention, "0–10 before vs after", [["outward_focus", 2]]),
  {
    activityId: ACTIVITY_IDS.review,
    number: "Gap on the track",
    moves: [{ leaf: "felt_measured", weight: "light", displayOnly: true }],
    note: "Felt vs measured: Self-view, display only for now",
  },
  row(ACTIVITY_IDS.speechStudy, "% of words followed", [["read_accuracy", 2]]),
  row(ACTIVITY_IDS.rehearse, "% of words followed", [["read_accuracy", 2]]),
  row(ACTIVITY_IDS.planPoint, "Fields filled ÷ 3", [["has_shape", 1]]),
];

// What the skill check touches, to set starting values on: its read-aloud, its
// category sprint, its partner line, and its talk, which is a take.
export const SKILL_CHECK_LEAVES: LeafId[] = [...new Set<LeafId>(["read_accuracy", "word_retrieval", "reply_start", "follow_ups", ...TAKE_VOICE, ...TAKE_CLARITY, ...TAKE_PRESENCE, ...TAKE_MESSAGE])];

export const GRID_ROWS: GridRow[] = [...TAKES, ...READING, ...THINKING, ...CONVERSATION, ...GUIDED_ROWS, ...WARM_UP_ROWS, ...PERSONAL];

// -----------------------------------------------------------------------------
// Lessons (Appendix A). A lesson is built from its steps, and shows "Target met"
// when its target leaf hits 70 (tune).
// -----------------------------------------------------------------------------

export const LESSON_TARGETS: Record<string, LeafId> = {
  // Message
  imp_1_retrieval: "word_retrieval",
  imp_chain: "explains_why",
  imp_2_minute: "starting_fast",
  imp_11_sum: "keeps_core",
  imp_12_relay: "keeps_core",
  imp_13_simple: "plain_words",
  imp_3_prep: "hits_beats",
  imp_4_wsn: "hits_beats",
  imp_8_psb: "hits_beats",
  imp_5_ppf: "hits_beats",
  imp_9_star: "hits_beats",
  imp_15_side: "has_shape",
  imp_6_story: "story",
  imp_7_three: "hits_beats",
  imp_10_surprise: "starting_fast",
  imp_14_angle: "answers_question",
  conv_14_headline: "point_first",
  conv_15_land: "within_limits",
  conv_16_squeeze: "keeps_core",
  conv_17_detours: "no_detours",
  conv_18_offer: "within_limits",
  // Voice
  cad_1_pace: "speaking_rate",
  cad_2_slow: "pace_control",
  cad_3_pause: "sentence_ends",
  cad_4_power_pause: "deliberate_pauses",
  cad_7_inflection: "endings_fall",
  cad_8_range: "pitch_variety",
  cad_9_rhythm: "rhythm",
  cad_5_emphasis: "stress_right_words",
  // "Read accuracy, for now": Shadowing claims only words until it has timing.
  cad_6_shadow: "read_accuracy",
  cad_10_move: "stand_out_stress",
  cad_11_markup: "where_to_stress",
  con_2_breath: "breath_length",
  con_b2_phrase: "deliberate_pauses",
  con_b3_steady: "breath_length",
  con_b4_volume: "volume_carry",
  con_3_project: "volume_carry",
  // Connection
  conv_6_echo: "echo",
  conv_7_thread: "follow_ups",
  conv_8_story: "open_questions",
  conv_9_metoo: "hand_back",
  conv_10_hold: "follow_ups",
  conv_12_outsider: "follow_ups",
  conv_13_group: "join_in",
  conv_23_open: "start_leave",
  conv_24_exit: "start_leave",
  conv_19_react: "reactions",
  conv_20_callback: "callbacks",
  conv_21_exaggerate: "playfulness",
  conv_22_tease: "playfulness",
  // Clarity
  art_1_wake: "speed_clarity",
  art_2_finish: "tricky_sounds",
  art_3_s_sh: "tricky_sounds",
  art_4_r_l: "tricky_sounds",
  art_5_th: "tricky_sounds",
  art_6b_clusters: "tricky_sounds",
  art_6_speed: "speed_clarity",
  cad_12_fillers: "ums_uhs",
  // Composure
  con_b5_calm: "settling",
  con_1_excited: "settling",
  conv_11_recover: "recovery_lines",
  conv_1_check: "outward_focus",
  conv_2_spark: "outward_focus",
  conv_3_safety: "outward_focus",
  conv_4_gap: "forecast_gap",
  conv_5_enough: "outward_focus",
  // Presence
  con_4_hedges: "hedges",
  con_5_endings: "clear_endings",
  con_8_case: "clear_endings",
  con_6_lens: "on_lens",
  con_7_face: "range_feelings",
};

const LESSON_ROWS: GridRow[] = LESSONS.map((lesson) => ({ activityId: lessonActivityId(lesson.id), number: "The average of its steps", moves: [] }));

const BY_ACTIVITY = new Map<string, GridRow>([...GRID_ROWS, ...LESSON_ROWS].map((r) => [r.activityId, r]));

export function getGridRow(activityId: string): GridRow | undefined {
  return BY_ACTIVITY.get(activityId);
}

// A checkpoint closes a unit by testing what most of the unit's lessons aim at:
// the commonest target, and the earliest lesson's on a tie.
export function unitTargetLeaf(unitId: string): LeafId | null {
  const counts = new Map<LeafId, number>();
  for (const lesson of lessonsInUnit(unitId)) {
    const target = LESSON_TARGETS[lesson.id];
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  let best: LeafId | null = null;
  for (const [target, n] of counts) if (best == null || n > counts.get(best)!) best = target;
  return best;
}

// What a move is worth for an attempt checked by a phone estimate, a judge or
// you. A content leaf moves ● at most from a phone estimate (plan 6.4, rule 5):
// the phone can't judge meaning. What you say about yourself moves only inner
// leaves (rule 6). Everything else moves as the grid says.
export type EvidenceSource = "measured" | "phone_estimate" | "judge" | "self";

export function effectiveWeight(move: LeafMove, source: EvidenceSource): number {
  if (move.displayOnly) return 0;
  if (source === "self" && !isInnerLeaf(move.leaf)) return 0;
  const weight = GRID_WEIGHTS[move.weight];
  if (source === "phone_estimate" && isContentLeaf(move.leaf)) return Math.min(weight, GRID_WEIGHTS.light);
  return weight;
}
