import { callsThisMonth, describeUsage, formatTokens, sumUsage, usageFromAnthropic, usageFromGemini, usageFromOpenAI, type CloudUsageCall } from "../cloudUsage";

const call = (extra: Partial<CloudUsageCall> = {}): CloudUsageCall => ({
  at: "2026-10-16T12:00:00.000Z",
  provider: "gemini",
  model: "gemini-flash-latest",
  input: "video",
  elapsedMs: 24000,
  videoBytes: 5_000_000,
  inputTokens: 1000,
  outputTokens: 500,
  thinkingTokens: 100,
  totalTokens: 1600,
  ...extra,
});

describe("usageFromGemini", () => {
  it("reads the counts and the input split by type", () => {
    const usage = usageFromGemini({
      promptTokenCount: 17700,
      candidatesTokenCount: 1100,
      thoughtsTokenCount: 800,
      totalTokenCount: 19600,
      promptTokensDetails: [
        { modality: "VIDEO", tokenCount: 15800 },
        { modality: "AUDIO", tokenCount: 1900 },
        { modality: "TEXT", tokenCount: 0 },
      ],
    });
    expect(usage).toEqual({
      inputTokens: 17700,
      outputTokens: 1100,
      thinkingTokens: 800,
      totalTokens: 19600,
      inputByType: { video: 15800, audio: 1900, text: 0 },
    });
  });

  it("works without thoughts or details, and adds up a missing total", () => {
    expect(usageFromGemini({ promptTokenCount: 10, candidatesTokenCount: 5 })).toEqual({ inputTokens: 10, outputTokens: 5, thinkingTokens: null, totalTokens: 15 });
  });

  it("is null for nothing usable", () => {
    expect(usageFromGemini(undefined)).toBeNull();
    expect(usageFromGemini({})).toBeNull();
    expect(usageFromGemini("x")).toBeNull();
  });
});

describe("usageFromOpenAI", () => {
  it("takes reasoning tokens out of the output count (Responses API)", () => {
    expect(usageFromOpenAI({ input_tokens: 900, output_tokens: 700, total_tokens: 1600, output_tokens_details: { reasoning_tokens: 200 } })).toEqual({
      inputTokens: 900,
      outputTokens: 500,
      thinkingTokens: 200,
      totalTokens: 1600,
    });
  });
  it("reads the chat-completions names", () => {
    expect(usageFromOpenAI({ prompt_tokens: 50, completion_tokens: 20 })).toEqual({ inputTokens: 50, outputTokens: 20, thinkingTokens: null, totalTokens: 70 });
  });
  it("is null for nothing usable", () => {
    expect(usageFromOpenAI(null)).toBeNull();
    expect(usageFromOpenAI({ other: 1 })).toBeNull();
  });
});

describe("usageFromAnthropic", () => {
  it("reads input and output", () => {
    expect(usageFromAnthropic({ input_tokens: 3000, output_tokens: 900 })).toEqual({ inputTokens: 3000, outputTokens: 900, thinkingTokens: null, totalTokens: 3900 });
    expect(usageFromAnthropic({})).toBeNull();
  });
});

describe("sumUsage and callsThisMonth", () => {
  it("adds calls up, treating missing numbers as zero", () => {
    const totals = sumUsage([call(), call({ inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: 400 })]);
    expect(totals).toEqual({ reviews: 2, inputTokens: 1000, outputTokens: 500, thinkingTokens: 100, totalTokens: 2000 });
    expect(sumUsage([])).toEqual({ reviews: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 });
  });

  it("keeps only this calendar month", () => {
    const now = new Date(2026, 9, 20, 12);
    const calls = [call({ at: new Date(2026, 9, 2, 9).toISOString() }), call({ at: new Date(2026, 8, 28, 9).toISOString() })];
    expect(callsThisMonth(calls, now)).toHaveLength(1);
  });
});

describe("formatting", () => {
  it("shortens token counts", () => {
    expect(formatTokens(812)).toBe("812");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(38214)).toBe("38k");
    expect(formatTokens(2_400_000)).toBe("2.4M");
  });

  it("describes one review in a line", () => {
    expect(describeUsage(call())).toBe("1,600 tokens (1k in, 500 out, 100 thinking) in 24 s");
    expect(describeUsage(call({ thinkingTokens: null, elapsedMs: 0 }))).toBe("1,600 tokens (1k in, 500 out)");
  });
});
