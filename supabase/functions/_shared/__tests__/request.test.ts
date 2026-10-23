import { DEFAULT_CONFIG } from "../config";
import { generateRequestSchema, uploadStartSchema } from "../request";
import { utcDayStart, utcMonthStart, utcNextMonthStart } from "../time";

const limits = DEFAULT_CONFIG.limits;
const generate = generateRequestSchema(limits);

const review = {
  kind: "review",
  systemPrompt: "Review this take.",
  schema: { type: "object" },
  fileName: "files/abc-123",
  videoSeconds: 180,
  idempotencyKey: "take-9f8e7d6c",
};

describe("generateRequestSchema", () => {
  it("accepts a review with a file", () => {
    expect(generate.safeParse(review).success).toBe(true);
  });

  it("accepts a text call and an insight without a file", () => {
    const { fileName: _f, videoSeconds: _v, ...base } = review;
    expect(generate.safeParse({ ...base, kind: "text" }).success).toBe(true);
    expect(generate.safeParse({ ...base, kind: "insight" }).success).toBe(true);
  });

  it("never lets a call without a file be billed as a review", () => {
    const { fileName: _f, ...noFile } = review;
    expect(generate.safeParse(noFile).success).toBe(false);
  });

  it("does not let a text call carry a video", () => {
    expect(generate.safeParse({ ...review, kind: "text" }).success).toBe(false);
  });

  it("needs the length of a review", () => {
    const { videoSeconds: _v, ...noSeconds } = review;
    expect(generate.safeParse(noSeconds).success).toBe(false);
  });

  it("refuses a take over 5 minutes", () => {
    expect(generate.safeParse({ ...review, videoSeconds: 301 }).success).toBe(false);
  });

  it("refuses odd file names, keys and oversize bodies", () => {
    expect(generate.safeParse({ ...review, fileName: "../files/x" }).success).toBe(false);
    expect(generate.safeParse({ ...review, fileName: "files/ABC" }).success).toBe(false);
    expect(generate.safeParse({ ...review, idempotencyKey: "short" }).success).toBe(false);
    expect(generate.safeParse({ ...review, idempotencyKey: "has spaces here" }).success).toBe(false);
    expect(generate.safeParse({ ...review, systemPrompt: "x".repeat(limits.maxPromptChars + 1) }).success).toBe(false);
    expect(generate.safeParse({ ...review, schema: { big: "x".repeat(limits.maxSchemaChars) } }).success).toBe(false);
  });
});

describe("uploadStartSchema", () => {
  const upload = uploadStartSchema(limits);

  it("accepts a normal take", () => {
    expect(upload.safeParse({ sizeBytes: 40_000_000, mimeType: "video/mp4" }).success).toBe(true);
  });

  it("refuses too large, empty and unknown types", () => {
    expect(upload.safeParse({ sizeBytes: limits.maxUploadBytes + 1, mimeType: "video/mp4" }).success).toBe(false);
    expect(upload.safeParse({ sizeBytes: 0, mimeType: "video/mp4" }).success).toBe(false);
    expect(upload.safeParse({ sizeBytes: 100, mimeType: "application/pdf" }).success).toBe(false);
  });
});

describe("UTC boundaries", () => {
  const now = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));

  it("finds the start of the month and day, and rolls the year over", () => {
    expect(utcMonthStart(now).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(utcDayStart(now).toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(utcNextMonthStart(now).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
