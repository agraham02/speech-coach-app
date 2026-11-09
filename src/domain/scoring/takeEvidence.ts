import { LESSON_TARGETS, unitTargetLeaf } from "../../content/skillGrid";
import type { AttemptEvidence, LeafEvidence } from "./leafEvidence";
import { getLeaf, type LeafId } from "./skillTree";
import type { TakeLeafReadings } from "./takeLeaves";

// A take's move on the tree: each leaf's own number, the lesson's target ×1.5,
// and the conditions the grid asks about. Pure.

export interface TakeEvidenceInput {
  activityId: string;
  readings: TakeLeafReadings;
  lessonId: string | null;
  // The unit this rep is the checkpoint of: it moves that unit's target leaf only.
  checkpointUnitId?: string | null;
  noPrep: boolean;
  hasTopic: boolean;
  // Scales the Message leaves: research makes it a prepared answer.
  messageScale: number;
  // Feeling of the week: a count of different feeling words, not a grade.
  feelingWords: number | null;
}

const FEELING_WORDS_FULL = 5;

export function takeEvidence(input: TakeEvidenceInput): Omit<AttemptEvidence, "difficulty"> {
  const leafScores: Partial<Record<LeafId, LeafEvidence>> = {};
  for (const [leaf, reading] of Object.entries(input.readings) as [LeafId, TakeLeafReadings[LeafId]][]) {
    if (reading) leafScores[leaf] = { score: reading.score / 100, source: reading.source };
  }
  if (input.feelingWords != null) leafScores.feeling_words = { score: Math.min(1, input.feelingWords / FEELING_WORDS_FULL), source: "measured" };
  const scores = Object.values(leafScores).map((l) => l!.score);
  return {
    activityId: input.activityId,
    // The attempt's own number, for the rep's staircase and the history.
    score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    leafScores,
    source: "measured",
    targetLeaf: input.checkpointUnitId ? unitTargetLeaf(input.checkpointUnitId) : input.lessonId ? LESSON_TARGETS[input.lessonId] ?? null : null,
    conditions: { no_prep: input.noPrep, has_topic: input.hasTopic },
    scale: input.messageScale === 1 ? undefined : (leaf) => (getLeaf(leaf).pillarId === "message" ? input.messageScale : 1),
  };
}
