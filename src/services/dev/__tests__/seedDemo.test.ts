import { createTestDatabase, sqliteAvailable } from "../../db/__tests__/sqliteTestDb";

// The demo takes (Dev, App tools) against a real SQLite database with the
// real migrations: they are stored like real takes, their score sheets come
// from the taxonomy's own code, and removing them leaves nothing behind. The
// file, network and toast edges are mocked. Every word here is made up.

const mockDeletedFiles: string[] = [];
let mockDb: ReturnType<typeof createTestDatabase>;

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../../db/database", () => ({ getDatabase: async () => mockDb }));
jest.mock("../../prefs/prefsStore", () => {
  const fixed: Record<string, unknown> = {
    getNextEvent: () => null,
    getReminderSettings: () => ({ practiceDays: [] }),
    getUserProfile: () => ({ contexts: [], obstacles: [], startedAt: "2026-01-01" }),
    getFaceCalibration: () => null,
    getScoreVersion: () => 99,
    getAccountCacheRaw: () => null,
    getJudgeInput: () => "text",
    getCloudReviewDefault: () => false,
    hasTonoConsent: () => false,
  };
  // Anything else the module offers answers "nothing stored".
  return new Proxy({ __esModule: true }, { get: (target, name: string) => (name in target ? (target as never)[name] : (fixed[name] ?? (() => null))) });
});
jest.mock("../../storage/videoStorage", () => ({
  deleteRecording: (uri: string) => mockDeletedFiles.push(uri),
  resolveVideoUri: (s: { videoFile: string | null; videoPath: string }) => `file:///sessions/${s.videoFile ?? s.videoPath}`,
  deleteExportCopies: () => 0,
}));
jest.mock("react-native-mmkv", () => ({ createMMKV: () => ({ getString: () => undefined, set: () => undefined, remove: () => undefined }) }));
jest.mock("../../account/supabaseClient", () => ({ getSupabase: () => ({}) }));
jest.mock("expo-notifications", () => ({}));
const mockFiles = new Set<string>();
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.add(this.uri);
    }
    write() {}
  },
}));
jest.mock("../../rewind/rewindStorage", () => ({ deleteRewindAudio: () => undefined }));
jest.mock("../../rewind/rewindReminder", () => ({ syncRewindReminder: async () => undefined }));
jest.mock("../../pipeline/steps/decodedAudioCache", () => ({ clearDecodedAudio: () => undefined }));
jest.mock("../devStore", () => ({ forgetTakeInDevStore: () => undefined }));
jest.mock("../../tono/tonoApi", () => ({ tonoDeleteFile: async () => undefined }));
jest.mock("../../../components/common/ToastProvider", () => ({ showGlobalToast: () => undefined }));
jest.mock("../../sessions/repProgress", () => ({ settleRepProgress: async () => undefined }));
// The coach step asks the AnalysisService for the rules' coaching; here the
// rules answer directly, with no account or network behind them.
jest.mock("../../analysis", () => {
  const { rulesProvider } = jest.requireActual("../../analysis/providers/rules");
  return {
    requestAnalysis: async (kind: string, input: unknown) => {
      const out = await rulesProvider.run(kind, input, {}, {});
      return out.ok ? { status: "done", value: out.value, provenance: out.provenance } : { status: "unavailable", reason: out.reason };
    },
  };
});

import { runMigrations } from "../../db/migrations";
import { addDemoData, countDemoData, removeDemoData } from "../seedDemo";
import { DEMO_CHAINS, DEMO_ID_PREFIX, DEMO_REWINDS, DEMO_TAKES, demoSessionId } from "../../../domain/dev/demoTakes";
import { getAllSessionsWithScores, getSessionById } from "../../db/sessionsRepo";
import { getArtifact, listArtifacts } from "../../db/artifactsRepo";
import { getSessionSteps } from "../../db/stepsRepo";
import { getScoreSeries, getSessionMetricSeries } from "../../db/statsRepo";
import { getStreakState, getPracticeDates } from "../../db/progressRepo";
import { listRewinds } from "../../db/rewindRepo";
import { getPracticeMarkerDates } from "../../db/practiceDaysRepo";
import { getTakeSignals } from "../../signals/signalsStore";
import { SUBCATEGORIES } from "../../../domain/scoring/taxonomy";
import { headlineSheet, SCORE_SHEET_VERSION, type TakeScores } from "../../../domain/scoring/takeScore";
import { isoDateFromDate } from "../../../utils/dateUtils";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;
const OPTIONS = { placeholderMedia: false, moveRatings: false };

