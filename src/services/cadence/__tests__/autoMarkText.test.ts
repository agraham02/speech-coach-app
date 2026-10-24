import type { AnalysisContext } from "../../../domain/analysis/types";

const mockGenerate = jest.fn();
let mockCtx: AnalysisContext;

const baseCtx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  tier: "plus",
  tono: { consent: true, allowed: { take: true, text: true, insight: true }, killSwitch: false },
  isAdult: true,
  minorsMayUseAi: false,
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
}));
jest.mock("../../account/accountStore", () => ({ ensureAccount: async () => undefined }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-0001-0002" }));
jest.mock("../../cloud/routing", () => ({ analysisContext: async () => mockCtx }));
jest.mock("../../tono/tonoApi", () => ({ tonoGenerate: (...a: unknown[]) => mockGenerate(...a) }));
jest.mock("../../tono/upload", () => ({ resolveUploadForGrading: jest.fn() }));
jest.mock("../../analysis/store", () => ({ recordAnalysis: jest.fn(async () => undefined), watchTake: () => () => undefined, envelopeOf: () => ({}) }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { autoMarkText } from "../autoMarkText";

beforeEach(() => {
  jest.resetAllMocks();
  mockCtx = baseCtx({ tier: "free", tono: { consent: false, allowed: { take: false, text: false, insight: false }, killSwitch: false } });
});

describe("autoMarkText through the AnalysisService", () => {
  it("uses the marking-guide rules when Tono AI isn't available", async () => {
    const { by, marked, provenance } = await autoMarkText("Hello there, friend.");
    expect(by).toBe("rules");
    expect(provenance?.producer).toBe("rules");
    expect(marked.text).toBe("Hello there, friend.");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("asks Tono AI, as a text call, and keeps its marks when the words are unchanged", async () => {
    mockCtx = baseCtx();
    mockGenerate.mockResolvedValue({ output: { marked: "Hello | *there* friend.↘" }, model: "m", promptVersion: "mark-up/1" });
    const { by, marked, provenance } = await autoMarkText("Hello there friend.");
    expect(by).toBe("tono");
    expect(provenance).toMatchObject({ producer: "tono_ai", judged: true });
    expect(marked.text).toBe("Hello there friend.");
    expect(marked.marks.length).toBeGreaterThan(0);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({ task: "mark_up", inputs: { text: "Hello there friend." } });
  });

  it("falls back to the rules when Tono AI changes the words", async () => {
    mockCtx = baseCtx();
    mockGenerate.mockResolvedValue({ output: { marked: "Goodbye *there* friend↘." }, model: "m", promptVersion: "p" });
    const { by, marked } = await autoMarkText("Hello there friend.");
    expect(by).toBe("rules");
    expect(marked.text).toBe("Hello there friend.");
  });

  it("falls back when Tono AI is refused or returns junk", async () => {
    mockCtx = baseCtx();
    mockGenerate.mockRejectedValueOnce(Object.assign(new Error("no reviews left"), { code: "quota_exhausted" }));
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
    mockGenerate.mockResolvedValueOnce({ output: "not json", model: "m", promptVersion: "p" });
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
  });

  it("marks with the rules for a free user, without asking Tono AI", async () => {
    mockCtx = baseCtx({ tier: "free" });
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
