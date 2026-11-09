import { getDatabase, inTransaction } from "./database";
import { generateId } from "../../utils/generateId";
import { logger } from "../../utils/logger";
import { GOOD_ATTEMPT, PROOF_DIFFICULTIES, earnedStage, levelForScore, placementStage, type NodeProgress, type Stage } from "../../domain/levels";
import { movesForAttempt, type AttemptEvidence, type PlannedMove } from "../../domain/scoring/leafEvidence";
import { ancestorsOf, buildTrail, moveLeaf, nodeScore, ratingOf, rollUp, type LeafRatings, type Trail, type TreeScores } from "../../domain/scoring/rollup";
import { LEAVES, SKILL_CHECK_SEED, SKILL_TREE, getLeaf, nodeName, type LeafId } from "../../domain/scoring/skillTree";
import { scoringOptions } from "../scoring/scoringOptions";

// The skill tree's stored numbers (docs/overhaul/PLAN.md, section 6.3): one
// rating per leaf, every move a leaf made, each attempt's before and after, the
// stage earned at each node, and the level. Scores above a leaf are never stored.

type Db = Awaited<ReturnType<typeof getDatabase>>;

// A move of a take that has been deleted (inside its undo window; after that the
// row is gone) is not part of any history.
export const LIVE_MOVE = `(session_id IS NULL OR session_id IN (SELECT id FROM sessions WHERE deleted_at IS NULL))`;

async function readLeafRatings(db: Db): Promise<LeafRatings> {
  const rows = await db.getAllAsync<{ leaf_id: string; rating: number; attempts: number }>(`SELECT leaf_id, rating, attempts FROM leaf_ratings`);
  const out: LeafRatings = {};
  for (const r of rows) out[r.leaf_id as LeafId] = { rating: r.rating, attempts: r.attempts };
  return out;
}

export async function getLeafRatings(): Promise<LeafRatings> {
  return readLeafRatings(await getDatabase());
}

export async function getTreeScores(): Promise<TreeScores> {
  return rollUp(await getLeafRatings(), scoringOptions());
}

export interface NodeStage {
  stage: Stage;
  reachedAt: string | null;
}

async function readNodeStages(db: Db): Promise<Map<string, NodeStage>> {
  const rows = await db.getAllAsync<{ node_id: string; stage: number; reached_at: string | null }>(`SELECT node_id, stage, reached_at FROM node_stages`);
  return new Map(rows.map((r) => [r.node_id, { stage: r.stage as Stage, reachedAt: r.reached_at }]));
}

export async function getNodeStages(): Promise<Map<string, NodeStage>> {
  return readNodeStages(await getDatabase());
}

async function readLevel(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ level: number }>(`SELECT level FROM speaker_level WHERE id = 1`);
  return row?.level ?? 1;
}

export async function getSpeakerLevel(): Promise<number> {
  return readLevel(await getDatabase());
}

async function saveLevel(db: Db, level: number, at: string): Promise<void> {
  await db.runAsync(`INSERT INTO speaker_level (id, level, reached_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET level = excluded.level, reached_at = excluded.reached_at`, [level, at]);
}

// Attempts and proof at each node: an attempt counts once for a node however
// many leaves below it moved (plan 6.3).
const goodColumn = (d: number) => `good_${d}`;

type StoredProgress = NodeProgress & { lastAt: string | null };

async function readProgress(db: Db, column: "leaf_id" | "skill_id" | "pillar_id"): Promise<Map<string, StoredProgress>> {
  const good = PROOF_DIFFICULTIES.map((d) => `COUNT(DISTINCT CASE WHEN score * 100 >= ${GOOD_ATTEMPT} AND difficulty >= ${d} THEN attempt_id END) AS ${goodColumn(d)}`).join(", ");
  const rows = await db.getAllAsync<Record<string, number | string | null>>(
    `SELECT ${column} AS node, COUNT(DISTINCT attempt_id) AS attempts, MAX(at) AS last_at, ${good}
     FROM leaf_events WHERE score IS NOT NULL AND ${LIVE_MOVE} GROUP BY ${column}`,
  );
  return new Map(
    rows.map((r) => [
      r.node as string,
      {
        attempts: r.attempts as number,
        lastAt: r.last_at as string | null,
        goodAt: Object.fromEntries(PROOF_DIFFICULTIES.map((d) => [d, r[goodColumn(d)] as number])),
      },
    ]),
  );
}

