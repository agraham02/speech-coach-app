import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// The tree on a real database: an attempt moves leaves by the grid, stages and
// the level are earned and never drop, and a deleted take stops counting. Real
// DB, real schema; every value is made up.

let mockDb: ReturnType<typeof createTestDatabase>;
let mockProfile: { speechDifference?: string; obstacles: string[] } | null = null;
const mockStageEvents: unknown[] = [];

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({
  getDatabase: async () => mockDb,
  inTransaction: (db: { withTransactionAsync: (task: () => Promise<void>) => Promise<void> }, task: () => Promise<void>) => db.withTransactionAsync(task),
}));
jest.mock("../../prefs/prefsStore", () => ({
  getNextEvent: () => null,
  getReminderSettings: () => ({ practiceDays: [] }),
  getUserProfile: () => mockProfile,
  setTakeLevel: () => undefined,
}));
jest.mock("../../dev/signalLabStore", () => ({ activeReadingPreview: () => ({}) }));
jest.mock("../../progress/progressEvents", () => ({ emitStageEarned: (e: unknown) => mockStageEvents.push(e) }));

import { ensureSchema } from "../schema";
import { getLeafRatings, getNodeStages, getSpeakerLevel, getTreeScores, recordAttempt } from "../leafRepo";
import { getSkillEvents, getSkillMovesSince, getSkillStates, recordDrillOutcome, recordTakeOutcome } from "../progressRepo";
import { ACTIVITY_IDS, drillActivityId, guidedActivityId } from "../../../content/activities";
import { trailLine } from "../../../domain/scoring/rollup";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;
const ok = (score: number) => ({ score, success: score >= 0.8, summary: "" });

async function setLeaf(leaf: string, rating: number, attempts: number) {
  await mockDb.runAsync(`INSERT INTO leaf_ratings (leaf_id, rating, attempts) VALUES (?, ?, ?)`, [leaf, rating, attempts]);
}

