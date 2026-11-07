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
  getUserProfile: () => ({}),
  getCurriculumAutoLevel: () => null,
  getCurriculumOverride: () => null,
  setCurriculumAutoLevel: () => undefined,
  setCurriculumOverride: () => undefined,
}));
jest.mock("../../progress/progressEvents", () => ({ emitStageEarned: () => undefined }));

import { ensureSchema } from "../schema";
import { getSkillEvents, getSkillStates, recordDrillOutcome, seedSkillRatings } from "../progressRepo";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

const outcome = { score: 0.9, success: true } as never;

describeIfSqlite("the skill check's placement", () => {
  beforeEach(async () => {
    mockDb = createTestDatabase();
    await ensureSchema(mockDb as never);
  });

  it("a placement sample keeps the attempt but leaves the skill unplaced and unpractised", async () => {
    const change = await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3, placement: true });
    expect(change.ratingAfter).toBe(change.ratingBefore);
    expect(change.stagedUp).toBe(false);
    const skills = await getSkillStates();
    expect(skills.cadence.attempts).toBe(0);
    expect(skills.cadence.lastPracticedAt).toBeNull();
    const rows = await mockDb.getAllAsync<{ n: number }>("SELECT COUNT(*) AS n FROM drill_attempts");
    expect(rows[0].n).toBe(1);
    expect((await getSkillEvents("cadence")).filter((e) => e.source === "drill")).toHaveLength(0);
  });

  it("the seed then places the skills the check's drills touched", async () => {
    await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3, placement: true });
    await recordDrillOutcome({ drillType: "category_fluency", outcome, level: 3, placement: true });
    await seedSkillRatings({ cadence: 38, impromptu: 31, confidence: 22 });
    const skills = await getSkillStates();
    expect(skills.cadence.rating).toBe(38);
    expect(skills.impromptu.rating).toBe(31);
    expect(skills.confidence.rating).toBe(22);
    for (const skill of ["cadence", "impromptu", "confidence"] as const) {
      expect((await getSkillEvents(skill)).filter((e) => e.source === "seed")).toHaveLength(1);
    }
  });

  it("real practice before the check still wins over the sample", async () => {
    await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3 });
    const practised = (await getSkillStates()).cadence;
    expect(practised.attempts).toBe(1);
    await seedSkillRatings({ cadence: 15 });
    const after = (await getSkillStates()).cadence;
    expect(after.rating).toBe(practised.rating);
    expect(after.attempts).toBe(1);
  });

  it("a retake's drills, which aren't placement samples, still count as practice", async () => {
    await recordDrillOutcome({ drillType: "pace_reading", outcome, level: 3, placement: false });
    expect((await getSkillStates()).cadence.attempts).toBe(1);
  });
});