beforeEach(async () => {
  mockDeletedFiles.length = 0;
  mockFiles.clear();
  mockDb = createTestDatabase();
  await runMigrations(mockDb as never);
});

describeIfSqlite("demo takes", () => {
  it("adds a full set through the real data path", async () => {
    const result = await addDemoData(OPTIONS);
    expect(result).toEqual({ takes: DEMO_TAKES.length, rewinds: DEMO_REWINDS.length, drills: DEMO_CHAINS.length, skipped: 0 });
    expect(await countDemoData()).toEqual({ takes: DEMO_TAKES.length, rewinds: DEMO_REWINDS.length, drills: DEMO_CHAINS.length });
    // Every demo id starts with the tag, so only they are ever removed.
    const sessions = await getAllSessionsWithScores();
    expect(sessions).toHaveLength(DEMO_TAKES.length);
    for (const s of sessions) expect(s.id.startsWith(DEMO_ID_PREFIX)).toBe(true);
  });

  it("stores each take as a finished, scored take with its steps, words and signals", async () => {
    await addDemoData(OPTIONS);
    for (const spec of DEMO_TAKES) {
      const id = demoSessionId(spec.key);
      const session = (await getSessionById(id))!;
      expect(session.status).toBe("done");
      expect(session.transcriptVerbatim).toBeTruthy();
      expect(session.transcriptWords!.length).toBeGreaterThan(5);
      expect(session.dspStatus).toBe("complete");
      expect(session.videoFile).toBe(`${id}.mp4`);
      expect(session.wantsGrading).toBe(!!spec.judged);
      const steps = await getSessionSteps(id);
      expect(steps.map((s) => s.step)).toEqual(["transcribe", "audio_metrics", "presence", "coach", "cloud_review"]);
      expect(steps.find((s) => s.step === "cloud_review")!.status).toBe(spec.judged ? "done" : "skipped");
      expect(steps.find((s) => s.step === "presence")!.status).toBe(spec.face ? "done" : "skipped");
      const signals = (await getTakeSignals(id))!;
      expect(signals.audio!.frames).toBeGreaterThan(100);
      expect(!!signals.face).toBe(!!spec.face);
      const kinds = (await listArtifacts(id)).map((a) => a.kind);
      expect(kinds).toEqual(expect.arrayContaining(["signals", "coach", "session_score"]));
      expect(kinds.includes("analysis")).toBe(!!spec.judged);
      expect(kinds.includes("judged_review")).toBe(!!spec.judged);
      // Even a take with no voice has its (empty) pause analysis.
      expect(kinds.includes("pauses")).toBe(true);
    }
  });

  it("builds score sheets that agree with the taxonomy", async () => {
    await addDemoData(OPTIONS);
    const withSheets = await getAllSessionsWithScores();
    for (const s of withSheets) {
      const scores = (await getArtifact<TakeScores>(s.id, "session_score"))!;
      expect(scores.version).toBe(SCORE_SHEET_VERSION);
      const headline = headlineSheet(scores);
      expect(s.overallScore).toBe(headline.overall);
      // Every sub-score is a taxonomy id; every category's score lies between its sub-scores.
      for (const sheet of [scores.measured, scores.judged]) {
        if (!sheet) continue;
        const weights = sheet.categories.reduce((a, c) => a + c.weight, 0);
        expect(weights).toBeCloseTo(1, 5);
        for (const category of sheet.categories) {
          const scored = category.subscores.filter((x) => x.rollsUp).map((x) => x.score);
          expect(category.score).toBeGreaterThanOrEqual(Math.min(...scored) - 0.06);
          expect(category.score).toBeLessThanOrEqual(Math.max(...scored) + 0.06);
          for (const sub of category.subscores) expect(SUBCATEGORIES[sub.id]).toBeDefined();
        }
      }
    }
    // The judged takes lead with the judged sheet; the rest have only the measured one.
    const judged = DEMO_TAKES.filter((t) => t.judged).map((t) => demoSessionId(t.key));
    for (const s of withSheets) {
      const scores = (await getArtifact<TakeScores>(s.id, "session_score"))!;
      expect(scores.headline).toBe(judged.includes(s.id) ? "judged" : "measured");
      expect(!!scores.judged).toBe(judged.includes(s.id));
      expect(s.scoreLayer).toBe(judged.includes(s.id) ? "judged" : "measured");
    }
  });

  it("gives the flat and lively pair different pitch ranges and scores", async () => {
    await addDemoData(OPTIONS);
    const flat = (await getSessionById(demoSessionId("flat")))!;
    const lively = (await getSessionById(demoSessionId("lively")))!;
    expect(flat.pitchRangeSt).not.toBeNull();
    expect(lively.pitchRangeSt).not.toBeNull();
    expect(flat.pitchRangeSt!).toBeLessThan(2.5);
    expect(lively.pitchRangeSt!).toBeGreaterThan(flat.pitchRangeSt! + 3);
    const melody = async (key: string) =>
      (await getArtifact<TakeScores>(demoSessionId(key), "session_score"))!.measured!.categories.flatMap((c) => c.subscores).find((x) => x.id === "melody")!.score;
    expect(await melody("lively")).toBeGreaterThan(await melody("flat"));
  });

  it("counts fillers, finds stalls, and handles the very short and the silent take", async () => {
    await addDemoData(OPTIONS);
    const fillers = (await getTakeSignals(demoSessionId("fillers")))!.summary;
    expect(fillers.fillers!.hesitation).toBeGreaterThanOrEqual(5);
    expect(fillers.pauses!.hesitations).toBeGreaterThanOrEqual(1);
    const clean = (await getTakeSignals(demoSessionId("lively")))!.summary;
    expect(clean.fillers!.hesitation).toBe(0);

    const short = (await getSessionById(demoSessionId("very-short")))!;
    expect(short.durationSeconds).toBeLessThanOrEqual(10);

    const silent = (await getTakeSignals(demoSessionId("silent")))!;
    expect(silent.summary.pitch).toBeNull();
    expect(silent.summary.loudness).toBeNull();
    expect((await getSessionById(demoSessionId("silent")))!.pitchRangeSt).toBeNull();
  });

  it("makes the judged take's review pass the real schema, with annotations located in the transcript", async () => {
    await addDemoData(OPTIONS);
    const id = demoSessionId("judged");
    const review = (await getArtifact<{ subscores: Record<string, unknown>; annotations: { quote: string }[] }>(id, "judged_review"))!;
    expect(Object.keys(review.subscores).length).toBeGreaterThanOrEqual(8);
    expect(review.annotations.length).toBeGreaterThanOrEqual(3);
    const transcript = (await getSessionById(id))!.transcriptVerbatim!.toLowerCase();
    for (const a of review.annotations) expect(transcript.includes(a.quote.toLowerCase())).toBe(true);
    const coach = (await getArtifact<{ provenance?: { producer: string } }>(id, "coach"))!;
    expect(coach.provenance?.producer).toBe("tono_ai");
    const analysis = (await getArtifact<{ take_review?: { status: string; provenance?: { model?: string } } }>(id, "analysis"))!;
    expect(analysis.take_review).toMatchObject({ status: "done", provenance: { model: "demo-synthetic" } });
  });

  it("spreads takes over several days and months, with a streak ending today", async () => {
    await addDemoData(OPTIONS);
    const sessions = await getAllSessionsWithScores();
    const months = new Set(sessions.map((s) => s.recordedAt.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(4);
    const series = await getScoreSeries();
    expect(series.length).toBe(DEMO_TAKES.length);
    expect((await getSessionMetricSeries()).length).toBeGreaterThan(8);
    const streak = await getStreakState();
    expect(streak.currentStreak).toBeGreaterThanOrEqual(6);
    const dates = (await getPracticeDates()).map((d) => (d.length > 10 ? isoDateFromDate(new Date(d)) : d));
    expect(dates).toContain(isoDateFromDate(new Date()));
  });

  it("adds Rewinds (one with notes) and Word Chain and Bridge Chain attempts", async () => {
    await addDemoData(OPTIONS);
    const rewinds = await listRewinds();
    expect(rewinds).toHaveLength(DEMO_REWINDS.length);
    expect(rewinds.filter((r) => r.review).length).toBe(1);
    expect(rewinds.every((r) => r.status === "done" && r.stats!.words > 20 && r.words!.length === r.stats!.words)).toBe(true);
    const drills = await mockDb.getAllAsync<{ drill_type: string; score: number | null }>(`SELECT drill_type, score FROM drill_attempts ORDER BY drill_type`);
    expect(drills.map((d) => d.drill_type)).toEqual(["chain_bridge", "word_chain"]);
    expect(drills.every((d) => d.score != null)).toBe(true);
  });

  it("is safe to add twice: nothing is duplicated", async () => {
    await addDemoData(OPTIONS);
    const second = await addDemoData(OPTIONS);
    expect(second.takes + second.rewinds + second.drills).toBe(0);
    expect(second.skipped).toBe(DEMO_TAKES.length + DEMO_REWINDS.length + DEMO_CHAINS.length);
    expect((await countDemoData()).takes).toBe(DEMO_TAKES.length);
  });

  it("removes only demo rows, through the real delete path, and leaves no streak marker or child row", async () => {
    // A real take the person made, which must survive.
    await mockDb.runAsync(
      `INSERT INTO sessions (id, prompt_id, recorded_at, video_path, duration_seconds, transcription_source, status, wants_grading, session_type) VALUES ('real-1', 't001', ?, '', 30, 'whisper_ondevice', 'done', 0, 'spontaneous')`,
      [new Date().toISOString()],
    );
    await addDemoData(OPTIONS);
    const markersBefore = await getPracticeMarkerDates();
    const removed = await removeDemoData();
    expect(removed.takes).toBe(DEMO_TAKES.length);
    expect(await countDemoData()).toEqual({ takes: 0, rewinds: 0, drills: 0 });
    expect((await getAllSessionsWithScores()).map((s) => s.id)).toEqual(["real-1"]);
    for (const table of ["session_steps", "session_artifacts", "scores", "skill_events", "review_passes"]) {
      const n = await mockDb.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id LIKE ?`, [`${DEMO_ID_PREFIX}%`]);
      expect(n!.n).toBe(0);
    }
    expect(await getPracticeMarkerDates()).toEqual(markersBefore);
    // The file path of every erased take went through the app's delete.
    expect(mockDeletedFiles.length).toBe(DEMO_TAKES.length);
    expect(await listRewinds()).toHaveLength(0);
  });

  it("writes a small placeholder file for each take only when asked, and removal deletes it", async () => {
    await addDemoData(OPTIONS);
    expect(mockFiles.size).toBe(0);
    await removeDemoData();
    await addDemoData({ ...OPTIONS, placeholderMedia: true });
    expect(mockFiles.size).toBe(DEMO_TAKES.length);
    for (const uri of mockFiles) expect(uri).toContain("sessions/demo-take-");
    mockDeletedFiles.length = 0;
    await removeDemoData();
    expect(mockDeletedFiles.length).toBe(DEMO_TAKES.length);
  });

  it("can be added again after being removed", async () => {
    await addDemoData(OPTIONS);
    await removeDemoData();
    const again = await addDemoData(OPTIONS);
    expect(again.takes).toBe(DEMO_TAKES.length);
  });
});
