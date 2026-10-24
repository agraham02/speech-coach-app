import type { AnalysisContext } from "../../../domain/analysis/types";
import type { Session } from "../../../domain/sessionTypes";
import type { TakeReviewInput } from "../kinds";

const mockGenerate = jest.fn();
const mockEnsure = jest.fn(async () => undefined);
const mockResolveUpload = jest.fn();

jest.mock("../../prefs/prefsStore", () => ({
  getUserProfile: () => null,
  getShareProfileWithReviews: () => false,
  getNextEvent: () => null,
}));
jest.mock("../../sessions/sessionScoreService", () => ({ measuredVoice: () => ({ wpmAvg: 142, pitchRangeSt: 5 }) }));
jest.mock("../../tono/tonoApi", () => ({ tonoGenerate: (...a: unknown[]) => mockGenerate(...a) }));
jest.mock("../../tono/upload", () => ({ resolveUploadForGrading: (...a: unknown[]) => mockResolveUpload(...a) }));
jest.mock("../../account/accountStore", () => ({ ensureAccount: () => mockEnsure() }));
jest.mock("../../pipeline/earlyUpload", () => ({ earlyUploadSettled: async () => undefined }));
jest.mock("../../db/sessionsRepo", () => ({ getSessionById: async () => null, updateSessionGeminiFile: jest.fn() }));
jest.mock("../../storage/videoStorage", () => ({ resolveVideoUri: () => "file:///take.mp4", videoExists: () => true }));
jest.mock("expo-file-system", () => ({
  File: class {
    size = 1000;
  },
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-0001-0002" }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { tonoAiProvider } from "../providers/tonoAi";
import { rulesProvider } from "../providers/rules";

// What the server sends back for a task.
const reply = (output: unknown, model = "gemini-3.5-flash-lite", promptVersion = "p/1") => ({ output, model, usedFallback: false, promptVersion, schemaVersion: 1, usage: null, allowance: null });
const problemsOf = (call: number) => ((mockGenerate.mock.calls[call][0] as { inputs: { problems?: string[] } }).inputs.problems ?? []).join(" ");

const ctx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  tier: "plus",
  tono: { consent: true, allowed: { take: true, text: true, insight: true }, killSwitch: false },
  isAdult: true,
  minorsMayUseAi: false,
  takeOptIn: true,
  judgeInput: "text",
  hasVideo: true,
  hasTranscript: true,
  flags: {},
  ...patch,
});

const session = {
  id: "s1",
  durationSeconds: 60,
  transcriptVerbatim: "um so my point is simple, start small and keep going",
  transcriptWords: null,
  wpmCurve: null,
  fillerWordCount: 1,
  fillerRatePerMinute: 1,
  repeatedWordCount: 0,
  pitchMinHz: 90,
  pitchMaxHz: 150,
  pitchAvgHz: 110,
  volumeAvgDbfs: -25,
  volumeStddevDbfs: 4,
} as unknown as Session;

const take: TakeReviewInput = {
  session,
  context: { kind: "prompt", promptText: "What should a beginner do first?" },
  pauses: null,
  presence: null,
  stutterMode: false,
};

const sub = (score: number) => ({ score, notes: "n", evidence: "start small" });
const judgedAnswer = {
  transcript_clean: "So my point is simple: start small and keep going.",
  structure_used: "what/why/how",
  subscores: { pace: sub(7), pauses: sub(6), melody: sub(5), emphasis: sub(5), structure: sub(6), relevance: sub(7), clarity: sub(6), eye_contact: sub(5), expression: sub(5), conviction: sub(6) },
  annotations: [
    { quote: "start small and keep going", subcategory: "structure", note: "A clear point." },
    { quote: "words never said", subcategory: "clarity", note: "Made up." },
  ],
  coaching: { summary: "s", strength: "t", focus: "f", drill: "d" },
  quick_coach: { strength: "Clear point.", tip: "Pause after it.", focus_skill: "cadence", follow_up_question: "Why?" },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Tono AI take review from the transcript (the default)", () => {
  it("sends the task and structured inputs, never a prompt or the video", async () => {
    mockGenerate.mockResolvedValue(reply(judgedAnswer, "gemini-3.5-flash-lite", "take-review/2026-10-23/text"));
    const out = await tonoAiProvider.run("take_review", take, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "text" });
    const request = mockGenerate.mock.calls[0][0];
    expect(mockEnsure).toHaveBeenCalled();
    expect(request).toMatchObject({ task: "take_review", schemaVersion: 3, inputs: { takeKind: "impromptu", prompt: "What should a beginner do first?", transcript: session.transcriptVerbatim } });
    expect(request.media).toBeUndefined();
    expect(JSON.stringify(request)).not.toMatch(/You are a/);
    expect(request.inputs.measurements).toMatchObject({ durationSeconds: 60, pace: { wpm: 142 } });
    expect(out).toMatchObject({
      ok: true,
      value: { heardAudio: false, review: { subscores: { structure: { score: 6 }, conviction: { score: 6 } }, quickCoach: judgedAnswer.quick_coach } },
      provenance: { producer: "tono_ai", model: "gemini-3.5-flash-lite", promptVersion: "take-review/2026-10-23/text", judged: true, input: "text" },
    });
    // Only annotations that quote the real words are kept.
    expect(out.ok && out.value.review.annotations.map((x) => x.quote)).toEqual(["start small and keep going"]);
  });

  it("uploads the video and still sends the phone transcript when routing says video", async () => {
    mockResolveUpload.mockResolvedValue({ uploaded: { name: "files/abc", uri: "u", mimeType: "video/mp4", state: "ACTIVE" }, reused: false });
    mockGenerate.mockResolvedValue(reply(judgedAnswer));
    const out = await tonoAiProvider.run("take_review", take, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "video" });
    const request = mockGenerate.mock.calls[0][0];
    expect(request.media).toEqual({ fileName: "files/abc", videoSeconds: 60 });
    expect(request.inputs.transcript).toBe(session.transcriptVerbatim);
    expect(out).toMatchObject({ ok: true, value: { heardAudio: false, videoBytes: 1000 }, provenance: { input: "video" } });
  });

  it("cannot judge a take with no transcript from the words", async () => {
    const out = await tonoAiProvider.run("take_review", { ...take, session: { ...session, transcriptVerbatim: null } as Session }, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "text" });
    expect(out).toMatchObject({ ok: false, reason: "no_input" });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("refuses an answer with too little in it", async () => {
    mockGenerate.mockResolvedValue(reply({ ...judgedAnswer, subscores: { pace: sub(7) } }));
    const out = await tonoAiProvider.run("take_review", take, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "text" });
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });
});

