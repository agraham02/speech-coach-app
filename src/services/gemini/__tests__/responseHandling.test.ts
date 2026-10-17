import { extractResponseText, rateLimitRetryMs, readRateLimit } from "../responseHandling";

const quotaBody = (quotaId: string, retryDelay?: string) =>
  JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId }] },
        ...(retryDelay ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }] : []),
      ],
    },
  });

describe("readRateLimit", () => {
  it("reads a per-minute limit and its delay", () => {
    expect(readRateLimit(quotaBody("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "17s"))).toEqual({ dailyQuota: false, retryDelayMs: 17000 });
    expect(readRateLimit(quotaBody("x", "2.5s")).retryDelayMs).toBe(2500);
  });
  it("spots a per-day quota", () => {
    expect(readRateLimit(quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "40s")).dailyQuota).toBe(true);
  });
  it("copes with bodies that are not JSON", () => {
    expect(readRateLimit("Too many requests")).toEqual({ dailyQuota: false, retryDelayMs: null });
    expect(readRateLimit(undefined)).toEqual({ dailyQuota: false, retryDelayMs: null });
  });
});

describe("rateLimitRetryMs", () => {
  it("waits out a short per-minute limit", () => {
    expect(rateLimitRetryMs(quotaBody("PerMinute", "17s"), null)).toBe(17500);
  });
  it("never retries a daily quota", () => {
    expect(rateLimitRetryMs(quotaBody("GenerateRequestsPerDayPerProjectPerModel", "5s"), null)).toBeNull();
  });
  it("gives up on long waits", () => {
    expect(rateLimitRetryMs(quotaBody("PerMinute", "300s"), null)).toBeNull();
  });
  it("falls back to Retry-After, then a short default", () => {
    expect(rateLimitRetryMs("", "4")).toBe(4500);
    expect(rateLimitRetryMs("", null)).toBe(10500);
  });
});

describe("extractResponseText", () => {
  it("joins text parts and skips thoughts", () => {
    const data = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking", thought: true }, { text: '{"a":' }, { text: "1}" }] } }] };
    expect(extractResponseText(data)).toEqual({ ok: true, text: '{"a":1}' });
  });
  it("explains a cut-off answer", () => {
    const data = { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"transcript_verbatim": "so um' }] } }] };
    expect(extractResponseText(data)).toMatchObject({ ok: false, reason: expect.stringContaining("ran out of room") });
  });
  it("explains a blocked or empty answer", () => {
    expect(extractResponseText({ promptFeedback: { blockReason: "SAFETY" } })).toEqual({ ok: false, reason: "Gemini refused the request (SAFETY)." });
    expect(extractResponseText({ candidates: [{ finishReason: "RECITATION" }] })).toEqual({ ok: false, reason: "Gemini stopped without an answer (RECITATION). Retry." });
    expect(extractResponseText({})).toMatchObject({ ok: false });
  });
});