describeIfSqlite("the skill tree's numbers", () => {
  beforeEach(async () => {
    mockDb = createTestDatabase();
    await ensureSchema(mockDb as never);
    mockProfile = null;
    mockStageEvents.length = 0;
  });

  it("a personal attempt with a ref counts once; a self-report moves inner leaves only", async () => {
    const evidence = { activityId: ACTIVITY_IDS.talkBack, score: 0.9, leafScores: { reframing: { score: 0.9, source: "self" as const } }, difficulty: 3, source: "self" as const };
    const first = await recordAttempt({ evidence, label: "Talk back", kind: "personal", ref: "talk_back:1" });
    expect(first.moves.map((m) => m.leaf)).toEqual(["reframing"]);
    const again = await recordAttempt({ evidence, label: "Talk back", kind: "personal", ref: "talk_back:1" });
    expect(again.moves).toHaveLength(0);
    expect((await getLeafRatings()).reframing?.attempts).toBe(1);
    // A self-report of a performance leaf moves nothing.
    const outward = await recordAttempt({ evidence: { activityId: ACTIVITY_IDS.prime, score: 1, leafScores: { open_questions: { score: 1, source: "self" as const } }, difficulty: 3, source: "self" as const }, label: "Prime", kind: "personal" });
    expect(outward.moves).toHaveLength(0);
  });

  it("plays out the plan's worked example", async () => {
    await setLeaf("word_links", 40, 5);
    const change = await recordDrillOutcome({ drillType: "word_chain", outcome: ok(0.8), level: 3, source: "judge" });
    expect((await getLeafRatings()).word_links?.rating).toBeCloseTo(42.4, 1);
    expect((await getLeafRatings()).word_links?.attempts).toBe(6);
    // Word chain also moves Bouncing back ●.
    expect((await getLeafRatings()).bouncing_back?.attempts).toBe(1);
    // So Overall is a little more than the plan's example, which follows one leaf.
    expect(trailLine(change.trail!)).toMatch(/^Word links \+2\.4 · Quick thinking \+0\.7 · Message \+0\.1 · Overall \+0\.0\d$/);
    expect(change.skill).toBe("impromptu");
  });

  it("moves a content leaf only lightly with no judge", async () => {
    await setLeaf("word_links", 40, 5);
    await recordDrillOutcome({ drillType: "word_chain", outcome: ok(0.8), level: 3 });
    expect((await getLeafRatings()).word_links?.rating).toBeCloseTo(40.6, 1);
  });

  it("never moves a performance leaf from a self-rating, and says nothing moved", async () => {
    const change = await recordDrillOutcome({ drillType: "guided", outcome: ok(1), level: 3, contentId: "gd_rate_contrast", skill: "cadence", source: "self" });
    expect(change.trail).toBeNull();
    expect(change.ratingAfter).toBe(change.ratingBefore);
    expect(await getLeafRatings()).toEqual({});
  });

  it("moves an inner leaf from a self-rating, and Composure never falls", async () => {
    await setLeaf("settling", 60, 5);
    await recordDrillOutcome({ drillType: "guided", outcome: ok(0), level: 3, contentId: "gd_breath_reset", skill: "confidence", source: "self" });
    expect((await getLeafRatings()).settling).toEqual({ rating: 60, attempts: 6 });
    await recordDrillOutcome({ drillType: "guided", outcome: ok(1), level: 3, contentId: "gd_breath_reset", skill: "confidence", source: "self" });
    expect((await getLeafRatings()).settling!.rating).toBeGreaterThan(60);
  });

  it("the old skills read their pillars, worked out rather than stored", async () => {
    await recordDrillOutcome({ drillType: "twister", outcome: ok(0.9), level: 3 });
    const skills = await getSkillStates();
    const tree = await getTreeScores();
    expect(skills.articulation.rating).toBeCloseTo(tree.pillars.clarity!, 1);
    expect(skills.articulation.rating).toBeGreaterThan(25);
    expect(skills.articulation.attempts).toBe(1);
    expect(skills.articulation.lastPracticedAt).not.toBeNull();
    expect(skills.cadence.attempts).toBe(0);
  });

  it("counts one attempt once for a pillar, however many leaves it moved", async () => {
    await recordDrillOutcome({ drillType: "twister", outcome: ok(0.9), level: 3 });
    expect((await getSkillStates()).articulation.attempts).toBe(1);
    expect((await getLeafRatings()).speed_clarity?.attempts).toBe(1);
    expect((await getLeafRatings()).read_accuracy?.attempts).toBe(1);
  });

  it("records what moved a skill, and how far", async () => {
    await recordDrillOutcome({ drillType: "twister", outcome: ok(0.9), level: 3 });
    const [event] = await getSkillEvents("articulation");
    expect(event.source).toBe("drill");
    expect(event.ratingAfter).toBeGreaterThan(event.ratingBefore);
    expect(event.score).toBe(0.9);
    expect(event.level).toBe(3);
    expect(await getSkillEvents("cadence")).toHaveLength(0);
    const [move] = await getSkillMovesSince(new Date(0).toISOString());
    expect(move.skill).toBe("articulation");
    expect(move.to).toBeGreaterThan(move.from);
  });

  it("earns Building only with the attempts behind it, then keeps it", async () => {
    await setLeaf("stalls", 60, 0);
    await setLeaf("ums_uhs", 60, 0);
    await setLeaf("starting_fast", 60, 0);
    for (let i = 0; i < 5; i++) await recordDrillOutcome({ drillType: "just_a_minute", outcome: ok(0.9), level: 1 });
    expect((await getNodeStages()).get("stalls")).toBeUndefined();
    const change = await recordDrillOutcome({ drillType: "just_a_minute", outcome: ok(0.9), level: 1 });
    expect((await getNodeStages()).get("stalls")?.stage).toBe(2);
    expect(change.trail).not.toBeNull();
    // A dip doesn't take it away.
    await mockDb.runAsync(`UPDATE leaf_ratings SET rating = 26 WHERE leaf_id = 'stalls'`);
    await recordDrillOutcome({ drillType: "just_a_minute", outcome: ok(0), level: 1 });
    expect((await getNodeStages()).get("stalls")?.stage).toBe(2);
  });

  it("won't give Steady without good attempts at difficulty 3 or harder", async () => {
    await setLeaf("speed_clarity", 70, 30);
    for (let i = 0; i < 18; i++) await recordDrillOutcome({ drillType: "twister", outcome: ok(0.95), level: 2 });
    expect((await getNodeStages()).get("speed_clarity")?.stage).toBe(2);
    for (let i = 0; i < 3; i++) await recordDrillOutcome({ drillType: "twister", outcome: ok(0.95), level: 3 });
    expect((await getNodeStages()).get("speed_clarity")?.stage).toBe(3);
  });

  it("celebrates a pillar's stage, not every leaf's", async () => {
    await mockDb.runAsync(`INSERT INTO leaf_ratings (leaf_id, rating, attempts) VALUES ('read_accuracy', 50, 0), ('tricky_sounds', 50, 0), ('speed_clarity', 50, 0), ('ums_uhs', 50, 0), ('like_actually', 50, 0), ('stalls', 50, 0), ('restarts', 50, 0)`);
    for (let i = 0; i < 6; i++) await recordDrillOutcome({ drillType: "twister", outcome: ok(0.9), level: 3 });
    expect(mockStageEvents).toEqual([expect.objectContaining({ skill: "articulation", stage: 2 })]);
  });

  it("raises the level with Overall, and it never drops", async () => {
    expect(await getSpeakerLevel()).toBe(1);
    await mockDb.runAsync(`INSERT INTO leaf_ratings (leaf_id, rating, attempts) SELECT 'speaking_rate', 95, 0`);
    await mockDb.runAsync(`INSERT INTO leaf_ratings (leaf_id, rating, attempts) VALUES ('pace_control', 95, 0), ('rhythm', 95, 0), ('sentence_ends', 95, 0), ('deliberate_pauses', 95, 0), ('pitch_variety', 95, 0), ('stand_out_stress', 95, 0), ('where_to_stress', 95, 0), ('breath_length', 95, 0), ('volume_carry', 95, 0)`);
    const change = await recordDrillOutcome({ drillType: "breath_count", outcome: ok(1), level: 9 });
    expect(change.speakerLevelAfter).toBeGreaterThan(1);
    const level = await getSpeakerLevel();
    await mockDb.runAsync(`UPDATE leaf_ratings SET rating = 10`);
    await recordDrillOutcome({ drillType: "breath_count", outcome: ok(0), level: 9 });
    expect(await getSpeakerLevel()).toBe(level);
  });

  it("stops counting a deleted take's attempts for stages, keeping the rating", async () => {
    await mockDb.runAsync(`INSERT INTO sessions (id, prompt_id, recorded_at, video_path, duration_seconds, transcription_source, status) VALUES ('t1', 'p', '2026-11-01T10:00:00Z', 'v', 60, 'whisper_ondevice', 'done')`);
    const changes = await recordTakeOutcome(
      { activityId: ACTIVITY_IDS.impromptu, leafScores: { speaking_rate: { score: 0.9 } }, source: "measured" },
      { sessionId: "t1", label: "A take", meanScore: 0.9 },
    );
    expect(changes.map((c) => c.skill)).toEqual(["cadence"]);
    expect((await getSkillStates()).cadence.attempts).toBe(1);
    await mockDb.runAsync(`UPDATE sessions SET deleted_at = '2026-11-02T00:00:00Z' WHERE id = 't1'`);
    expect((await getSkillStates()).cadence.attempts).toBe(0);
    expect((await getLeafRatings()).speaking_rate?.attempts).toBe(1);
    expect(await getSkillEvents("cadence")).toHaveLength(0);
  });

  it("a failed gate keeps the attempt, moves nothing, and doesn't step the difficulty", async () => {
    const gate = { passed: false as const, kind: "failed" as const, reason: "Not the words on the screen." };
    const change = await recordDrillOutcome({ drillType: "pace_reading", outcome: ok(0.9), level: 3, gate });
    expect(change.trail).toBeNull();
    expect(change.leveledUp).toBe(false);
    expect(change.levelAfter).toBe(3);
    expect(await getLeafRatings()).toEqual({});
    expect(await mockDb.getFirstAsync("SELECT score, success FROM drill_attempts")).toEqual({ score: null, success: 0 });
    expect(await mockDb.getFirstAsync("SELECT level FROM drill_difficulty WHERE drill_type = 'pace_reading'")).toBeNull();
    const passed = await recordDrillOutcome({ drillType: "pace_reading", outcome: ok(0.9), level: 3, gate: { passed: true } });
    expect(passed.trail).not.toBeNull();
  });

  it("moves the tree once for a take, even if it's settled twice", async () => {
    await mockDb.runAsync(`INSERT INTO sessions (id, prompt_id, recorded_at, video_path, duration_seconds, transcription_source, status) VALUES ('t2', 'p', '2026-11-01T10:00:00Z', 'v', 60, 'whisper_ondevice', 'done')`);
    const take = { activityId: ACTIVITY_IDS.impromptu, leafScores: { speaking_rate: { score: 0.9 } }, source: "measured" as const };
    await recordTakeOutcome(take, { sessionId: "t2", label: "A take", meanScore: 0.9 });
    const once = await getLeafRatings();
    expect(await recordTakeOutcome(take, { sessionId: "t2", label: "A take", meanScore: 0.9 })).toEqual([]);
    expect(await getLeafRatings()).toEqual(once);
  });

  it("a take moves nothing once deleted, and doesn't step the rep's difficulty", async () => {
    const changes = await recordTakeOutcome({ activityId: ACTIVITY_IDS.impromptu, leafScores: { speaking_rate: { score: 0.9 } }, source: "measured" }, { sessionId: "gone", label: "A take", meanScore: 0.9 });
    expect(changes).toEqual([]);
    expect(await getLeafRatings()).toEqual({});
  });

  it("leaves Fillers and Flow alone for someone who stutters", async () => {
    mockProfile = { speechDifference: "stutter", obstacles: [] };
    await recordDrillOutcome({ drillType: "just_a_minute", outcome: ok(0.9), level: 3 });
    const leaves = await getLeafRatings();
    expect(leaves.stalls).toBeUndefined();
    expect(leaves.ums_uhs).toBeUndefined();
    expect(leaves.starting_fast?.attempts).toBe(1);
  });

  it("writes one attempt with its leaves, or nothing at all", async () => {
    const empty = await recordAttempt({ evidence: { activityId: drillActivityId("twister"), score: null, difficulty: 3, source: "measured" }, label: "x", kind: "drill" });
    expect(empty.moves).toEqual([]);
    expect(await mockDb.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM score_attempts")).toEqual({ n: 0 });
    await recordAttempt({ evidence: { activityId: guidedActivityId("gd_catch_um"), score: 0.8, difficulty: 3, source: "measured" }, label: "x", kind: "drill" });
    expect(await mockDb.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM score_attempts")).toEqual({ n: 1 });
    expect(await mockDb.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM leaf_events")).toEqual({ n: 1 });
  });
});
