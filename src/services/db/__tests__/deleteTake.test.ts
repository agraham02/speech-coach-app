import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// Delete means delete: after a take is deleted, nothing about it is left, and
// no aggregate counts it. These run against a real SQLite database (the real
// migrations), with the file, network and toast edges mocked. Every value here
// is made up; no real transcript or recording is used.

const mockDeletedFiles: string[] = [];
const mockRemoteDeletes: string[] = [];
let mockDb: ReturnType<typeof createTestDatabase>;

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({ getDatabase: async () => mockDb }));
jest.mock("../../prefs/prefsStore", () => ({
  getNextEvent: () => null,
  getReminderSettings: () => ({ practiceDays: [] }),
  getUserProfile: () => ({}),
  getCurriculumAutoLevel: () => null,
  getCurriculumOverride: () => null,
  setCurriculumAutoLevel: () => undefined,
  setCurriculumOverride: () => undefined,
}));
jest.mock("../../storage/videoStorage", () => ({
  deleteRecording: (uri: string) => mockDeletedFiles.push(uri),
  resolveVideoUri: (s: { videoFile: string | null; videoPath: string }) => `file:///sessions/${s.videoFile ?? s.videoPath}`,
  deleteExportCopies: () => 0,
}));
jest.mock("../../rewind/rewindStorage", () => ({ deleteRewindAudio: (name: string | null) => name && mockDeletedFiles.push(`rewinds/${name}`) }));
jest.mock("../../rewind/rewindReminder", () => ({ syncRewindReminder: async () => undefined }));
jest.mock("../../pipeline/steps/decodedAudioCache", () => ({ clearDecodedAudio: () => undefined }));
jest.mock("../../dev/devStore", () => ({ forgetTakeInDevStore: () => undefined }));
jest.mock("../../tono/tonoApi", () => ({ tonoDeleteFile: async (name: string) => void mockRemoteDeletes.push(name) }));
jest.mock("../../../components/common/ToastProvider", () => ({ showGlobalToast: () => undefined }));

import { runMigrations } from "../migrations";
import { insertSession, getAllSessionsWithScores, getRecentlyUsedPromptIds, getTodaysSession, markSessionDeleted, restoreSession } from "../sessionsRepo";
import { upsertScores, getPreviousOverallScore, getScoreHistoryBefore } from "../scoresRepo";
import { putArtifact, listArtifactsOfKind } from "../artifactsRepo";
import { markReviewPass, getSkillEvents, getSkillMovesSince, getPracticeDates, getStreakState, getDailySessionCounts, getReviewPasses } from "../progressRepo";
import { countImpromptuTakes } from "../curriculumRepo";
import { getCompletedSessionDates, getScoredSessionSummaries, getSessionMetricSeries, getUsageTotals, getWeeklySummaries, getPromptComparison } from "../statsRepo";
import { saveSkillCheck, listSkillChecks } from "../skillChecksRepo";
import { createRewind, updateRewind, listRewinds, getRewindDates } from "../rewindRepo";
import { getPracticeMarkerDates } from "../practiceDaysRepo";
import { deleteTake, finishPendingDeletes, freeUpSessionVideo, undoDeleteTake } from "../../data/takeDeletion";
import { purgeDeletedData } from "../../data/dataPurge";
import { isoDateFromDate } from "../../../utils/dateUtils";
import type { Session, SessionScores } from "../../../domain/sessionTypes";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

const DAY = 86_400_000;
const at = (daysAgo: number, hour = 12) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

function session(id: string, recordedAt: string, patch: Partial<Session> = {}): Session {
  return {
    id,
    promptId: `prompt-${id}`,
    recordedAt,
    videoPath: `/old/${id}.mp4`,
    durationSeconds: 60,
    transcriptionSource: "whisper" as Session["transcriptionSource"],
    transcriptVerbatim: `made up words for ${id}`,
    transcriptClean: `made up words for ${id}`,
    status: "done",
    wantsGrading: true,
    sessionType: "spontaneous",
    scriptId: null,
    cuesEnabled: null,
    planPointText: null,
    planReasonText: null,
    planExampleText: null,
    videoFile: `${id}.mp4`,
    subjectExtras: null,
    ...patch,
  } as Session;
}

