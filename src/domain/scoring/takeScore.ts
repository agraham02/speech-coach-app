import type { Provenance } from "../analysis/types";
import { READINGS, type ReadingPreview, type TrustStatus } from "../signalLab/readingTrust";
import type { EvidenceSource } from "../../content/skillGrid";
import { leafIsCounted, weightedAverage, type CountOptions } from "./rollup";
import { SKILL_TREE, TAKE_WEIGHTS, getLeaf, type LeafDef, type LeafId, type PillarId, type SkillNodeId } from "./skillTree";
import { takeLeafReadings, type TakeFacts } from "./takeLeaves";

// A take's score, on the same tree as your skills (docs/overhaul/PLAN.md, section
// 6.3), showing this attempt's score at each node, 0 to 100. One sheet, not two
// layers: the phone owns delivery and the judge owns content (plan 6.4, rule 4),
// so a take's Delivery is the same whether or not it was judged. Without a content
// check the headline says Delivery and leaves Message out. Every number above a
// leaf is worked out here, so a summary can't disagree with its breakdown. Pure.

export const SCORE_SHEET_VERSION = 8;

export type HeadlineKind = "overall" | "delivery";

export interface LeafScore {
  id: LeafId;
  name: string;
  score: number;
  source: EvidenceSource;
  // Counts towards the skill above it.
  counts: boolean;
  // Why it doesn't count, when that's because its reading isn't proven yet.
  trust?: TrustStatus;
  // The raw number, in words, and how the score was worked out.
  value: string;
  rule: string;
  // The judge's note.
  notes?: string | null;
}

export interface SkillScore {
  id: SkillNodeId;
  name: string;
  // Null when every leaf under it is Beta.
  score: number | null;
  leaves: LeafScore[];
}

export interface PillarScore {
  id: PillarId;
  name: string;
  score: number | null;
  // Its share of the take's score, after leaving out what's absent. 0: not in it.
  share: number;
  skills: SkillScore[];
}

export interface TakeScores {
  version: number;
  // The take's score: Overall when its content was checked, otherwise Delivery.
  score: number;
  headline: HeadlineKind;
  delivery: number | null;
  // Null without a content check, even when the phone has estimates of its leaves.
  message: number | null;
  // Message (estimates included), Voice, Clarity, Presence, whatever this take shows.
  pillars: PillarScore[];
  judgedBy?: Provenance;
}

const TAKE_PILLARS = ["message", "voice", "clarity", "presence"] as const;
const DELIVERY_PILLARS = ["voice", "clarity", "presence"] as const;

const whole = (n: number | null): number | null => (n == null ? null : Math.round(n));

function trustOf(id: LeafId, counts: boolean): TrustStatus | undefined {
  const reading = getLeaf(id).reading;
  return !counts && reading ? READINGS[reading].status : undefined;
}

export function takeScores(facts: TakeFacts, judgedBy?: Provenance, options: CountOptions = {}): TakeScores | null {
  const readings = takeLeafReadings(facts);
  const judged = Object.values(readings).some((r) => r?.source === "judge");
  const exact = {} as Record<(typeof TAKE_PILLARS)[number], number | null>;
  const pillars: PillarScore[] = [];

  for (const id of TAKE_PILLARS) {
    const pillar = SKILL_TREE.find((p) => p.id === id)!;
    const skills: SkillScore[] = [];
    const skillScores: { score: number | null; weight: number }[] = [];
    for (const skill of pillar.skills) {
      const leaves: LeafScore[] = [];
      const leafScores: { score: number | null; weight: number }[] = [];
      for (const leaf of skill.leaves as readonly LeafDef[]) {
        const leafId = leaf.id as LeafId;
        const reading = readings[leafId];
        if (!reading) continue;
        const counts = leafIsCounted(leafId, options);
        leaves.push({ id: leafId, name: leaf.name, score: Math.round(reading.score), source: reading.source, counts, trust: trustOf(leafId, counts), value: reading.value, rule: reading.rule, notes: reading.notes });
        leafScores.push({ score: counts ? reading.score : null, weight: leaf.weight });
      }
      if (!leaves.length) continue;
      const score = weightedAverage(leafScores);
      skills.push({ id: skill.id, name: skill.name, score: whole(score), leaves });
      skillScores.push({ score, weight: skill.weight });
    }
    exact[id] = weightedAverage(skillScores);
    if (skills.length) pillars.push({ id, name: pillar.name, score: whole(exact[id]), share: 0, skills });
  }

  const shareOf = (ids: readonly (typeof TAKE_PILLARS)[number][]) => ids.map((id) => ({ id, score: exact[id], weight: TAKE_WEIGHTS[id] }));
  const delivery = weightedAverage(shareOf(DELIVERY_PILLARS));
  const inScore = judged ? shareOf(TAKE_PILLARS) : shareOf(DELIVERY_PILLARS);
  const score = weightedAverage(inScore);
  if (score == null) return null;

  const totalWeight = inScore.filter((p) => p.score != null).reduce((sum, p) => sum + p.weight, 0);
  for (const pillar of pillars) {
    const entry = inScore.find((p) => p.id === pillar.id);
    pillar.share = entry && entry.score != null ? entry.weight / totalWeight : 0;
  }

  return {
    version: SCORE_SHEET_VERSION,
    score: Math.round(score),
    headline: judged ? "overall" : "delivery",
    delivery: whole(delivery),
    message: judged ? whole(exact.message) : null,
    pillars,
    ...(judged && judgedBy ? { judgedBy } : {}),
  };
}

export function pillarOf(scores: TakeScores, id: PillarId): PillarScore | undefined {
  return scores.pillars.find((p) => p.id === id);
}

export type { ReadingPreview };
