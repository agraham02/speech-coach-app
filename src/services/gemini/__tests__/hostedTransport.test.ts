const mockUploadStart = jest.fn();
const mockFileStatus = jest.fn();
const mockGenerate = jest.fn();
const mockUpload = jest.fn();

jest.mock("expo-file-system", () => ({
  File: class {
    size = 5_000_000;
    upload(url: string, options: unknown) {
      return mockUpload(url, options);
    }
  },
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1234" }));
jest.mock("../../tono/tonoApi", () => ({
  tonoUploadStart: (...a: unknown[]) => mockUploadStart(...a),
  tonoFileStatus: (...a: unknown[]) => mockFileStatus(...a),
  tonoGenerate: (...a: unknown[]) => mockGenerate(...a),
}));
jest.mock("../../secrets/secretsStore", () => ({ getGeminiApiKey: async () => null }));
jest.mock("../../cloud/providers", () => ({ modelFor: () => "direct-model" }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { checkExistingFileActive, generateContent, uploadVideoFile, waitForFileActive } from "../geminiClient";

const answer = (text: string) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });

beforeEach(() => jest.resetAllMocks());

describe("generateContent through Tono's server", () => {
  it("sends a review with the file and length, and returns the answer text", async () => {
    mockGenerate.mockResolvedValue({ gemini: answer('{"ok":true}'), model: "gemini-lite", usedFallback: false, allowance: {} });
    const onUsage = jest.fn();
    const onHosted = jest.fn();
    const text = await generateContent({
      fileUri: "https://x/v1beta/files/abc",
      mimeType: "video/mp4",
      systemPrompt: "review this",
      responseSchema: { type: "object" },
      transport: "hosted",
      fileName: "files/abc",
      videoSeconds: 90,
      onUsage,
      onHosted,
    });
    expect(text).toBe('{"ok":true}');
    expect(mockGenerate).toHaveBeenCalledWith({
      kind: "review",
      systemPrompt: "review this",
      schema: { type: "object" },
      fileName: "files/abc",
      videoSeconds: 90,
      idempotencyKey: "uuid-1234",
    });
    expect(onHosted).toHaveBeenCalledWith({ model: "gemini-lite", usedFallback: false });
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 100, outputTokens: 20 }));
  });

  it("sends text-only calls as text, with no file", async () => {
    mockGenerate.mockResolvedValue({ gemini: answer("{}"), model: "m", usedFallback: true, allowance: {} });
    await generateContent({ systemPrompt: "notes", responseSchema: {}, transport: "hosted" });
    const sent = mockGenerate.mock.calls[0][0];
    expect(sent.kind).toBe("text");
    expect(sent).not.toHaveProperty("fileName");
    expect(sent).not.toHaveProperty("videoSeconds");
  });

  it("refuses a review it cannot size, before asking the server", async () => {
    await expect(
      generateContent({ fileUri: "u", mimeType: "video/mp4", systemPrompt: "x", responseSchema: {}, transport: "hosted", fileName: "files/abc" }),
    ).rejects.toThrow(/length of the video/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("fails clearly on an answer with no usable text", async () => {
    mockGenerate.mockResolvedValue({ gemini: { candidates: [] }, model: "m", usedFallback: false, allowance: {} });
    await expect(generateContent({ systemPrompt: "x", responseSchema: {}, transport: "hosted" })).rejects.toThrow();
  });

  it("lets the server's refusal through untouched", async () => {
    const refusal = Object.assign(new Error("quota"), { code: "quota_exhausted" });
    mockGenerate.mockRejectedValue(refusal);
    await expect(generateContent({ systemPrompt: "x", responseSchema: {}, transport: "hosted" })).rejects.toBe(refusal);
  });
});

describe("hosted uploads", () => {
  it("asks the server for the upload URL, then sends the bytes there", async () => {
    mockUploadStart.mockResolvedValue({ uploadUrl: "https://upload.example/session", uploadId: "id-1" });
    mockUpload.mockResolvedValue({ status: 200, body: JSON.stringify({ file: { name: "files/abc", uri: "https://x/files/abc", state: "PROCESSING" } }) });
    const file = await uploadVideoFile("file:///take.mp4", "video/mp4", "take", "hosted");
    expect(mockUploadStart).toHaveBeenCalledWith({ sizeBytes: 5_000_000, mimeType: "video/mp4" });
    expect(mockUpload.mock.calls[0][0]).toBe("https://upload.example/session");
    expect(file.name).toBe("files/abc");
  });

  it("waits for the file through the server", async () => {
    mockFileStatus.mockResolvedValueOnce({ name: "files/abc", uri: "u", mimeType: "video/mp4", state: "PROCESSING" }).mockResolvedValueOnce({ name: "files/abc", uri: "u", mimeType: "video/mp4", state: "ACTIVE" });
    await waitForFileActive("files/abc", { transport: "hosted", intervalMs: 1 });
    expect(mockFileStatus).toHaveBeenCalledTimes(2);
  });

  it("stops waiting if processing failed", async () => {
    mockFileStatus.mockResolvedValue({ name: "files/abc", uri: "u", mimeType: "video/mp4", state: "FAILED" });
    await expect(waitForFileActive("files/abc", { transport: "hosted", intervalMs: 1 })).rejects.toThrow(/processing failed/);
  });

  it("treats an expired or foreign file as not reusable instead of failing", async () => {
    mockFileStatus.mockRejectedValue(new Error("file_not_found"));
    await expect(checkExistingFileActive("files/gone", "hosted")).resolves.toBe(false);
    mockFileStatus.mockResolvedValue({ name: "files/abc", uri: "u", mimeType: "video/mp4", state: "ACTIVE" });
    await expect(checkExistingFileActive("files/abc", "hosted")).resolves.toBe(true);
  });
});
