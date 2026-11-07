import { ratingDelta } from "../mastery";
import type { ReadingPreview } from "../signalLab/readingTrust";
import { SKILL_TREE, STARTING_VALUE, getLeaf, leafCounts, nodeName, type LeafDef, type LeafId, type PillarId, type SkillNodeId } from "./skillTree";

// Leaf ratings and the roll-up (docs/overhaul/PLAN.md, section 6.3). Evidence
// lands on leaves, each a rating with the same Elo-style update as mastery.ts,
// scaled by the grid's weight. Everything above a leaf is a weighted average,
// worked out here and never stored. Pure.

export interface LeafRating {
  rating: number;
  attempts: number;
}

export type LeafRatings = Partial<Record<LeafId, LeafRating>>;

export interface CountOptions {
  // Dev only: readings counted early (signalLab/readingTrust.ts).
  preview?: ReadingPreview;
  // Leaves this person isn't scored on (stuttering: Fillers and Flow).
  excluded?: readonly LeafId[];
}

// Whether a leaf counts for this person right now. One that doesn't has weight
// 0, its siblings share its weight, and it doesn't move.
export function leafIsCounted(id: LeafId, options: CountOptions = {}): boolean {
  return leafCounts(id, options.preview) && !options.excluded?.includes(id);
}

export function ratingOf(ratings: LeafRatings, id: LeafId): LeafRating {
  return ratings[id] ?? { rating: STARTING_VALUE, attempts: 0 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// One leaf after one attempt. Composure can only go up (plan 6.2): an honest bad
// day never lowers it, so there's no reason to fudge a self-report.
export function moveLeaf(id: LeafId, current: LeafRating, score: number, difficulty: number, weight: number): LeafRating {
  const moved = current.rating + ratingDelta(current, score, difficulty) * weight;
  const clamped = Math.max(0, Math.min(100, moved));
  const rating = getLeaf(id).pillarId === "composure" ? Math.max(current.rating, clamped) : clamped;
  return { rating: round2(rating), attempts: current.attempts + 1 };
}

export interface TreeScores {
  overall: number;
  // Null when nothing under the node counts, so its parent shares its weight.
  pillars: Record<PillarId, number | null>;
  skills: Record<SkillNodeId, number | null>;
  leaves: Record<LeafId, number>;
}

// A weighted average of the children that count, with their weights shared out
// over those that are left.
export function weightedAverage(children: { score: number | null; weight: number }[]): number | null {
  let total = 0;
  let sum = 0;
  for (const c of children) {
    if (c.score == null || c.weight <= 0) continue;
    total += c.weight;
    sum += c.score * c.weight;
  }
  return total > 0 ? sum / total : null;
}

export function rollUp(ratings: LeafRatings, options: CountOptions = {}): TreeScores {
  const pillars = {} as TreeScores["pillars"];
  const skills = {} as TreeScores["skills"];
  const leaves = {} as TreeScores["leaves"];
  for (const pillar of SKILL_TREE) {
    for (const skill of pillar.skills) {
      for (const leaf of skill.leaves as readonly LeafDef[]) leaves[leaf.id as LeafId] = ratingOf(ratings, leaf.id as LeafId).rating;
      skills[skill.id] = weightedAverage(
        (skill.leaves as readonly LeafDef[]).map((leaf) => ({
          score: leafIsCounted(leaf.id as LeafId, options) ? leaves[leaf.id as LeafId] : null,
          weight: leaf.weight,
        })),
      );
    }
    pillars[pillar.id] = weightedAverage(pillar.skills.map((skill) => ({ score: skills[skill.id], weight: skill.weight })));
  }
  const overall = weightedAverage(SKILL_TREE.map((pillar) => ({ score: pillars[pillar.id], weight: pillar.weight }))) ?? STARTING_VALUE;
  return { overall, pillars, skills, leaves };
}

// The score of any node by id ("overall", a pillar, a secondary skill or a leaf).
export function nodeScore(scores: TreeScores, id: string): number | null {
  if (id === "overall") return scores.overall;
  if (id in scores.pillars) return scores.pillars[id as PillarId];
  if (id in scores.skills) return scores.skills[id as SkillNodeId];
  return scores.leaves[id as LeafId] ?? null;
}

// The nodes above a leaf, nearest first.
export function ancestorsOf(id: LeafId): [SkillNodeId, PillarId, "overall"] {
  const { skillId, pillarId } = getLeaf(id);
  return [skillId, pillarId, "overall"];
}

// -----------------------------------------------------------------------------
// The trail (plan 6.3): what one attempt changed, from a leaf up to Overall.
// -----------------------------------------------------------------------------

export type TrailLevel = "leaf" | "skill" | "pillar" | "overall";

export interface TrailStep {
  id: string;
  name: string;
  level: TrailLevel;
  before: number;
  after: number;
  delta: number;
}

export interface Trail {
  // The biggest move, from its leaf up to Overall.
  path: TrailStep[];
  // Every leaf that moved, biggest first. A take moves many.
  leaves: TrailStep[];
  // Every pillar that moved, biggest first.
  pillars: TrailStep[];
}

const LEVELS: TrailLevel[] = ["leaf", "skill", "pillar", "overall"];

function step(id: string, level: TrailLevel, before: TreeScores, after: TreeScores): TrailStep {
  const from = nodeScore(before, id) ?? STARTING_VALUE;
  const to = nodeScore(after, id) ?? STARTING_VALUE;
  return { id, name: nodeName(id), level, before: from, after: to, delta: to - from };
}

const biggestFirst = (a: TrailStep, b: TrailStep) => Math.abs(b.delta) - Math.abs(a.delta);

// Null when nothing moved: every leaf touched was already where it ended up.
export function buildTrail(before: TreeScores, after: TreeScores, moved: LeafId[]): Trail | null {
  const leaves = [...new Set(moved)].map((id) => step(id, "leaf", before, after)).filter((s) => s.delta !== 0).sort(biggestFirst);
  if (!leaves.length) return null;
  const top = leaves[0];
  const path = [top, ...ancestorsOf(top.id as LeafId).map((id, i) => step(id, LEVELS[i + 1], before, after))];
  const pillars = SKILL_TREE.map((p) => step(p.id, "pillar", before, after)).filter((s) => s.delta !== 0).sort(biggestFirst);
  return { path, leaves, pillars };
}

// "+2.4"; Overall and anything too small for one decimal get two. Overall moves
// in hundredths (plan 6.3's worked example).
export function formatDelta(s: Pick<TrailStep, "delta" | "level">): string {
  const decimals = s.level === "overall" || Math.abs(s.delta) < 0.05 ? 2 : 1;
  return `${s.delta >= 0 ? "+" : "-"}${Math.abs(s.delta).toFixed(decimals)}`;
}

// "Word links +2.4 · Quick thinking +0.7 · Message +0.1 · Overall +0.03". A step
// that rounds to nothing is left out.
export function trailLine(trail: Trail): string {
  return trail.path
    .filter((s) => Math.abs(s.delta) >= 0.005)
    .map((s) => `${s.name} ${formatDelta(s)}`)
    .join(" · ");
}
