import { readingCounts, type ReadingId, type ReadingPreview } from "../signalLab/readingTrust";
import type { SkillId } from "../../theme/tokens";

// The skill tree (docs/overhaul/PLAN.md, sections 6.1 and 6.2, and Appendix C):
// Overall, 6 pillars, 26 secondary skills, 63 leaves. A leaf is always one
// number and has one parent. Evidence lands on leaves; everything above is a
// weighted average, worked out rather than stored. A test compares this file
// with Appendix C, so the weights can't change without the plan changing too.
// Pure data, plus lookups.

// How a leaf is measured, as the plan designed it.
// now: from words and timing. probation/tuning: a reading that must pass Signal
// Lab first (see `reading` and leafCounts). judge: about meaning, scored 0-5.
// phone+judge: the phone checks part, a judge the rest. self: you report it,
// valid for inner states only. count: things that happened, counted.
export type LeafTrust = "now" | "probation" | "tuning" | "judge" | "phone+judge" | "self" | "count";

export interface LeafDef {
  id: string;
  name: string;
  // Share of its parent, in percent.
  weight: number;
  trust: LeafTrust;
  // The Signal Lab reading behind a probation or tuning leaf.
  reading?: ReadingId;
}

const leaf = <Id extends string>(id: Id, name: string, weight: number, trust: LeafTrust, reading?: ReadingId) => ({ id, name, weight, trust, reading });