export async function getPillarProgress(): Promise<Map<string, StoredProgress>> {
  return readProgress(await getDatabase(), "pillar_id");
}

export interface StageUp {
  nodeId: string;
  name: string;
  stageBefore: Stage;
  stageAfter: Stage;
}

// Raises any stage the moved leaves and the nodes above them have now earned.
async function earnStages(db: Db, moved: LeafId[], scores: TreeScores, at: string): Promise<StageUp[]> {
  const stages = await readNodeStages(db);
  const leaves = await readProgress(db, "leaf_id");
  const skills = await readProgress(db, "skill_id");
  const pillars = await readProgress(db, "pillar_id");
  const nodes = new Set<string>();
  for (const leaf of moved) {
    nodes.add(leaf);
    for (const id of ancestorsOf(leaf)) if (id !== "overall") nodes.add(id);
  }
  const ups: StageUp[] = [];
  for (const id of nodes) {
    const score = nodeScore(scores, id);
    if (score == null) continue;
    const before = stages.get(id)?.stage ?? 1;
    const progress = leaves.get(id) ?? skills.get(id) ?? pillars.get(id) ?? { attempts: 0, goodAt: {} };
    const after = earnedStage(before, score, progress);
    if (after <= before) continue;
    await db.runAsync(`INSERT INTO node_stages (node_id, stage, reached_at) VALUES (?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET stage = excluded.stage, reached_at = excluded.reached_at`, [id, after, at]);
    ups.push({ nodeId: id, name: nodeName(id), stageBefore: before, stageAfter: after });
  }
  return ups;
}

// Every node that changed, with its score before and after.
function changedNodes(before: TreeScores, after: TreeScores): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const add = (id: string) => {
    const from = nodeScore(before, id);
    const to = nodeScore(after, id);
    if (from != null && to != null && from !== to) out[id] = [Math.round(from * 1000) / 1000, Math.round(to * 1000) / 1000];
  };
  add("overall");
  for (const pillar of SKILL_TREE) {
    add(pillar.id);
    for (const skill of pillar.skills) add(skill.id);
  }
  for (const leaf of LEAVES) add(leaf.id);
  return out;
}

export interface AttemptResult {
  moves: PlannedMove[];
  before: TreeScores;
  after: TreeScores;
  trail: Trail | null;
  stageUps: StageUp[];
  levelBefore: number;
  levelAfter: number;
}

export interface AttemptRecord {
  evidence: AttemptEvidence;
  label: string;
  kind: "drill" | "rep" | "personal";
  sessionId?: string;
  drillType?: string;
  // What this attempt was ("rewind:<id>", "three_things:<date>"): an attempt with
  // a ref already recorded moves nothing, so it counts once.
  ref?: string;
  // A Stretch rep: a move that would lower a leaf is dropped (plan 6.7, rule 7).
  noLoss?: boolean;
}

