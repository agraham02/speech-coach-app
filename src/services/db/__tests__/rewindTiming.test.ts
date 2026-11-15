import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// Rewind at any hour, against a real SQLite database with the real schema:
// a Rewind of yesterday keeps yesterday's date apart from when it was
// recorded, each day is told once, and the habit is read from the activity
// log (docs/overhaul/PLAN.md, 5.3). Every value is made up.

let mockDb: ReturnType<typeof createTestDatabase>;
let mockSetting: "auto" | "morning" | "evening" = "auto";

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({
  getDatabase: async () => mockDb,
  inTransaction: (db: { withTransactionAsync: (task: () => Promise<void>) => Promise<void> }, task: () => Promise<void>) => db.withTransactionAsync(task),
}));
jest.mock("../../prefs/prefsStore", () => ({ getRewindTime: () => mockSetting }));

import { ensureSchema } from "../schema";
import { logActivity } from "../activityLogRepo";
import { createRewind, getRewind, getRewindDates, hasRewindOn } from "../rewindRepo";
import { getRewindOffer, getRewindWindow } from "../../rewind/rewindTiming";
import { ACTIVITY_IDS } from "../../../content/activities";
import { rewindAboutDay } from "../../../domain/rewind/rewindTiming";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

// Thursday 12 November 2026.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const TODAY = "2026-11-12";
const YESTERDAY = "2026-11-11";

async function practise(...times: Date[]) {
  for (const t of times) await logActivity({ activityId: "drill:twister", at: t.toISOString() });
}

beforeEach(async () => {
  mockDb = createTestDatabase();
  await ensureSchema(mockDb as never);
  mockSetting = "auto";
});

describeIfSqlite("a Rewind about yesterday", () => {
  it("saves with yesterday's date and today's recording time", async () => {
    const r = await createRewind(75, undefined, YESTERDAY);
    expect(r.date).toBe(YESTERDAY);
    const saved = await getRewind(r.id);
    expect(saved?.date).toBe(YESTERDAY);
    expect(saved?.recordedAt).toBe(r.recordedAt);
    // Which tense the notes are asked in follows from the two days.
    expect(rewindAboutDay(saved!.date, at(12, 8).toISOString())).toBe("yesterday");
  });

  it("still defaults to today", async () => {
    const r = await createRewind(75);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(r.date).toBe(iso);
  });

  it("counts the day it is about as told, not the day it was recorded", async () => {
    await createRewind(75, undefined, YESTERDAY);
    expect(await hasRewindOn(YESTERDAY)).toBe(true);
    expect(await hasRewindOn(TODAY)).toBe(false);
    expect(await getRewindDates()).toEqual([YESTERDAY]);
  });
});

describeIfSqlite("what Rewind offers", () => {
  it("offers yesterday in the morning, then nothing once it is told", async () => {
    mockSetting = "morning";
    expect(await getRewindOffer(at(12, 8))).toEqual({ date: YESTERDAY, day: "yesterday" });
    await createRewind(75, undefined, YESTERDAY);
    expect(await getRewindOffer(at(12, 8))).toBeNull();
    expect(await getRewindOffer(at(13, 8))).toEqual({ date: TODAY, day: "yesterday" });
  });

  it("offers today in the evening, then nothing once it is told", async () => {
    mockSetting = "evening";
    expect(await getRewindOffer(at(12, 21))).toEqual({ date: TODAY, day: "today" });
    await createRewind(75, undefined, TODAY);
    expect(await getRewindOffer(at(12, 21))).toBeNull();
  });

  it("a deleted take no longer counts as told", async () => {
    mockSetting = "evening";
    const r = await createRewind(75, undefined, TODAY);
    await mockDb.runAsync(`UPDATE day_recalls SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), r.id]);
    expect(await getRewindOffer(at(12, 21))).toEqual({ date: TODAY, day: "today" });
  });
});

describeIfSqlite("the habit, read from the activity log", () => {
  const now = at(12, 22);

  it("is a morning person after mornings of practice", async () => {
    await practise(at(11, 7), at(10, 8), at(9, 7, 30), at(8, 9), at(6, 8), at(12, 7));
    expect(await getRewindWindow(now)).toBe("morning");
    expect(await getRewindOffer(at(12, 22))).toBeNull(); // not asked again that night
    expect(await getRewindOffer(at(12, 14))).toEqual({ date: YESTERDAY, day: "yesterday" });
  });

  it("is an evening person after evenings of practice", async () => {
    await practise(at(11, 20), at(10, 21), at(9, 19, 30), at(8, 22), at(6, 20));
    expect(await getRewindWindow(now)).toBe("evening");
    expect(await getRewindOffer(at(12, 20))).toEqual({ date: TODAY, day: "today" });
  });

  it("falls back to the evening with little to go on", async () => {
    await practise(at(11, 7));
    expect(await getRewindWindow(now)).toBe("evening");
  });

  it("ignores skipped steps, old entries and Rewind itself", async () => {
    // Four mornings, but all of them Rewind (which would feed back on itself), a skip and one too old.
    for (const t of [at(11, 7), at(10, 8), at(9, 7), at(8, 9)]) await logActivity({ activityId: ACTIVITY_IDS.rewind, at: t.toISOString() });
    await logActivity({ activityId: "drill:twister", outcome: "skipped", at: at(7, 8).toISOString() });
    await logActivity({ activityId: "drill:twister", at: new Date(2026, 9, 1, 8).toISOString() });
    expect(await getRewindWindow(now)).toBe("evening");
  });

  it("the setting overrides the habit", async () => {
    await practise(at(11, 20), at(10, 21), at(9, 19, 30), at(8, 22), at(6, 20));
    mockSetting = "morning";
    expect(await getRewindWindow(now)).toBe("morning");
    mockSetting = "evening";
    expect(await getRewindWindow(now)).toBe("evening");
  });
});
