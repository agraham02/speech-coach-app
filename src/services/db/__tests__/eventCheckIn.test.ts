import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";
import { rowToSpeakingEvent, type SpeakingEventRow } from "../mappers";

// The after-event check-in's two answers (how it went, whether you did your
// focus): the schema against a real SQLite database, the row mapping,
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

import { ensureSchema } from "../schema";
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
    await ensureSchema(mockDb as never);
  });

  it("has the two nullable columns", async () => {
    const columns = await mockDb.getAllAsync<{ name: string; notnull: number }>("PRAGMA table_info(speaking_events)");
    expect(columns.find((c) => c.name === "after_went")).toMatchObject({ notnull: 0 });
    expect(columns.find((c) => c.name === "after_focus_result")).toMatchObject({ notnull: 0 });
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
