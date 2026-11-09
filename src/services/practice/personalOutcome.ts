import { recordAttempt } from "../db/leafRepo";
import { emitStageEarned } from "../progress/progressEvents";
import { skillOfPillar, type PillarId } from "../../domain/scoring/skillTree";
import type { Trail } from "../../domain/scoring/rollup";
import type { PersonalScore } from "../../domain/personal/personalScores";
import { logger } from "../../utils/logger";

// Moves the tree for a personal or real-world activity (task 3c.4): Rewind,
// Three things, Talk back, a Moment, a mission, the comfort check-in. Most of
// these are your own count or rating, so each leaf says who checked it and a
// self-report moves inner leaves only. A `ref` makes one Rewind or one day of
// Three things count once, however often it's saved.

// What a reflection is scored against until 3d.5 gives each one its own
// difficulty: the bar Steady asks for (plan 6.3).
export const PERSONAL_DIFFICULTY = 3;

export async function recordPersonalOutcome(args: {
  activityId: string;
  label: string;
  scored: PersonalScore;
  difficulty?: number;
  ref?: string;
  // Read from the live recognizer, not Whisper: every move counts light.
  quick?: boolean;
}): Promise<{ trail: Trail | null } | null> {
  if (args.scored.score == null && !Object.keys(args.scored.leafScores).length) return null;
  try {
    const result = await recordAttempt({
      evidence: {
        activityId: args.activityId,
        score: args.scored.score,
        leafScores: args.scored.leafScores,
        difficulty: args.difficulty ?? PERSONAL_DIFFICULTY,
        source: "self",
        ...(args.quick ? { quick: true } : {}),
      },
      label: args.label,
      kind: "personal",
      ref: args.ref,
    });
    for (const up of result.stageUps) {
      const skill = skillOfPillar(up.nodeId as PillarId);
      if (skill) emitStageEarned({ skill, stage: up.stageAfter, speakerLevel: result.levelAfter > result.levelBefore ? result.levelAfter : null });
    }
    return { trail: result.trail };
  } catch (error) {
    logger.warn(`[personal] ${args.activityId} didn't move the tree — ${(error as Error).message}`);
    return null;
  }
}
