import { TARGET_MULTIPLIER, effectiveWeight, getGridRow, type EvidenceSource, type LeafMove } from "../../content/skillGrid";
import { leafIsCounted, type CountOptions } from "./rollup";
import type { LeafId } from "./skillTree";
import type { DrillType } from "../drills/drillSpecs";

// What one attempt moves: reads the activity's row in the grid (content/
// skillGrid.ts) and works out each leaf's score and weight. A drill's one number
// moves every leaf in its row; a take has a number per leaf (scoring/takeLeaves.ts).
// Pure.

export interface LeafEvidence {
  score: number; // 0-1
  // Who checked this leaf, when it differs from the attempt's source.
  source?: EvidenceSource;
}

export type AttemptConditions = Partial<Record<NonNullable<LeafMove["only"]>, boolean>>;

export interface AttemptEvidence {
  activityId: string;
  // The attempt's number, 0-1, moving every leaf in the row. Ignored for leaves
  // named in leafScores.
  score?: number | null;
  // A number per leaf: only these leaves move.
  leafScores?: Partial<Record<LeafId, LeafEvidence>>;
  difficulty: number;
  source: EvidenceSource;
  // The lesson's or unit's target leaf, moving ×1.5 (plan section 7).
  targetLeaf?: LeafId | null;
  conditions?: AttemptConditions;
  // Scales a leaf's move: research makes a take a prepared answer, so it counts
  // for less towards Message.
  scale?: (leaf: LeafId) => number;
}

export interface PlannedMove {
  leaf: LeafId;
  score: number;
  weight: number;
  source: EvidenceSource;
}

export function movesForAttempt(evidence: AttemptEvidence, options: CountOptions = {}): PlannedMove[] {
  const row = getGridRow(evidence.activityId);
  if (!row) return [];
  const moves = row.dynamic === "unit_target" && evidence.targetLeaf ? [{ leaf: evidence.targetLeaf, weight: "main" as const }] : row.moves;
  const planned: PlannedMove[] = [];
  for (const move of moves) {
    if (move.only && !evidence.conditions?.[move.only]) continue;
    if (!leafIsCounted(move.leaf, options)) continue;
    const own = evidence.leafScores?.[move.leaf];
    const score = evidence.leafScores ? own?.score : evidence.score;
    if (score == null || !Number.isFinite(score)) continue;
    const source = own?.source ?? evidence.source;
    const base = effectiveWeight(move, source);
    if (base <= 0) continue;
    const target = move.leaf === evidence.targetLeaf ? TARGET_MULTIPLIER : 1;
    const weight = base * target * (evidence.scale?.(move.leaf) ?? 1);
    if (weight > 0) planned.push({ leaf: move.leaf, score: Math.max(0, Math.min(1, score)), weight, source });
  }
  return planned;
}

// Who checks a drill when nothing says otherwise. A drill whose leaf is about
// meaning, with no judge behind this attempt, is a phone estimate; the rest are
// measured. Takes and judged attempts say so themselves.
const PHONE_ESTIMATE_DRILLS: ReadonlySet<DrillType> = new Set<DrillType>(["category_fluency", "word_chain", "chain_bridge", "random_word_story", "sum_up", "relay", "explain_simple", "land_plane", "squeeze"]);

export function drillSource(type: DrillType): EvidenceSource {
  return PHONE_ESTIMATE_DRILLS.has(type) ? "phone_estimate" : "measured";
}