export const SKILL_TREE = [
  {
    id: "message",
    name: "Message",
    weight: 25,
    skills: [
      { id: "point", name: "Point", weight: 25, leaves: [leaf("answers_question", "Answers the question", 60, "judge"), leaf("point_first", "Point first", 40, "phone+judge")] },
      { id: "structure", name: "Structure", weight: 20, leaves: [leaf("has_shape", "Has a shape", 50, "judge"), leaf("hits_beats", "Hits the beats", 50, "phone+judge")] },
      { id: "coherence", name: "Coherence", weight: 15, leaves: [leaf("ideas_connect", "Ideas connect", 60, "judge"), leaf("explains_why", "Explains why", 40, "judge")] },
      {
        id: "concision",
        name: "Concision",
        weight: 15,
        leaves: [leaf("within_limits", "Within limits", 35, "now"), leaf("keeps_core", "Keeps the core", 35, "phone+judge"), leaf("plain_words", "Plain words", 15, "now"), leaf("no_detours", "No detours", 15, "now")],
      },
      { id: "quick_thinking", name: "Quick thinking", weight: 15, leaves: [leaf("word_retrieval", "Word retrieval", 40, "phone+judge"), leaf("word_links", "Word links", 30, "phone+judge"), leaf("starting_fast", "Starting fast", 30, "now")] },
      { id: "detail", name: "Detail", weight: 10, leaves: [leaf("specifics", "Specifics", 50, "phone+judge"), leaf("story", "Story", 30, "phone+judge"), leaf("feeling_words", "Feeling words", 20, "now")] },
    ],
  },
  {
    id: "voice",
    name: "Voice",
    weight: 20,
    skills: [
      { id: "pace", name: "Pace", weight: 30, leaves: [leaf("speaking_rate", "Speaking rate", 50, "now"), leaf("pace_control", "Pace control", 30, "now"), leaf("rhythm", "Rhythm", 20, "now")] },
      { id: "pauses", name: "Pauses", weight: 30, leaves: [leaf("sentence_ends", "At sentence ends", 60, "probation", "sentence_end_pauses"), leaf("deliberate_pauses", "Deliberate pauses", 40, "probation", "deliberate_pauses")] },
      { id: "melody", name: "Melody", weight: 15, leaves: [leaf("pitch_variety", "Pitch variety", 60, "probation", "pitch_variety"), leaf("endings_fall", "Endings that fall", 40, "probation", "endings_fall")] },
      {
        id: "emphasis",
        name: "Emphasis",
        weight: 15,
        leaves: [leaf("stand_out_stress", "Stand-out stress", 50, "probation", "stand_out_stress"), leaf("stress_right_words", "Stress on the right words", 30, "probation", "stress_right_words"), leaf("where_to_stress", "Knowing where to stress", 20, "now")],
      },
      { id: "power", name: "Power", weight: 10, leaves: [leaf("breath_length", "Breath length", 50, "now"), leaf("volume_carry", "Volume carry", 50, "probation", "volume_carry")] },
    ],
  },
  {
    id: "connection",
    name: "Connection",
    weight: 20,
    skills: [
      { id: "responsiveness", name: "Responsiveness", weight: 30, leaves: [leaf("reply_start", "Reply start", 50, "now"), leaf("keeps_replying", "Keeps replying", 50, "now")] },
      { id: "curiosity", name: "Curiosity", weight: 30, leaves: [leaf("follow_ups", "Follow-up questions", 40, "now"), leaf("open_questions", "Open questions", 30, "now"), leaf("echo", "Echo", 30, "now")] },
      { id: "turn_taking", name: "Turn-taking", weight: 25, leaves: [leaf("hand_back", "Hand it back", 40, "now"), leaf("join_in", "Join in", 30, "now"), leaf("start_leave", "Start and leave", 30, "phone+judge")] },
      { id: "warmth", name: "Warmth and play", weight: 15, leaves: [leaf("reactions", "Reactions", 40, "now"), leaf("callbacks", "Callbacks", 40, "now"), leaf("playfulness", "Playfulness", 20, "judge")] },
    ],
  },
  {
    id: "clarity",
    name: "Clarity",
    weight: 15,
    skills: [
      { id: "clear_words", name: "Clear words", weight: 40, leaves: [leaf("read_accuracy", "Read accuracy", 40, "now"), leaf("tricky_sounds", "Tricky sounds", 30, "now"), leaf("speed_clarity", "Speed with clarity", 30, "now")] },
      { id: "fillers", name: "Fillers", weight: 35, leaves: [leaf("ums_uhs", "Ums and uhs", 70, "now"), leaf("like_actually", "Like, actually", 30, "now")] },
      { id: "flow", name: "Flow", weight: 25, leaves: [leaf("stalls", "Stalls", 60, "now"), leaf("restarts", "Restarts and repeats", 40, "now")] },
    ],
  },
  {
    id: "presence",
    name: "Presence",
    weight: 10,
    skills: [
      { id: "eye_contact", name: "Eye contact", weight: 40, leaves: [leaf("on_lens", "On the lens", 70, "tuning", "on_the_lens"), leaf("long_lookaways", "Long look-aways", 30, "tuning", "long_lookaways")] },
      { id: "conviction", name: "Conviction", weight: 35, leaves: [leaf("hedges", "Hedges", 50, "now"), leaf("clear_endings", "Clear endings", 50, "now")] },
      { id: "expression", name: "Expression", weight: 25, leaves: [leaf("face_movement", "Face movement", 60, "tuning", "face_movement"), leaf("range_feelings", "Range across feelings", 40, "probation", "range_across_feelings")] },
    ],
  },
  {
    id: "composure",
    name: "Composure",
    weight: 10,
    skills: [
      { id: "nerves", name: "Nerves", weight: 35, leaves: [leaf("nerves_trend", "Nerves trend", 50, "self"), leaf("forecast_gap", "Forecast gap", 30, "self"), leaf("settling", "Settling", 20, "self")] },
      { id: "self_talk", name: "Self-talk", weight: 25, leaves: [leaf("reframing", "Reframing", 50, "self"), leaf("self_kindness", "Self-kindness", 25, "count"), leaf("outward_focus", "Outward focus", 25, "self")] },
      { id: "courage", name: "Courage", weight: 25, leaves: [leaf("real_world", "Real-world reps", 70, "count"), leaf("missions", "Missions", 30, "count")] },
      { id: "recovery", name: "Recovery", weight: 15, leaves: [leaf("bouncing_back", "Bouncing back", 60, "now"), leaf("recovery_lines", "Recovery lines", 40, "now")] },
      // 0% for now: shown, not counted.
      { id: "self_view", name: "Self-view", weight: 0, leaves: [leaf("felt_measured", "Felt vs measured", 100, "probation")] },
    ],
  },
] as const;