function scores(sessionId: string, overall: number): SessionScores {
  return {
    sessionId,
    structureScore: 7,
    structureUsed: "none detected",
    structureNotes: "n",
    relevanceScore: 7,
    relevanceNotes: "n",
    coherenceScore: 7,
    coherenceNotes: "n",
    rateScore: 7,
    rateWpmAvg: 140,
    rateNotes: "n",
    volumeScore: 7,
    volumeNotes: "n",
    pitchMelodyScore: 7,
    pitchMelodyNotes: "n",
    tonalityScore: 7,
    tonalityNotes: "n",
    pausingScore: 7,
    pausingNotes: "n",
    eyeContactScore: 7,
    facialExpressivenessScore: 7,
    bodyLanguageNotes: "n",
    faceVoiceCongruenceScore: 7,
    archetypeDetected: "Educator",
    archetypeFitForTopic: "n",
    overallScore: overall,
    coachingSummary: "n",
    topStrength: "n",
    topFocusArea: "n",
    recommendedDrill: "n",
    annotations: [],
    cueComplianceScore: null,
    cueComplianceNotes: null,
  };
}

// Everything a finished take leaves behind, in every table that holds it.
async function addTake(id: string, recordedAt: string, overall: number, extra: Partial<Session> = {}) {
  await insertSession(session(id, recordedAt, extra));
  await mockDb.runAsync(`UPDATE sessions SET filler_rate_per_minute = 3, gemini_file_name = ? WHERE id = ?`, [extra.geminiFileName ?? null, id]);
  await upsertScores(scores(id, overall));
  // The take's score sheets (session 07): judged, since it has a review.
  await mockDb.runAsync(`UPDATE sessions SET session_score = ? WHERE id = ?`, [overall, id]);
  await putArtifact(id, "session_score", { version: 4, measured: null, judged: { layer: "judged", overall, categories: [] }, headline: "judged" });
  await putArtifact(id, "presence", { eyeContactSource: "gaze", eyeContactPercent: 50 });
  await putArtifact(id, "cloud_usage", { calls: [{ at: recordedAt, provider: "tono", model: "m" }] });
  await putArtifact(id, "pauses", [{ at: 1 }]);
  await markReviewPass(id, "watch");
  await mockDb.runAsync(`INSERT INTO session_steps (session_id, step, status, attempts, updated_at) VALUES (?, 'transcribe', 'done', 1, ?)`, [id, recordedAt]);
  await mockDb.runAsync(
    `INSERT INTO skill_events (id, skill, at, rating_before, rating_after, source, label, session_id) VALUES (?, 'pace', ?, 40, 45, 'rep', 'Rep', ?)`,
    [`ev-${id}`, recordedAt, id],
  );
}

// Every table with a session_id column, so a table added later is audited too.
async function sessionLinkedTables(): Promise<string[]> {
  const tables = await mockDb.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
  const found: string[] = [];
  for (const { name } of tables) {
    const cols = await mockDb.getAllAsync<{ name: string }>(`PRAGMA table_info(${name})`);
    if (cols.some((c) => c.name === "session_id")) found.push(name);
  }
  return found;
}