const DAY =
  "I woke up around seven and made oatmeal with too much cinnamon. At the office I sat through a long planning meeting where nobody agreed on anything. In the evening I got home, cooked a stir fry and read on the couch while the rain started.";
const dayAnswer = (over: Record<string, unknown> = {}) => ({
  parts: {
    morning: { status: "covered", evidence: "made oatmeal with too much cinnamon" },
    midday: { status: "covered", evidence: "a long planning meeting where nobody agreed" },
    evening: { status: "covered", evidence: "cooked a stir fry and read on the couch" },
  },
  specificity: "The cinnamon made the oatmeal real.",
  storytelling: "The meeting was a small scene; the rest was a list.",
  flow: "You moved in order through the day.",
  vividDetail: "a long planning meeting where nobody agreed on anything",
  tryTomorrow: "Say what you felt in the meeting.",
  ...over,
});

describe("Tono AI notes on a Rewind", () => {
  const route = { producers: ["tono_ai" as const], blocked: null };

  it("keeps notes that check out, with the coverage worded by the phone", async () => {
    mockGenerate.mockResolvedValue(reply(dayAnswer()));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({
      ok: true,
      value: { coverage: expect.stringMatching(/^All three parts/), parts: { evening: { status: "covered" } } },
      provenance: { producer: "tono_ai", model: "gemini-3.5-flash-lite", input: "text" },
    });
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({ task: "rewind_notes", schemaVersion: 2, inputs: { transcript: DAY } });
  });

  it("asks once more, naming the problem, when the first answer calls the evening missing", async () => {
    mockGenerate.mockResolvedValueOnce(reply(dayAnswer({ parts: { ...dayAnswer().parts, evening: { status: "missing", evidence: "" } } }))).mockResolvedValueOnce(reply(dayAnswer()));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(problemsOf(1)).toContain("evening as missing");
    expect(out).toMatchObject({ ok: true, value: { parts: { evening: { status: "covered" } } } });
  });

  it("shows no notes at all when a quote is made up twice", async () => {
    const made = dayAnswer({ parts: { ...dayAnswer().parts, morning: { status: "covered", evidence: "I ran five miles before sunrise" } } });
    mockGenerate.mockResolvedValue(reply(made));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("rejects notes that turn into a score", async () => {
    mockGenerate.mockResolvedValue(reply(dayAnswer({ storytelling: "8/10" })));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

});

describe("Tono AI judging a Word Chain", () => {
  const route = { producers: ["tono_ai" as const], blocked: null };
  const input = { segments: [{ seed: "pen", words: ["ink", "octopus", "banana"] }] };
  const good = {
    links: [
      { n: 1, verdict: "strong", reason: "Pens write with ink." },
      { n: 2, verdict: "strong", reason: "Octopuses squirt ink." },
      { n: 3, verdict: "none", reason: "No connection." },
    ],
  };

  it("sends only the numbered pairs, as a short text task", async () => {
    mockGenerate.mockResolvedValue(reply(good));
    const out = await tonoAiProvider.run("word_chain", input, ctx(), route);
    const call = mockGenerate.mock.calls[0][0];
    expect(call).toMatchObject({ task: "word_chain", inputs: { pairs: [{ n: 1, from: "pen", to: "ink" }, { n: 2, from: "ink", to: "octopus" }, { n: 3, from: "octopus", to: "banana" }] } });
    expect(call.media).toBeUndefined();
    expect(out).toMatchObject({ ok: true, value: { links: [{ from: "pen", to: "ink", verdict: "strong" }, {}, { to: "banana", verdict: "none" }] }, provenance: { producer: "tono_ai", judged: true } });
  });

  it("asks again when a link is missing, and gives up if it still is", async () => {
    mockGenerate.mockResolvedValue(reply({ links: good.links.slice(0, 2) }));
    const out = await tonoAiProvider.run("word_chain", input, ctx(), route);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(problemsOf(1)).toContain("left out link number 3");
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("has nothing to judge with no words", async () => {
    expect(await tonoAiProvider.run("word_chain", { segments: [] }, ctx(), route)).toMatchObject({ ok: false, reason: "no_input" });
  });
});

describe("Tono AI judging a Bridge Chain", () => {
  const route = { producers: ["tono_ai" as const], blocked: null };
  const input = { segments: [{ seed: "pen", said: "ink because pens write with ink octopus because they go together" }] };

  it("keeps grounded steps and sends what was said", async () => {
    mockGenerate.mockResolvedValue(
      reply(
        {
          steps: [
            { word: "ink", reason: "pens write with ink", verdict: "explained", note: "A real use." },
            { word: "octopus", reason: "they go together", verdict: "thin", note: "Circular." },
          ],
        },
        "m",
        "bridge-chain/2026-10-23",
      ),
    );
    const out = await tonoAiProvider.run("bridge_chain", input, ctx(), route);
    expect(mockGenerate.mock.calls[0][0].inputs.segments[0].said).toContain("ink because pens write with ink octopus");
    expect(out).toMatchObject({ ok: true, value: { steps: [{ verdict: "explained" }, { verdict: "thin" }] }, provenance: { promptVersion: expect.stringContaining("bridge-chain") } });
  });
});

describe("rules", () => {
  it("coaches from the measurements, labelled as the phone's", async () => {
    const out = await rulesProvider.run("coaching", { transcript: "so yeah", durationSeconds: 30, wpmAvg: 190, fillerRatePerMinute: 1, pauses: null, presence: null, pitchRangeSt: null }, ctx(), { producers: ["rules"], blocked: null });
    expect(out).toMatchObject({ ok: true, provenance: { producer: "rules", judged: false }, value: { provenance: { producer: "rules" } } });
  });
});
