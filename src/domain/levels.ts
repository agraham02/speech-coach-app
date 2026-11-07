// The levels you can see (docs/overhaul/PLAN.md, section 6.3). Any node of the
// skill tree has a score, 0-100, that falls into one of five named stages. Stages
// are earned: they take practice and, higher up, good attempts at a hard enough
// difficulty. Once reached they stay, even if the score dips: a dip shows as "a
// bit rusty", never as a demotion. Overall's score gives your level, 1 to 25,
// which also never drops, and is the only thing called "level". A test compares
// these numbers with Appendix C. Pure.

export type Stage = 1 | 2 | 3 | 4 | 5;

export const STAGE_NAMES: Record<Stage, string> = {
  1: "Foundations",
  2: "Building",
  3: "Steady",
  4: "Strong",
  5: "Polished",
};

// What each stage means, in one line — the same for every skill.
export const STAGE_MEANING: Record<Stage, string> = {
  1: "Learning what good sounds like.",
  2: "It shows up when you think about it.",
  3: "It holds up in most of your takes.",
  4: "It holds up on harder prompts, too.",
  5: "It's automatic — even under pressure.",
};

// The score each stage starts at. A steady 80% settles near 10 × difficulty +
// 20, so about 50 at difficulty 3 (Steady), 70 at 5 (Strong) and 80 at 6
// (Polished). The skill check seeds 15-45, so nobody starts above Building.
export const STAGE_FLOORS: Record<Stage, number> = { 1: 0, 2: 35, 3: 48, 4: 62, 5: 80 };

// Scored attempts in a skill before its stage can be earned by practice.
// Early ratings swing by ±6 from one take to the next; without this a lucky
// first day would hand out a stage that means nothing.
export const STAGE_MIN_ATTEMPTS: Record<Stage, number> = { 1: 0, 2: 6, 3: 18, 4: 36, 5: 60 };

// Good attempts at a difficulty or harder that a stage also needs: nobody reaches
// Strong on easy content.
export const STAGE_PROOF: Record<Stage, { good: number; difficulty: number } | null> = {
  1: null,
  2: null,
  3: { good: 3, difficulty: 3 },
  4: { good: 5, difficulty: 5 },
  5: { good: 8, difficulty: 6 },
};

// A good attempt scores this or more, of 100.
export const GOOD_ATTEMPT = 70;

// The difficulties proof is asked at, so they can be counted in one go.
export const PROOF_DIFFICULTIES = [3, 5, 6] as const;

// A node's practice: attempts below it, and good attempts at each difficulty or
// harder. An attempt counts once for a node, however many leaves below it moved.
export interface NodeProgress {
  attempts: number;
  goodAt: Partial<Record<number, number>>;
}

// How far below a stage's floor the rating can sink before it reads as
// rusty — a single off day shouldn't.
const RUSTY_MARGIN = 6;

export const MAX_STAGE: Stage = 5;

// The level: 1 under 28, then one level every 3 points, so 25 starts at 97.
export const MAX_SPEAKER_LEVEL = 25;
export const LEVEL_2_AT = 28;
export const POINTS_PER_LEVEL = 3;

export function levelForScore(overall: number): number {
  if (overall < LEVEL_2_AT) return 1;
  return Math.min(MAX_SPEAKER_LEVEL, 2 + Math.floor((overall - LEVEL_2_AT) / POINTS_PER_LEVEL));
}

// The score the next level starts at; null at the top.
export function nextLevelAt(level: number): number | null {
  return level >= MAX_SPEAKER_LEVEL ? null : LEVEL_2_AT + (level - 1) * POINTS_PER_LEVEL;
}

// A single attempt, in words.
export const ATTEMPT_LABELS = [
  { name: "Great", from: 80 },
  { name: "Solid", from: 60 },
  { name: "Getting there", from: 40 },
  { name: "Keep going", from: 0 },
] as const;

export function attemptLabel(score: number): string {
  return ATTEMPT_LABELS.find((l) => score >= l.from)?.name ?? "Keep going";
}

export function stageForRating(rating: number): Stage {
  for (const stage of [5, 4, 3, 2] as Stage[]) if (rating >= STAGE_FLOORS[stage]) return stage;
  return 1;
}

function proofMissing(stage: Stage, progress: NodeProgress): number {
  const proof = STAGE_PROOF[stage];
  return proof ? Math.max(0, proof.good - (progress.goodAt[proof.difficulty] ?? 0)) : 0;
}

// The stage after a new score: never below the one already earned, and only as
// high as the practice and proof behind it.
export function earnedStage(previous: Stage | null | undefined, rating: number, progress: NodeProgress): Stage {
  let reached = stageForRating(rating);
  while (reached > 1 && (progress.attempts < STAGE_MIN_ATTEMPTS[reached] || proofMissing(reached, progress) > 0)) reached = (reached - 1) as Stage;
  return Math.max(previous ?? 1, reached) as Stage;
}

// Where the skill check places you: by rating alone, since there's no
// practice yet to gate it.
export function placementStage(rating: number): Stage {
  return stageForRating(rating);
}

// 0-1 toward the next stage from the current one; 1 at the top stage.
export function stageProgress(rating: number, stage: Stage): number {
  if (stage >= MAX_STAGE) return 1;
  const from = STAGE_FLOORS[stage];
  const to = STAGE_FLOORS[(stage + 1) as Stage];
  return Math.max(0, Math.min(1, (rating - from) / (to - from)));
}

// Rating points still needed for the next stage (0 at the top).
export function pointsToNextStage(rating: number, stage: Stage): number {
  if (stage >= MAX_STAGE) return 0;
  return Math.max(0, Math.ceil(STAGE_FLOORS[(stage + 1) as Stage] - rating));
}

export function isRusty(rating: number, stage: Stage): boolean {
  return stage > 1 && rating < STAGE_FLOORS[stage] - RUSTY_MARGIN;
}

export function stageName(stage: Stage): string {
  return STAGE_NAMES[stage];
}

// Scored attempts still needed before the next stage can be earned.
export function attemptsToNextStage(attempts: number, stage: Stage): number {
  if (stage >= MAX_STAGE) return 0;
  return Math.max(0, STAGE_MIN_ATTEMPTS[(stage + 1) as Stage] - attempts);
}

// One line on what stands between you and the next stage.
export function nextStageHint(rating: number, attempts: number, stage: Stage, goodAt: NodeProgress["goodAt"] = {}): string {
  if (stage >= MAX_STAGE) return "Top stage. Keep it warm with practice.";
  const next = STAGE_NAMES[(stage + 1) as Stage];
  const points = pointsToNextStage(rating, stage);
  const more = attemptsToNextStage(attempts, stage);
  if (points > 0) return `${points} ${points === 1 ? "point" : "points"} to ${next}`;
  if (more > 0) return `Rating's there. ${more} more scored ${more === 1 ? "attempt" : "attempts"} to lock in ${next}`;
  const proof = STAGE_PROOF[(stage + 1) as Stage];
  const good = proofMissing((stage + 1) as Stage, { attempts, goodAt });
  if (proof && good > 0) return `Rating's there. ${good} more good ${good === 1 ? "attempt" : "attempts"} at difficulty ${proof.difficulty} or harder to reach ${next}`;
  return `${next} is next`;
}