// One scored attempt: moves its leaves by the grid, and works out what that did
// up the tree. An attempt that can move nothing (a self-rating of a performance
// leaf, a leaf that doesn't count yet) leaves everything as it was.
export async function recordAttempt(record: AttemptRecord): Promise<AttemptResult> {
  const options = scoringOptions();
  let moves = movesForAttempt(record.evidence, options);
  const db = await getDatabase();
  const at = new Date().toISOString();
  let result!: AttemptResult;
  await inTransaction(db, async () => {
    const ratings = await readLeafRatings(db);
    if (record.noLoss) {
      moves = moves.filter((m) => moveLeaf(m.leaf, ratingOf(ratings, m.leaf), m.score, record.evidence.difficulty, m.weight).rating >= ratingOf(ratings, m.leaf).rating);
    }
    const before = rollUp(ratings, options);
    const levelBefore = await readLevel(db);
    const repeat = record.ref ? await db.getFirstAsync(`SELECT 1 FROM score_attempts WHERE ref = ?`, [record.ref]) : null;
    if (!moves.length || repeat) {
      result = { moves: repeat ? [] : moves, before, after: before, trail: null, stageUps: [], levelBefore, levelAfter: levelBefore };
      return;
    }
    const nextRatings: LeafRatings = { ...ratings };
    for (const move of moves) nextRatings[move.leaf] = moveLeaf(move.leaf, ratingOf(ratings, move.leaf), move.score, record.evidence.difficulty, move.weight);
    const after = rollUp(nextRatings, options);
    const attemptId = generateId();
    await db.runAsync(
      `INSERT INTO score_attempts (id, at, activity_id, kind, label, score, difficulty, source, session_id, drill_type, nodes_json, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [attemptId, at, record.evidence.activityId, record.kind, record.label, record.evidence.score ?? null, record.evidence.difficulty, record.evidence.source, record.sessionId ?? null, record.drillType ?? null, JSON.stringify(changedNodes(before, after)), record.ref ?? null],
    );
    for (const move of moves) {
      const was = ratingOf(ratings, move.leaf);
      const now = nextRatings[move.leaf]!;
      const def = getLeaf(move.leaf);
      await db.runAsync(
        `INSERT INTO leaf_ratings (leaf_id, rating, attempts, last_moved_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(leaf_id) DO UPDATE SET rating = excluded.rating, attempts = excluded.attempts, last_moved_at = excluded.last_moved_at`,
        [move.leaf, now.rating, now.attempts, at],
      );
      await db.runAsync(
        `INSERT INTO leaf_events (attempt_id, leaf_id, skill_id, pillar_id, at, rating_before, rating_after, score, weight, difficulty, source, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [attemptId, move.leaf, def.skillId, def.pillarId, at, was.rating, now.rating, move.score, move.weight, record.evidence.difficulty, move.source, record.sessionId ?? null],
      );
    }
    const stageUps = await earnStages(db, moves.map((m) => m.leaf), after, at);
    const levelAfter = Math.max(levelBefore, levelForScore(after.overall));
    if (levelAfter > levelBefore) await saveLevel(db, levelAfter, at);
    result = { moves, before, after, trail: buildTrail(before, after, moves.map((m) => m.leaf)), stageUps, levelBefore, levelAfter };
  });
  return result;
}

// Starting values from the skill check, for the leaves it touched: 15 to 45, and
// only where there's no practice yet. A placement is quiet, never a level-up, and
// has no attempt or proof behind it.
export async function seedLeaves(ratings: Partial<Record<LeafId, number>>, label: string): Promise<void> {
  const options = scoringOptions();
  const db = await getDatabase();
  const at = new Date().toISOString();
  await inTransaction(db, async () => {
    const current = await readLeafRatings(db);
    const next: LeafRatings = { ...current };
    const seeded: LeafId[] = [];
    for (const [id, value] of Object.entries(ratings) as [LeafId, number][]) {
      if (!Number.isFinite(value) || ratingOf(current, id).attempts > 0) continue;
      next[id] = { rating: Math.max(SKILL_CHECK_SEED.min, Math.min(SKILL_CHECK_SEED.max, value)), attempts: 0 };
      seeded.push(id);
    }
    if (!seeded.length) return;
    const before = rollUp(current, options);
    const after = rollUp(next, options);
    const attemptId = generateId();
    await db.runAsync(`INSERT INTO score_attempts (id, at, activity_id, kind, label, nodes_json) VALUES (?, ?, 'check:skill', 'seed', ?, ?)`, [attemptId, at, label, JSON.stringify(changedNodes(before, after))]);
    for (const id of seeded) {
      const def = getLeaf(id);
      await db.runAsync(`INSERT INTO leaf_ratings (leaf_id, rating, attempts) VALUES (?, ?, 0) ON CONFLICT(leaf_id) DO UPDATE SET rating = excluded.rating`, [id, next[id]!.rating]);
      await db.runAsync(`INSERT INTO leaf_events (attempt_id, leaf_id, skill_id, pillar_id, at, rating_before, rating_after) VALUES (?, ?, ?, ?, ?, ?, ?)`, [attemptId, id, def.skillId, def.pillarId, at, ratingOf(current, id).rating, next[id]!.rating]);
    }
    const stages = await readNodeStages(db);
    const placed = new Set<string>(seeded.flatMap((id) => [id, ...ancestorsOf(id).filter((n) => n !== "overall")]));
    for (const id of placed) {
      const score = nodeScore(after, id);
      if (score == null) continue;
      const stage = Math.max(stages.get(id)?.stage ?? 1, placementStage(score));
      if (stage > 1) await db.runAsync(`INSERT INTO node_stages (node_id, stage, reached_at) VALUES (?, ?, NULL) ON CONFLICT(node_id) DO UPDATE SET stage = excluded.stage`, [id, stage]);
    }
    const level = Math.max(await readLevel(db), levelForScore(after.overall));
    if (level > 1) await saveLevel(db, level, at);
  });
  logger.info(`[skills] seeded ${Object.keys(ratings).length} leaves from ${label}`);
}

export interface StoredAttempt {
  id: string;
  at: string;
  activityId: string | null;
  kind: "drill" | "rep" | "seed";
  label: string;
  score: number | null;
  difficulty: number | null;
  source: string | null;
  sessionId: string | null;
  drillType: string | null;
  nodes: Record<string, [number, number]>;
}

interface AttemptRow {
  id: string;
  at: string;
  activity_id: string | null;
  kind: string;
  label: string;
  score: number | null;
  difficulty: number | null;
  source: string | null;
  session_id: string | null;
  drill_type: string | null;
  nodes_json: string;
}

function toAttempt(r: AttemptRow): StoredAttempt {
  let nodes: StoredAttempt["nodes"] = {};
  try {
    nodes = JSON.parse(r.nodes_json);
  } catch {
    nodes = {};
  }
  return { id: r.id, at: r.at, activityId: r.activity_id, kind: r.kind as StoredAttempt["kind"], label: r.label, score: r.score, difficulty: r.difficulty, source: r.source, sessionId: r.session_id, drillType: r.drill_type, nodes };
}

// The attempts that moved a node, newest first.
export async function getAttemptsFor(column: "pillar_id" | "skill_id" | "leaf_id", nodeId: string, limit = 40): Promise<StoredAttempt[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AttemptRow>(`SELECT * FROM score_attempts WHERE ${LIVE_MOVE} AND id IN (SELECT attempt_id FROM leaf_events WHERE ${column} = ?) ORDER BY at DESC LIMIT ?`, [nodeId, limit]);
  return rows.map(toAttempt);
}

// Attempts since a moment, oldest first (not the skill check's placement).
export async function getAttemptsSince(sinceIso: string): Promise<StoredAttempt[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AttemptRow>(`SELECT * FROM score_attempts WHERE at >= ? AND kind != 'seed' AND ${LIVE_MOVE} ORDER BY at ASC`, [sinceIso]);
  return rows.map(toAttempt);
}

// The first thing that ever moved a score (the skill check's placement, if any).
export async function getFirstAttempt(): Promise<StoredAttempt | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AttemptRow>(`SELECT * FROM score_attempts WHERE ${LIVE_MOVE} ORDER BY at ASC LIMIT 1`);
  return row ? toAttempt(row) : null;
}
