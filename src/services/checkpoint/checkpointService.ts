import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation";
import { getUnit } from "../../content/lessons";
import { afterSkip, afterTry, checkpointRep, CHECKPOINT_PREP_SECONDS, CHECKPOINT_SECONDS, type CheckpointRecords } from "../../domain/checkpoint";
import { launchStep } from "../practice/launchStep";
import { pickRandomPrompt } from "../../domain/pickTodaysPrompt";
import { isFreeRecordPrompt } from "../../data/topics";
import { getAllPrompts } from "../db/promptsRepo";
import { getRecentlyUsedPromptIds } from "../db/sessionsRepo";
import { getCheckpointRecords, setCheckpointRecords } from "../prefs/prefsStore";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { logger } from "../../utils/logger";

// A unit's tier is 1 to 3; prompts are easy, medium or hard.
const UNIT_PROMPT_TIER = { 1: "easy", 2: "medium", 3: "hard" } as const;

type Nav = NavigationProp<RootStackParamList>;

// Starts a unit's checkpoint (domain/checkpoint.ts): the unit's own drill, or for a
// unit whose target a talk shows, a one-minute impromptu rep that the take pipeline
// recognises (checkpointUnitId on the take) and settles on the unit's target leaf.
// The prompt is an ordinary one at the unit's tier.
export async function startCheckpoint(navigation: Nav, unitId: string): Promise<void> {
  const unit = getUnit(unitId);
  const rep = checkpointRep(unitId);
  if (!unit || !rep) return;
  // The unit's own drill, passed at 70 on its number (settled when its result is done).
  if (rep.kind === "step") {
    await launchStep(navigation, rep.step, { checkpointUnitId: unitId });
    return;
  }
  const [prompts, recent] = await Promise.all([getAllPrompts(), getRecentlyUsedPromptIds(20)]);
  const all = prompts.filter((p) => !isFreeRecordPrompt(p.id));
  const tiered = all.filter((p) => p.difficultyTier === UNIT_PROMPT_TIER[unit.tier]);
  const prompt = pickRandomPrompt(tiered.length >= 5 ? tiered : all, recent, all.find((p) => p.id === recent[0])?.category);
  navigation.navigate("Recording", {
    kind: "prompt",
    prompt,
    checkpointUnitId: unitId,
    targetSeconds: CHECKPOINT_SECONDS,
    prepSeconds: CHECKPOINT_PREP_SECONDS,
  });
}

export function skipCheckpoint(unitId: string, now = new Date()): CheckpointRecords {
  const next = afterSkip(getCheckpointRecords(), unitId, now.toISOString());
  setCheckpointRecords(next);
  return next;
}

// A checkpoint rep has been scored. `score` is the target leaf's number from the
// take (0 to 100), or null when the take wasn't scored; an unscored rep isn't a
// try. Tells the person how it went.
export function settleCheckpoint(unitId: string, score: number | null, now = new Date()): { passed: boolean | null } {
  const result = afterTry(getCheckpointRecords(), unitId, score, now.toISOString());
  if (result.passed == null) {
    showGlobalToast("That checkpoint rep couldn't be scored, so it doesn't count. Try again from Learn.", "info");
    return { passed: null };
  }
  setCheckpointRecords(result.records);
  const title = getUnit(unitId)?.title ?? "this unit";
  logger.info(`[checkpoint] ${unitId}: ${result.score} (${result.passed ? "passed" : "not yet"})`);
  showGlobalToast(
    result.passed ? `Checkpoint passed: ${title} · ${result.score}` : `Checkpoint: ${result.score} of 70 needed for ${title}. Try again any time from Learn.`,
    result.passed ? "success" : "info",
  );
  return { passed: result.passed };
}
