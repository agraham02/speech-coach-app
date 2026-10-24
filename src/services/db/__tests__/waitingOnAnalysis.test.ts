import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// The waiting state, against a real SQLite database with the real migrations:
// what Today lists as working / stuck / ready, a ready marker that goes when
// the result is opened, a Rewind that keeps what it needs to start again, and
// the launch-time resume of one that was cut off. Everything is made up; the
// device, network and recognizer are mocked.

let mockDb: ReturnType<typeof createTestDatabase>;
const mockTranscribe = jest.fn();
const mockDecode = jest.fn();

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({ getDatabase: async () => mockDb }));
jest.mock("../../sessions/sessionSubject", () => ({ describeSessionSubject: async (s: { id: string }) => ({ title: `Prompt ${s.id}`, category: null, typeLabel: "Impromptu", task: null }) }));
jest.mock("expo-file-system", () => ({
  File: class {
    exists = false;
    delete() {}
  },
}));
jest.mock("../../../domain/audioAnalysis", () => ({ decodeVideoAudio: (...a: unknown[]) => mockDecode(...a) }));
jest.mock("../../onDeviceAsr/onDeviceAsrClient", () => ({ transcribeOnDevice: (...a: unknown[]) => mockTranscribe(...a) }));
jest.mock("../../rewind/rewindStorage", () => ({
  compressRewindAudio: async () => null,
  deleteRewindAudio: () => undefined,
  resolveRewindUri: (f: string) => `file:///rewinds/${f}`,
  rewindAudioExists: () => false,
  writeRewindAudio: () => "x.wav",
}));
jest.mock("../../rewind/rewindReminder", () => ({ syncRewindReminder: async () => undefined }));
jest.mock("../../pipeline/jobQueue", () => ({
  runHeavy: <T,>(task: () => Promise<T>) => task(),
  runExclusive: <T,>(_key: string, task: () => Promise<T>) => task(),
}));
const mockRequestStep = jest.fn(async () => undefined);
jest.mock("../../pipeline/sessionPipeline", () => ({ requestStep: (...a: unknown[]) => mockRequestStep(...(a as [])) }));

import { runMigrations, LATEST_DB_VERSION } from "../migrations";
import { insertSession } from "../sessionsRepo";
import { putArtifact, getArtifact } from "../artifactsRepo";
import { createRewind, getRewind, listProcessingRewinds, updateRewind } from "../rewindRepo";
import { loadActiveTakes, markReadyUnseen, markResultSeen } from "../../pipeline/activeTakes";
import { retryOfflineReviews } from "../../pipeline/retryOfflineReviews";
import { resumeRewinds } from "../../rewind/rewindProcessor";
import type { Session } from "../../../domain/sessionTypes";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

function session(id: string, recordedAt: string): Session {
  return {
    id,
    promptId: `prompt-${id}`,
    recordedAt,
    videoPath: `/old/${id}.mp4`,
    durationSeconds: 60,
    transcriptionSource: "whisper" as Session["transcriptionSource"],
    transcriptVerbatim: null,
    transcriptClean: null,
    status: "processing",
    wantsGrading: true,
    sessionType: "spontaneous",
    scriptId: null,
    cuesEnabled: null,
    planPointText: null,
    planReasonText: null,
    planExampleText: null,
    videoFile: `${id}.mp4`,
    subjectExtras: null,
  } as Session;
}

async function steps(id: string, status: Record<string, string>) {
  for (const [step, s] of Object.entries(status)) {
    await mockDb.runAsync(`INSERT OR REPLACE INTO session_steps (session_id, step, status, attempts, updated_at) VALUES (?, ?, ?, 1, ?)`, [id, step, s, new Date().toISOString()]);
  }
}

const ALL_DONE = { transcribe: "done", audio_metrics: "done", presence: "skipped", coach: "done", cloud_review: "done" };

async function waitFor(check: () => Promise<boolean>, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("condition not met");
}

