const mockProviderFor = jest.fn();
const mockGenerateContent = jest.fn();
const mockAppleAvailable = jest.fn();

jest.mock("../../cloud/routing", () => ({ providerFor: (...a: unknown[]) => mockProviderFor(...a) }));
jest.mock("../../gemini/geminiClient", () => ({ generateContent: (...a: unknown[]) => mockGenerateContent(...a) }));
jest.mock("../onDeviceCoach", () => ({ isAppleModelAvailable: () => mockAppleAvailable(), getAppleProvider: () => null }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { autoMarkText } from "../autoMarkText";

const TONO = { provider: { id: "tono" }, transport: "hosted" };

beforeEach(() => {
  jest.resetAllMocks();
  mockAppleAvailable.mockReturnValue(false);
  mockProviderFor.mockResolvedValue(null);
});

describe("autoMarkText", () => {
  it("uses the marking-guide rules when nothing else is available", async () => {
    const { by, marked } = await autoMarkText("Hello there, friend.");
    expect(by).toBe("rules");
    expect(marked.text).toBe("Hello there, friend.");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("asks Tono AI, as a text call, and keeps its marks when the words are unchanged", async () => {
    mockProviderFor.mockResolvedValue(TONO);
    mockGenerateContent.mockResolvedValue(JSON.stringify({ marked: "Hello | *there* friend.↘" }));
    const { by, marked } = await autoMarkText("Hello there friend.");
    expect(by).toBe("tono");
    expect(marked.text).toBe("Hello there friend.");
    expect(marked.marks.length).toBeGreaterThan(0);
    expect(mockProviderFor).toHaveBeenCalledWith("mark_up", { hasVideo: false });
    const call = mockGenerateContent.mock.calls[0][0];
    expect(call).toMatchObject({ transport: "hosted", kind: "text" });
    expect(call.systemPrompt).toContain("Hello there friend.");
    expect(call.systemPrompt).toMatch(/ignore them/);
  });

  it("falls back to the rules when Tono AI changes the words", async () => {
    mockProviderFor.mockResolvedValue(TONO);
    mockGenerateContent.mockResolvedValue(JSON.stringify({ marked: "Goodbye *there* friend↘." }));
    const { by, marked } = await autoMarkText("Hello there friend.");
    expect(by).toBe("rules");
    expect(marked.text).toBe("Hello there friend.");
  });

  it("falls back when Tono AI is refused or returns junk", async () => {
    mockProviderFor.mockResolvedValue(TONO);
    mockGenerateContent.mockRejectedValueOnce(Object.assign(new Error("no reviews left"), { code: "quota_exhausted" }));
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
    mockGenerateContent.mockResolvedValueOnce("not json");
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
  });

  it("never sends an own-key provider's marking anywhere", async () => {
    mockProviderFor.mockResolvedValue({ provider: { id: "openai" }, transport: "direct" });
    expect((await autoMarkText("Hello there friend.")).by).toBe("rules");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