async function rowsAbout(id: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of await sessionLinkedTables()) {
    out[table] = (await mockDb.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [id]))!.n;
  }
  out.sessions = (await mockDb.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM sessions WHERE id = ?`, [id]))!.n;
  return out;
}

beforeEach(async () => {
  mockDeletedFiles.length = 0;
  mockRemoteDeletes.length = 0;
  mockDb = createTestDatabase();
  await runMigrations(mockDb as never);
});

describeIfSqlite("deleting a take", () => {
  it("covers every table that holds a session id", async () => {
    // If this list grows, make sure eraseSessionRows removes the new table's rows.
    expect((await sessionLinkedTables()).sort()).toEqual(
      ["review_passes", "scores", "session_artifacts", "session_steps", "skill_checks", "skill_events"].sort(),
    );
  });

  it("hides the take from every aggregate the moment it is deleted", async () => {
    await addTake("keep", at(3), 60);
    await addTake("gone", at(1), 90);
    await addTake("later", at(0, 23), 70);
    const before = await getScoredSessionSummaries();
    expect(before.map((s) => s.overallScore)).toEqual([60, 90, 70]);

    await markSessionDeleted("gone");

    expect((await getAllSessionsWithScores()).map((s) => s.id)).toEqual(["later", "keep"]);
    expect((await getScoredSessionSummaries()).map((s) => s.overallScore)).toEqual([60, 70]);
    expect(await countImpromptuTakes()).toBe(2);
    expect(await getCompletedSessionDates()).toHaveLength(2);
    expect(await getRecentlyUsedPromptIds(10)).not.toContain("prompt-gone");
    expect((await getUsageTotals()).reps).toBe(2);
    expect((await getSessionMetricSeries()).length).toBe(2);
    expect((await getSkillEvents("pace" as never)).map((e) => e.sessionId)).not.toContain("gone");
    expect(await getSkillMovesSince(at(10))).toHaveLength(1);
    expect(await listArtifactsOfKind("cloud_usage")).toHaveLength(2);
    // The best previous score no longer includes the deleted 90.
    expect((await getScoreHistoryBefore(at(0, 23).replace(/.$/, "Z"), "judged")).best).toBe(60);
    expect(await getPreviousOverallScore(at(0, 23), "judged")).toBe(60);
    const week = await getWeeklySummaries();
    expect(week.thisWeek.reps + week.lastWeek.reps).toBeLessThanOrEqual(2);
  });

  it("excludes a deleted take from the next-take comparison and today's take", async () => {
    await addTake("old", at(5), 50);
    await mockDb.runAsync(`UPDATE sessions SET prompt_id = 'same'`);
    await addTake("mid", at(3), 55);
    await addTake("new", at(1), 65);
    await mockDb.runAsync(`UPDATE sessions SET prompt_id = 'same'`);
    await markSessionDeleted("mid");
    const comparison = await getPromptComparison("new");
    expect(comparison?.previous.recordedAt).toBe(at(5));

    await addTake("today", new Date().toISOString(), 80);
    await markSessionDeleted("today");
    expect(await getTodaysSession()).toBeNull();
  });

  it("restores everything on undo", async () => {
    await addTake("a", at(1), 70);
    await markSessionDeleted("a");
    expect(await getAllSessionsWithScores()).toHaveLength(0);
    expect(await restoreSession("a")).toBe(true);
    expect(await getAllSessionsWithScores()).toHaveLength(1);
    expect(await getSkillEvents("pace" as never)).toHaveLength(1);
  });

  it("erases the row and every row about it, plus its files, and keeps only a bare date", async () => {
    await addTake("gone", at(2), 90, { geminiFileName: "files/abc" } as never);
    await addTake("keep", at(1), 60);
    const check = await saveSkillCheck({ topicId: null, sessionId: "gone", pieces: { talkSessionId: "gone" }, felt: 3, retakeOf: null });
    await saveSkillCheck({ topicId: null, sessionId: "keep", pieces: {}, felt: 3, retakeOf: check });

    expect(await deleteTake("session", "gone")).toBe(true);
    expect(await finishPendingDeletes()).toBe(1);

    const about = await rowsAbout("gone");
    expect(Object.values(about).every((n) => n === 0)).toBe(true);
    expect(mockDeletedFiles).toContain("file:///sessions/gone.mp4");
    expect(mockRemoteDeletes).toEqual(["files/abc"]);
    // The other take is untouched, and so is the check that was a retake of the deleted one.
    expect((await rowsAbout("keep")).sessions).toBe(1);
    const checks = await listSkillChecks();
    expect(checks.map((c) => c.sessionId)).toEqual(["keep"]);
    expect(checks[0].retakeOf).toBeNull();
    // Nothing of the take survives anywhere in the database file.
    const dump = JSON.stringify(
      await Promise.all(
        (await mockDb.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((t) => mockDb.getAllAsync(`SELECT * FROM ${t.name}`)),
      ),
    );
    expect(dump).not.toContain("made up words for gone");
    expect(dump).not.toContain("prompt-gone");
    expect(dump).not.toContain("files/abc");
    // The only trace is the local date.
    expect(await getPracticeMarkerDates()).toEqual([isoDateFromDate(new Date(at(2)))]);
  });

  it("can't be undone after the erase", async () => {
    await addTake("a", at(1), 70);
    await deleteTake("session", "a");
    await finishPendingDeletes();
    expect(await undoDeleteTake("session", "a")).toBe(false);
  });

  it("finishes a delete that was pending when the app was killed, at the next launch", async () => {
    await addTake("a", at(1), 70);
    await markSessionDeleted("a"); // no timer: the app died in the window
    await purgeDeletedData({ vacuum: false });
    expect((await rowsAbout("a")).sessions).toBe(0);
    expect(mockDeletedFiles).toContain("file:///sessions/a.mp4");
  });

  it("keeps the streak when every take of a day is deleted", async () => {
    await addTake("d2", at(2), 60);
    await addTake("d1", at(1), 60);
    await addTake("d0", at(0, 8), 60);
    const alive = await getStreakState();
    expect(alive.currentStreak).toBe(3);
    for (const id of ["d2", "d1", "d0"]) await deleteTake("session", id);
    await finishPendingDeletes();
    expect((await getAllSessionsWithScores())).toHaveLength(0);
    expect(await getCompletedSessionDates()).toHaveLength(0);
    expect((await getStreakState()).currentStreak).toBe(3);
    expect(await getPracticeDates()).toHaveLength(3);
    // "Practiced today" still reads true, from the marker.
    expect((await getDailySessionCounts())[isoDateFromDate(new Date())]).toBe(1);
  });

  it("does not count a take that was never finished toward the streak", async () => {
    await insertSession(session("err", at(1), { status: "error" }));
    await deleteTake("session", "err");
    await finishPendingDeletes();
    expect(await getPracticeMarkerDates()).toEqual([]);
  });

  it("removes rows a late pipeline step wrote after the take was gone", async () => {
    await addTake("a", at(1), 70);
    await deleteTake("session", "a");
    await finishPendingDeletes();
    await putArtifact("a", "coach", { late: true });
    await markReviewPass("a", "listen");
    await finishPendingDeletes();
    expect(Object.values(await rowsAbout("a")).every((n) => n === 0)).toBe(true);
    expect(await getReviewPasses("a")).toEqual([]);
  });

  it("frees up space without touching the transcript, scores or counts", async () => {
    await addTake("a", at(1), 70, { geminiFileName: "files/xyz" } as never);
    await freeUpSessionVideo({ id: "a", videoFile: "a.mp4", videoPath: "/old/a.mp4", geminiFileName: "files/xyz" });
    expect(mockDeletedFiles).toEqual(["file:///sessions/a.mp4"]);
    expect(mockRemoteDeletes).toEqual(["files/xyz"]);
    const rows = await getAllSessionsWithScores();
    expect(rows).toHaveLength(1);
    expect(rows[0].videoDeletedAt).not.toBeNull();
    expect(rows[0].transcriptClean).toContain("made up words");
    expect(rows[0].overallScore).toBe(70);
    expect((await getScoredSessionSummaries()).length).toBe(1);
    expect((await mockDb.getFirstAsync<{ g: string | null }>(`SELECT gemini_file_name AS g FROM sessions WHERE id = 'a'`))!.g).toBeNull();
  });
});

describeIfSqlite("deleting a Rewind", () => {
  it("erases the row and the audio, keeps the date, and undo works inside the window", async () => {
    const rewind = await createRewind(30);
    await updateRewind(rewind.id, { audioFile: "r1.wav", transcript: "made up rewind words", status: "done" });
    await deleteTake("rewind", rewind.id);
    expect(await listRewinds()).toHaveLength(0);
    expect(await undoDeleteTake("rewind", rewind.id)).toBe(true);
    expect(await listRewinds()).toHaveLength(1);

    await deleteTake("rewind", rewind.id);
    await finishPendingDeletes();
    expect(await mockDb.getAllAsync(`SELECT * FROM day_recalls`)).toEqual([]);
    expect(mockDeletedFiles).toContain("rewinds/r1.wav");
    expect(await getRewindDates()).toEqual([]);
    expect(await getPracticeMarkerDates()).toEqual([rewind.date]);
    expect((await getStreakState()).currentStreak).toBe(1);
  });
});

describeIfSqlite("other deleted rows", () => {
  it("are removed on the next purge, not after 30 days", async () => {
    await mockDb.runAsync(`INSERT INTO saved_phrases (id, text, created_at, deleted_at) VALUES ('p', 'made up phrase', ?, ?)`, [at(1), at(0)]);
    await mockDb.runAsync(`INSERT INTO marked_texts (id, title, shelf, text, marks_json, created_at, deleted_at) VALUES ('m', 't', 'line', 'made up line', '[]', ?, ?)`, [at(1), at(0)]);
    await purgeDeletedData({ vacuum: false });
    expect(await mockDb.getAllAsync(`SELECT * FROM saved_phrases`)).toEqual([]);
    expect(await mockDb.getAllAsync(`SELECT * FROM marked_texts`)).toEqual([]);
  });
});
