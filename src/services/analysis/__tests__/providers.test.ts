import type { AnalysisContext } from "../../../domain/analysis/types";
import type { Session } from "../../../domain/sessionTypes";
import type { TakeReviewInput } from "../kinds";

const mockGenerateContent = jest.fn();
const mockCallTextProvider = jest.fn();
let mockCallsToday = 0;

jest.mock("../../secrets/secretsStore", () => ({ getProviderKey: jest.fn(async () => "key") }));
jest.mock("../../prefs/prefsStore", () => ({
  getCloudProvider: () => "tono",
  getCloudModel: () => null,
  getCloudConsent: () => [],
  getUserProfile: () => null,
  getShareProfileWithReviews: () => false,
  getNextEvent: () => null,
  getCloudCallsToday: () => mockCallsToday,
  noteCloudCall: jest.fn(),
}));
jest.mock("../../sessions/sessionScoreService", () => ({ measuredVoice: () => ({ wpmAvg: 142, pitchRangeSt: 5 }) }));
jest.mock("../../gemini/geminiClient", () => ({ generateContent: (...a: unknown[]) => mockGenerateContent(...a) }));
jest.mock("../../cloud/textProviders", () => ({ callTextProvider: (...a: unknown[]) => mockCallTextProvider(...a) }));
jest.mock("../providers/videoReview", () => ({ reviewFromVideo: jest.fn() }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { tonoAiProvider } from "../providers/tonoAi";
import { ownKeyProvider } from "../providers/ownKey";
import { rulesProvider } from "../providers/rules";
import { reviewFromVideo } from "../providers/videoReview";

const ctx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  wantsTono: true,
  tono: { signedIn: true, consent: true, allowed: { review: true, text: true, insight: true }, killSwitch: false },
  ownKey: null,
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

const note = (score: number) => ({ score, notes: "n" });
const rubricAnswer = {
  transcript_clean: "So my point is simple: start small and keep going.",
  structure: { score: 6, structure_used: "what/why/how", notes: "n" },
  content: { relevance_score: 7, relevance_notes: "n", coherence_score: 6, coherence_notes: "n" },
  delivery: { rate: { ...note(7), wpm_avg: 142 }, volume: note(5), pitch_melody: note(5), tonality: note(5), pausing: note(6) },
  presence: { eye_contact_score: 5, facial_expressiveness_score: 5, body_language_notes: "n" },
  combined: { face_voice_congruence_score: 5, archetype_detected: "Friend", archetype_fit_for_topic: "n", overall_score: 6 },
  annotations: [],
  coaching: { summary: "s", top_strength: "t", top_focus_area: "f", recommended_drill: "d" },
  quick_coach: { strength: "Clear point.", tip: "Pause after it.", focus_skill: "cadence", follow_up_question: "Why?" },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCallsToday = 0;
});

describe("Tono AI take review from the transcript (the default)", () => {
  it("sends the words and the measurements as one hosted text call, never the video", async () => {
    mockGenerateContent.mockImplementation(async (args: { onHosted?: (r: unknown) => void }) => {
      args.onHosted?.({ model: "gemini-3.5-flash-lite", usedFallback: false });
      return JSON.stringify(rubricAnswer);
    });
    const out = await tonoAiProvider.run("take_review", take, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "text" });
    expect(reviewFromVideo).not.toHaveBeenCalled();
    const call = mockGenerateContent.mock.calls[0][0];
    expect(call).toMatchObject({ transport: "hosted", kind: "text" });
    expect(call.fileUri).toBeUndefined();
    expect(call.systemPrompt).toContain("start small and keep going");
    expect(call.systemPrompt).toContain("MEASURED ON THE PHONE");
    expect(call.systemPrompt).toContain("quick_coach");
    expect(call.responseSchema.required).toContain("quick_coach");
    expect(out).toMatchObject({
      ok: true,
      value: { heardAudio: false, providerId: "tono", quickCoach: rubricAnswer.quick_coach, analysis: { transcript_verbatim: session.transcriptVerbatim } },
      provenance: { producer: "tono_ai", model: "gemini-3.5-flash-lite", judged: true, input: "text" },
    });
  });

  it("goes through the video path when routing says video", async () => {
    (reviewFromVideo as jest.Mock).mockResolvedValue({ analysis: {}, quickCoach: null, heardAudio: true, usage: null, elapsedMs: 1, videoBytes: 10, model: "m" });
    const out = await tonoAiProvider.run("take_review", take, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "video" });
    expect(reviewFromVideo).toHaveBeenCalledWith(take, "hosted");
    expect(out).toMatchObject({ ok: true, value: { providerId: "tono", heardAudio: true }, provenance: { input: "video", model: "m" } });
  });

  it("can't judge a take with no transcript from the words", async () => {
    const out = await tonoAiProvider.run("take_review", { ...take, session: { ...session, transcriptVerbatim: null } as Session }, ctx(), { producers: ["tono_ai"], blocked: null, tonoInput: "text" });
    expect(out).toMatchObject({ ok: false, reason: "no_input" });
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
    mockGenerateContent.mockImplementation(async (args: { onHosted?: (r: unknown) => void }) => {
      args.onHosted?.({ model: "gemini-3.5-flash-lite" });
      return JSON.stringify(dayAnswer());
    });
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({
      ok: true,
      value: { coverage: expect.stringMatching(/^All three parts/), parts: { evening: { status: "covered" } } },
      provenance: { producer: "tono_ai", model: "gemini-3.5-flash-lite", input: "text" },
    });
    expect(mockGenerateContent.mock.calls[0][0].systemPrompt).toContain("morning: from waking up until about noon");
  });

  it("asks once more, naming the problem, when the first answer calls the evening missing", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(JSON.stringify(dayAnswer({ parts: { ...dayAnswer().parts, evening: { status: "missing", evidence: "" } } })))
      .mockResolvedValueOnce(JSON.stringify(dayAnswer()));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[1][0].systemPrompt).toContain("evening as missing");
    expect(out).toMatchObject({ ok: true, value: { parts: { evening: { status: "covered" } } } });
  });

  it("shows no notes at all when a quote is made up twice", async () => {
    const made = dayAnswer({ parts: { ...dayAnswer().parts, morning: { status: "covered", evidence: "I ran five miles before sunrise" } } });
    mockGenerateContent.mockResolvedValue(JSON.stringify(made));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("rejects notes that turn into a score", async () => {
    mockGenerateContent.mockResolvedValue(JSON.stringify(dayAnswer({ storytelling: "8/10" })));
    const out = await tonoAiProvider.run("rewind_notes", { transcript: DAY }, ctx(), route);
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("is not something an own key does any more", async () => {
    expect(ownKeyProvider.supports("rewind_notes")).toBe(false);
    expect(ownKeyProvider.supports("word_chain")).toBe(false);
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

  it("sends only the numbered pairs, as a short hosted text call", async () => {
    mockGenerateContent.mockResolvedValue(JSON.stringify(good));
    const out = await tonoAiProvider.run("word_chain", input, ctx(), route);
    const call = mockGenerateContent.mock.calls[0][0];
    expect(call).toMatchObject({ transport: "hosted", kind: "text" });
    expect(call.systemPrompt).toContain("1. pen -> ink");
    expect(call.systemPrompt).toContain("3. octopus -> banana");
    expect(call.fileUri).toBeUndefined();
    expect(out).toMatchObject({ ok: true, value: { links: [{ from: "pen", to: "ink", verdict: "strong" }, {}, { to: "banana", verdict: "none" }] }, provenance: { producer: "tono_ai", judged: true } });
  });

  it("asks again when a link is missing, and gives up if it still is", async () => {
    mockGenerateContent.mockResolvedValue(JSON.stringify({ links: good.links.slice(0, 2) }));
    const out = await tonoAiProvider.run("word_chain", input, ctx(), route);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[1][0].systemPrompt).toContain("left out link number 3");
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
    mockGenerateContent.mockResolvedValue(
      JSON.stringify({
        steps: [
          { word: "ink", reason: "pens write with ink", verdict: "explained", note: "A real use." },
          { word: "octopus", reason: "they go together", verdict: "thin", note: "Circular." },
        ],
      }),
    );
    const out = await tonoAiProvider.run("bridge_chain", input, ctx(), route);
    expect(mockGenerateContent.mock.calls[0][0].systemPrompt).toContain("ink because pens write with ink octopus");
    expect(out).toMatchObject({ ok: true, value: { steps: [{ verdict: "explained" }, { verdict: "thin" }] }, provenance: { promptVersion: expect.stringContaining("bridge-chain") } });
  });
});

describe("own key", () => {
  it("stops at the daily cap before calling anything", async () => {
    mockCallsToday = 1000;
    const out = await ownKeyProvider.run("rewind_notes", { transcript: "words" }, ctx({ ownKey: "openai" }), { producers: ["own_key"], blocked: null });
    expect(out).toMatchObject({ ok: false, reason: "quota" });
    expect(mockCallTextProvider).not.toHaveBeenCalled();
  });

  it("reads the transcript with a text provider and labels it with the provider's name", async () => {
    mockCallTextProvider.mockResolvedValue(JSON.stringify(rubricAnswer));
    const out = await ownKeyProvider.run("take_review", take, ctx({ ownKey: "anthropic" }), { producers: ["own_key"], blocked: null });
    expect(out).toMatchObject({ ok: true, value: { providerId: "anthropic", quickCoach: null }, provenance: { producer: "own_key", provider: "Anthropic Claude", input: "text" } });
  });
});

describe("rules", () => {
  it("coaches from the measurements, labelled as the phone's", async () => {
    const out = await rulesProvider.run("coaching", { transcript: "so yeah", durationSeconds: 30, wpmAvg: 190, fillerRatePerMinute: 1, pauses: null, presence: null, pitchRangeSt: null }, ctx(), { producers: ["rules"], blocked: null });
    expect(out).toMatchObject({ ok: true, provenance: { producer: "rules", judged: false }, value: { provenance: { producer: "rules" } } });
  });
});