describeIfSqlite("the waiting state, from the database", () => {
  beforeEach(async () => {
    mockDb = createTestDatabase();
    await runMigrations(mockDb as never);
    mockTranscribe.mockReset();
    mockDecode.mockReset();
    mockRequestStep.mockClear();
  });

  it("migrates to the version that adds the Rewind pending column", async () => {
    const v = await mockDb.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(v?.user_version).toBe(LATEST_DB_VERSION);
    const columns = await mockDb.getAllAsync<{ name: string }>("PRAGMA table_info(day_recalls)");
    expect(columns.map((c) => c.name)).toContain("pending_json");
  });

  describe("Today's list of takes", () => {
    const now = new Date().toISOString();

    it("lists a take being worked on, one that did not finish, and one that is ready and unopened; leaves finished ones out", async () => {
      await insertSession(session("working", now));
      await steps("working", { ...ALL_DONE, audio_metrics: "running", coach: "pending", cloud_review: "pending" });
      await insertSession(session("stuck", now));
      await steps("stuck", { ...ALL_DONE, cloud_review: "failed" });
      await insertSession(session("ready", now));
      await steps("ready", ALL_DONE);
      await markReadyUnseen("ready");
      await insertSession(session("opened", now));
      await steps("opened", ALL_DONE);

      const list = await loadActiveTakes();
      expect(list.map((t) => [t.session.id, t.kind])).toEqual([
        ["working", "working"],
        ["stuck", "stuck"],
        ["ready", "ready"],
      ]);
      expect(list[0].work.current).toBe("audio_metrics");
      expect(list[0].title).toBe("Prompt working");
    });

    it("a ready take stops being listed once its result is opened", async () => {
      await insertSession(session("t", now));
      await steps("t", ALL_DONE);
      await markReadyUnseen("t");
      expect((await loadActiveTakes()).map((t) => t.kind)).toEqual(["ready"]);
      await markResultSeen("t");
      expect(await loadActiveTakes()).toEqual([]);
      expect(await getArtifact("t", "ready_unseen")).toBeNull();
    });

    it("leaves a failed take alone after a day, and never lists a deleted one", async () => {
      await insertSession(session("old", new Date(Date.now() - 26 * 3_600_000).toISOString()));
      await steps("old", { ...ALL_DONE, cloud_review: "failed" });
      await insertSession(session("gone", now));
      await steps("gone", { ...ALL_DONE, audio_metrics: "running" });
      await mockDb.runAsync(`UPDATE sessions SET deleted_at = ? WHERE id = 'gone'`, [now]);
      expect(await loadActiveTakes()).toEqual([]);
    });

    it("two takes at once are two rows, each with its own steps", async () => {
      await insertSession(session("a", now));
      await steps("a", { ...ALL_DONE, transcribe: "running", audio_metrics: "pending", coach: "pending", cloud_review: "pending" });
      await insertSession(session("b", now));
      await steps("b", { ...ALL_DONE, coach: "running", cloud_review: "pending" });
      const list = await loadActiveTakes();
      expect(list.map((t) => [t.session.id, t.work.current])).toEqual(
        expect.arrayContaining([
          ["a", "transcribe"],
          ["b", "coach"],
        ]),
      );
    });

    it("a review that failed for want of a connection is reported as waiting for one", async () => {
      await insertSession(session("offline", now));
      await steps("offline", { ...ALL_DONE, cloud_review: "failed" });
      await putArtifact("offline", "analysis", { take_review: { status: "unavailable", reason: "offline", at: now } });
      const [take] = await loadActiveTakes();
      expect(take.work.reviewWaitsForConnection).toBe(true);
    });
  });

  describe("a review that could not go", () => {
    const now = new Date().toISOString();

    it("is sent again when it failed for want of a connection, and only then", async () => {
      {
        await insertSession(session("offline", now));
        await steps("offline", { ...ALL_DONE, cloud_review: "failed" });
        await putArtifact("offline", "analysis", { take_review: { status: "unavailable", reason: "offline", at: now } });
        await insertSession(session("quota", now));
        await steps("quota", { ...ALL_DONE, cloud_review: "failed" });
        await putArtifact("quota", "analysis", { take_review: { status: "unavailable", reason: "quota", at: now } });
        await retryOfflineReviews();
        expect(mockRequestStep).toHaveBeenCalledTimes(1);
        expect(mockRequestStep).toHaveBeenCalledWith("offline", "cloud_review");
      }
    });
  });

  describe("Rewind", () => {
    const pending = { segments: ["file:///cache/a.wav"], liveText: "I woke up and made coffee and went to work", volume: [], durationMs: 70_000, resumes: 0 };

    it("keeps what it needs while processing and lets go of it when it finishes", async () => {
      const r = await createRewind(70, pending);
      expect((await listProcessingRewinds()).map((p) => p.pending?.liveText)).toEqual([pending.liveText]);
      await updateRewind(r.id, { status: "done" });
      expect(await listProcessingRewinds()).toEqual([]);
      const row = await mockDb.getFirstAsync<{ pending_json: string | null }>(`SELECT pending_json FROM day_recalls WHERE id = ?`, [r.id]);
      expect(row?.pending_json).toBeNull();
    });

    it("a take cut off by the app closing is picked up again at launch and finishes", async () => {
      // The recognizer audio files are gone: the live words are what is left.
      mockDecode.mockResolvedValue(null);
      const r = await createRewind(70, pending);
      await resumeRewinds();
      await waitFor(async () => (await getRewind(r.id))?.status === "done");
      const done = await getRewind(r.id);
      expect(done?.transcript).toBe(pending.liveText);
      expect(done?.transcriptSource).toBe("live");
      expect(done?.stats).not.toBeNull();
    });

    it("a take already resumed twice is kept as failed with what was heard, not tried again", async () => {
      const r = await createRewind(70, { ...pending, resumes: 2 });
      await resumeRewinds();
      const row = await getRewind(r.id);
      expect(row?.status).toBe("failed");
      expect(row?.transcript).toBe(pending.liveText);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("a processing take with nothing kept is closed as failed", async () => {
      await mockDb.runAsync(`INSERT INTO day_recalls (id, date, recorded_at, duration_seconds, status) VALUES ('bare', '2026-10-24', ?, 30, 'processing')`, [new Date().toISOString()]);
      await resumeRewinds();
      expect((await getRewind("bare"))?.status).toBe("failed");
    });
  });
});