type Tree = typeof SKILL_TREE;
export type PillarId = Tree[number]["id"];
export type SkillNodeId = Tree[number]["skills"][number]["id"];
export type LeafId = Tree[number]["skills"][number]["leaves"][number]["id"];

export interface LeafNode extends LeafDef {
  id: LeafId;
  skillId: SkillNodeId;
  pillarId: PillarId;
}

export const LEAVES: LeafNode[] = SKILL_TREE.flatMap((pillar) =>
  pillar.skills.flatMap((skill) => (skill.leaves as readonly LeafDef[]).map((l) => ({ ...l, id: l.id as LeafId, skillId: skill.id as SkillNodeId, pillarId: pillar.id as PillarId }))),
);

const LEAF_BY_ID = new Map(LEAVES.map((l) => [l.id, l]));

export function getLeaf(id: LeafId): LeafNode {
  return LEAF_BY_ID.get(id)!;
}

// The numbers that sit alongside the tree in Appendix C.
export const STARTING_VALUE = 25;
export const SKILL_CHECK_SEED = { min: 15, max: 45 } as const;
export const SCORE_SCALE = { min: 0, max: 100 } as const;
export const JUDGED_SCALE = { min: 0, max: 5, multiplier: 20 } as const;
// A take's own score: the pillars a take can show.
export const TAKE_WEIGHTS = { message: 40, voice: 20, clarity: 20, presence: 20 } as const;

// Whether a leaf counts towards a score right now. A leaf built on a reading
// follows that reading's status (signalLab/readingTrust.ts), which is the only
// place a reading goes live. Felt vs measured has no reading and only shows.
export function leafCounts(id: LeafId, preview?: ReadingPreview): boolean {
  const def = getLeaf(id);
  if (def.reading) return readingCounts(def.reading, preview);
  return def.trust !== "probation" && def.trust !== "tuning";
}

// A leaf about meaning: a phone estimate of it counts only lightly (plan 6.4,
// rule 5).
export function isContentLeaf(id: LeafId): boolean {
  const { trust } = getLeaf(id);
  return trust === "judge" || trust === "phone+judge";
}

// An inner state or a count of what happened: the only leaves a number you
// report yourself can move (plan 6.4, rule 6).
export function isInnerLeaf(id: LeafId): boolean {
  const { trust } = getLeaf(id);
  return trust === "self" || trust === "count";
}

// If your profile says you stutter, Fillers and Flow don't count (plan 6.2).
export const STUTTER_EXCLUDED: readonly LeafId[] = LEAVES.filter((l) => l.skillId === "fillers" || l.skillId === "flow").map((l) => l.id);

// The screens still group by the five old skills until phase 5. Each is now its
// pillar's score (plan 6.2, "How old skills map"), so nothing is stored twice.
// Composure has no old skill: it shows only on the trail until the You tab.
export const PILLAR_OF_SKILL: Record<SkillId, PillarId> = {
  articulation: "clarity",
  cadence: "voice",
  impromptu: "message",
  confidence: "presence",
  conversation: "connection",
};

export function skillOfPillar(pillar: PillarId): SkillId | null {
  const found = (Object.entries(PILLAR_OF_SKILL) as [SkillId, PillarId][]).find(([, p]) => p === pillar);
  return found ? found[0] : null;
}

export function nodeName(id: string): string {
  if (id === "overall") return "Overall";
  for (const pillar of SKILL_TREE) {
    if (pillar.id === id) return pillar.name;
    for (const skill of pillar.skills) if (skill.id === id) return skill.name;
  }
  return LEAF_BY_ID.get(id as LeafId)?.name ?? id;
}
