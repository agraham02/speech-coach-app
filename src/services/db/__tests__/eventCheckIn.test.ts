import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";
import { rowToSpeakingEvent, type SpeakingEventRow } from "../mappers";

// The after-event check-in's two answers (how it went, whether you did your
// focus): the v36 migration against a real SQLite database, the row mapping,
// and saving through the repo. Everything is made up.

let mockDb: ReturnType<typeof createTestDatabase>;

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({ getDatabase: async () => mockDb }));
jest.mock("../../events/eventReminders", () => ({ syncEventReminders: async () => undefined }));
jest.mock("../../prefs/prefsStore", () => ({
  getUserProfile: () => null,
  setUserProfile: () => undefined,
  setNextEvent: () => undefined,
}));

import { runMigrations, LATEST_DB_VERSION } from "../migrations";
import { createEvent, deleteEvent, getEvent, saveAfterCheckIn } from "../eventsRepo";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

const baseRow: SpeakingEventRow = {
  id: "e1",
  kind: "talk",
  title: null,
  event_date: "2026-10-20",
  created_at: "2026-10-01T09:00:00.000Z",
  before_json: JSON.stringify({ nerves: 7, focus: "Pause before the main point", at: "2026-10-19T12:00:00.000Z" }),
  after_json: JSON.stringify({ nerves: 4, wentOkay: "Opening", tryNext: "Slower", at: "2026-10-21T12:00:00.000Z" }),
  after_went: null,
  after_focus_result: null,
};

describe("rowToSpeakingEvent", () => {
  it("reads both new answers from their columns", () => {
    const event = rowToSpeakingEvent({ ...baseRow, after_went: 4, after_focus_result: "partly" });
    expect(event.after).toEqual({ nerves: 4, went: 4, focusResult: "partly", wentOkay: "Opening", tryNext: "Slower", at: "2026-10-21T12:00:00.000Z" });
    expect(event.before?.focus).toBe("Pause before the main point");
  });

  it("keeps an old row valid: null columns mean not answered", () => {
    const event = rowToSpeakingEvent(baseRow);
    expect(event.after).toMatchObject({ nerves: 4, wentOkay: "Opening", went: null, focusResult: null });
  });

  it("ignores values that are not a stop or a focus answer", () => {
    expect(rowToSpeakingEvent({ ...baseRow, after_went: 9, after_focus_result: "maybe" }).after).toMatchObject({ went: null, focusResult: null });
    expect(rowToSpeakingEvent({ ...baseRow, after_went: 0 }).after?.went).toBeNull();
  });

  it("has no after check-in without its JSON, whatever the columns say", () => {
    expect(rowToSpeakingEvent({ ...baseRow, after_json: null, after_went: 3, after_focus_result: "yes" }).after).toBeNull();
    expect(rowToSpeakingEvent({ ...baseRow, after_json: "{not json", after_went: 3 }).after).toBeNull();
  });

  it("falls back to other for an unknown kind", () => {
    expect(rowToSpeakingEvent({ ...baseRow, kind: "gala" }).kind).toBe("other");
  });
});

describeIfSqlite("the after-event check-in, from the database", () => {
  beforeEach(async () => {
    mockDb = createTestDatabase();
    await runMigrations(mockDb as never);
  });

  it("migrates to v36 and adds the two nullable columns", async () => {
    expect(LATEST_DB_VERSION).toBeGreaterThanOrEqual(36);
    const v = await mockDb.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(v?.user_version).toBe(LATEST_DB_VERSION);
    const columns = await mockDb.getAllAsync<{ name: string; notnull: number }>("PRAGMA table_info(speaking_events)");
    expect(columns.find((c) => c.name === "after_went")).toMatchObject({ notnull: 0 });
    expect(columns.find((c) => c.name === "after_focus_result")).toMatchObject({ notnull: 0 });
  });

  it("upgrades a v35 database without touching the rows already there", async () => {
    const old = createTestDatabase();
    await runMigrations(old as never);
    old.raw.exec("ALTER TABLE speaking_events DROP COLUMN after_went; ALTER TABLE speaking_events DROP COLUMN after_focus_result; PRAGMA user_version = 35;");
    await old.runAsync(`INSERT INTO speaking_events (id, kind, title, event_date, created_at, after_json) VALUES (?, ?, ?, ?, ?, ?)`, [
      "old",
      "pitch",
      null,
      "2026-09-01",
      "2026-08-01T09:00:00.000Z",
      JSON.stringify({ nerves: 5, wentOkay: "x", tryNext: "y", at: "2026-09-02T12:00:00.000Z" }),
    ]);
    await runMigrations(old as never);
    const row = await old.getFirstAsync<SpeakingEventRow>("SELECT * FROM speaking_events WHERE id = 'old'");
    expect(row).toMatchObject({ after_went: null, after_focus_result: null });
    expect(rowToSpeakingEvent(row as SpeakingEventRow).after).toMatchObject({ nerves: 5, went: null, focusResult: null });
  });

  it("saves both answers with the check-in and reads them back", async () => {
    const id = await createEvent({ kind: "talk", title: null, date: "2026-10-20" });
    await saveAfterCheckIn(id, { nerves: 3, went: 5, focusResult: "yes", wentOkay: "  Opening ", tryNext: "" });
    const event = await getEvent(id);
    expect(event?.after).toMatchObject({ nerves: 3, went: 5, focusResult: "yes", wentOkay: "Opening", tryNext: "" });
    const row = await mockDb.getFirstAsync<{ after_json: string; after_went: number; after_focus_result: string }>("SELECT * FROM speaking_events WHERE id = ?", [id]);
    expect(row?.after_went).toBe(5);
    expect(row?.after_focus_result).toBe("yes");
    expect(JSON.parse(row?.after_json ?? "{}")).not.toHaveProperty("went");
  });

  it("saves a skipped answer as null, and a later save replaces both", async () => {
    const id = await createEvent({ kind: "talk", title: null, date: "2026-10-20" });
    await saveAfterCheckIn(id, { nerves: null, went: null, focusResult: null, wentOkay: "", tryNext: "" });
    expect((await getEvent(id))?.after).toMatchObject({ went: null, focusResult: null });
    await saveAfterCheckIn(id, { nerves: null, went: 2, focusResult: "not", wentOkay: "", tryNext: "" });
    await saveAfterCheckIn(id, { nerves: null, went: 3, focusResult: "partly", wentOkay: "", tryNext: "" });
    expect((await getEvent(id))?.after).toMatchObject({ went: 3, focusResult: "partly" });
  });

  it("clears the answers when the event is deleted", async () => {
    const id = await createEvent({ kind: "talk", title: null, date: "2026-10-20" });
    await saveAfterCheckIn(id, { nerves: 3, went: 5, focusResult: "yes", wentOkay: "", tryNext: "" });
    await deleteEvent(id);
    const row = await mockDb.getFirstAsync<SpeakingEventRow>("SELECT * FROM speaking_events WHERE id = ?", [id]);
    expect(row).toMatchObject({ after_json: null, after_went: null, after_focus_result: null });
  });
});
