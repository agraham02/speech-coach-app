import type { AnalysisContext } from "../../../domain/analysis/types";

const mockGenerateContent = jest.fn();
let mockCtx: AnalysisContext;

const baseCtx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  wantsTono: true,
  tono: { signedIn: true, consent: true, allowed: { review: true, text: true, insight: true }, killSwitch: false },
  ownKey: null,
  takeOptIn: true,
  judgeInput: "text",
  hasVideo: false,
  hasTranscript: true,
  flags: {},
  ...patch,
});

jest.mock("../../prefs/prefsStore", () => ({
  getUserProfile: () => null,
  getShareProfileWithReviews: () => false,
  getNextEvent: () => null,
  getCloudCallsToday: () => 0,
  noteCloudCall: jest.fn(),
  getCloudModel: () => null,
}));
jest.mock("../../secrets/secretsStore", () => ({ getProviderKey: async () => null }));
jest.mock("../../cloud/routing", () => ({ analysisContext: async () => mockCtx }));
jest.mock("../../gemini/geminiClient", () => ({ generateContent: (...a: unknown[]) => mockGenerateContent(...a) }));
jest.mock("../../analysis/providers/videoReview", () => ({ reviewFromVideo: jest.fn() }));
jest.mock("../../analysis/store", () => ({ recordAnalysis: jest.fn(async () => undefined), watchTake: () => () => undefined, envelopeOf: () => ({}) }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { autoMarkText } from "../autoMarkText";

beforeEach(() => {
  jest.resetAllMocks();
  mockCtx = baseCtx({ wantsTono: false, tono: { signedIn: false, consent: false, allowed: { review: false, text: false, insight: false }, killSwitch: false } });
});

describe("autoMarkText through the AnalysisService", () => {
  it("uses the marking-guide rules when Tono AI isn't available", async () => {
    const { by, marked, provenance } = await autoMarkText("Hello there, friend.");
    expect(by).toBe("rules");
    expect(provenance?.producer).toBe("rules");
    expect(marked.text).toBe("Hello there, friend.");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("asks Tono AI, as a text call, and keeps its marks when the words are unchanged", async () => {
    mockCtx = baseCtx();
    mockGenerateContent.mockResolvedValue(JSON.stringify({ marked: "Hello | *there* friend.↘" }));
    const { by, marked, provenance } = await autoMarkText("Hello there friend.");
    expect(by).toBe("tono");
    expect(provenance).toMatchObject({ producer: "tono_ai", judged: true });
    expect(marked.text).toBe("Hello there friend.");
    expect(marked.marks.length).toBeGreaterThan(0);
    const call = mockGenerateContent.mock.calls[0][0];
    expect(call).toMatchObject({ transport: "hosted", kind: "text" });
    expect(call.systemPrompt).toContain("Hello there friend.");
    expect(call.systemPrompt).toMatch(/ignore them/);
  });

  it("falls back to the rules when Tono AI changes the words", async () => {
    mockCtx = baseCtx();
    mockGenerateContent.mockResolvedValue(JSON.stringify({ marked: "Goodbye *there* friend↘." }));
    const { by, marked } = await autoMarkText("Hello there friend.");
    expect(by).toBe("rules");
    expect(marked.text).toBe("Hello there friend.");
  });

  it("falls back when Tono AI is refused or returns junk", async () => {
    mockCtx = baseCtx();
    mockGenerateContent.mockRejectedValueOnce(Object.assign(new Error("no reviews left"), { code: "quota_exhausted" }));
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
    mockGenerateContent.mockResolvedValueOnce("not json");
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
  });

  it("never sends a marking to an own-key provider", async () => {
    mockCtx = baseCtx({ wantsTono: false, ownKey: "openai" });
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
