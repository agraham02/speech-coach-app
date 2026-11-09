import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// The onboarding skill check places each skill (seedSkillRatings). It used to
// skip any skill with attempts, and the check's own drills and talk counted as
// attempts, so most skills were never placed. A placement sample is recorded
// but isn't practice. Real DB, real schema; every value is made up.

let mockDb: ReturnType<typeof createTestDatabase>;

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({
  getDatabase: async () => mockDb,
  inTransaction: (db: { withTransactionAsync: (task: () => Promise<void>) => Promise<void> }, task: () => Promise<void>) => db.withTransactionAsync(task),
}));
jest.mock("../../prefs/prefsStore", () => ({
  getNextEvent: () => null,
  getReminderSettings: () => ({ practiceDays: [] }),
  getUserProfile: () => null,
  setTakeLevel: () => undefined,
  getChallenge: () => "standard",
  setLastStretchWeek: () => undefined,
}));
jest.mock("../../progress/progressEvents", () => ({ emitStageEarned: () => undefined }));

import { ensureSchema } from "../schema";
import { getSkillEvents, getSkillStates, recordDrillOutcome, seedSkillRatings } from "../progressRepo";
import { getLeafRatings } from "../leafRepo";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

const outcome = { score: 0.9, success: true } as never;

describeIfSqlite("the skill check's placement", () => {
  beforeEach(async () => {
    mockDb = createTestDatabase();
    await ensureSchema(mockDb as never);
  });

  it("a placement sample keeps the attempt but moves nothing and counts no practice", async () => {
    const change = await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3, placement: true });
    expect(change.ratingAfter).toBe(change.ratingBefore);
    expect(change.stagedUp).toBe(false);
    expect(change.trail).toBeNull();
    const skills = await getSkillStates();
    expect(skills.cadence.attempts).toBe(0);
    expect(skills.cadence.lastPracticedAt).toBeNull();
    const rows = await mockDb.getAllAsync<{ n: number }>("SELECT COUNT(*) AS n FROM drill_attempts");
    expect(rows[0].n).toBe(1);
    expect(await getSkillEvents("cadence")).toHaveLength(0);
    expect(await getLeafRatings()).toEqual({});
  });

  it("the seed then sets starting values on the leaves the check touched", async () => {
    await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3, placement: true });
    await recordDrillOutcome({ drillType: "category_fluency", outcome, level: 3, placement: true });
    await seedSkillRatings({ cadence: 38, impromptu: 31, confidence: 22 });
    const leaves = await getLeafRatings();
    expect(leaves.speaking_rate).toEqual({ rating: 38, attempts: 0 });
    expect(leaves.word_retrieval).toEqual({ rating: 31, attempts: 0 });
    expect(leaves.on_lens).toEqual({ rating: 22, attempts: 0 });
    // Not touched by the check: stays at the starting value.
    expect(leaves.breath_length).toBeUndefined();
    expect(leaves.tricky_sounds).toBeUndefined();
    const skills = await getSkillStates();
    expect(skills.cadence.rating).toBeGreaterThan(25);
    expect(skills.confidence.rating).toBeLessThan(25);
    for (const skill of ["cadence", "impromptu", "confidence"] as const) {
      expect((await getSkillEvents(skill)).filter((e) => e.source === "seed")).toHaveLength(1);
      // A placement isn't practice.
      expect(skills[skill].attempts).toBe(0);
    }
  });

  it("keeps a seed within 15 to 45", async () => {
    await seedSkillRatings({ cadence: 90, impromptu: 2 });
    const leaves = await getLeafRatings();
    expect(leaves.speaking_rate?.rating).toBe(45);
    expect(leaves.point_first?.rating).toBe(15);
  });

  it("real practice before the check still wins over the sample", async () => {
    await recordDrillOutcome({ drillType: "just_a_minute", outcome, level: 3 });
    const practised = (await getLeafRatings()).stalls!;
    await seedSkillRatings({ articulation: 15 });
    const after = await getLeafRatings();
    expect(after.stalls).toEqual(practised);
    expect(after.ums_uhs?.attempts).toBe(1);
    // A leaf nothing has touched still takes the seed.
    expect(after.restarts).toEqual({ rating: 15, attempts: 0 });
  });

  it("a retake's drills, which aren't placement samples, still count as practice", async () => {
    await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3, placement: false });
    expect((await getSkillStates()).cadence.attempts).toBe(1);
  });
});
