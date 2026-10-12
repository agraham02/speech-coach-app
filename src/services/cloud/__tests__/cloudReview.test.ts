jest.mock("../../secrets/secretsStore", () => ({ getProviderKey: jest.fn(async () => "key") }));
jest.mock("../../prefs/prefsStore", () => ({
  getCloudProvider: () => "anthropic",
  getCloudModel: () => null,
  getCloudConsent: () => [],
}));
jest.mock("../../sessions/sessionScoreService", () => ({ measuredVoice: () => ({ wpmAvg: 142, pitchRangeHz: 120 }) }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../gemini/transcribeSession", () => ({ parseGeminiSessionAnalysis: jest.fn() }));

import { toStrictSchema, withoutProperties } from "../jsonSchema";
import { measurementLines, timedTranscript } from "../measuredReview";
import { CloudApiError, describeCloudError } from "../cloudErrors";
import { PROVIDERS, reviewBlockedReason } from "../providers";
import { RESPONSE_SCHEMA } from "../../gemini/schema";
import type { Session } from "../../../domain/sessionTypes";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";

type Node = { type?: string; properties?: Record<string, Node>; items?: Node; required?: string[]; additionalProperties?: boolean };

function everyObject(node: Node, visit: (n: Node) => void): void {
  if (node.type === "object") visit(node);
  Object.values(node.properties ?? {}).forEach((child) => everyObject(child, visit));
  if (node.items) everyObject(node.items, visit);
}

describe("review schema for text providers", () => {
  const schema = toStrictSchema(withoutProperties(RESPONSE_SCHEMA, ["transcript_verbatim", "duration_seconds"])) as Node;

  it("asks for everything but the transcript and duration the phone already has", () => {
    expect(Object.keys(schema.properties ?? {})).toContain("transcript_clean");
    expect(Object.keys(schema.properties ?? {})).not.toContain("transcript_verbatim");
    expect(schema.required).not.toContain("duration_seconds");
  });

  it("closes every object and requires every property (strict structured output)", () => {
    let objects = 0;
    everyObject(schema, (node) => {
      objects++;
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort());
    });
    expect(objects).toBeGreaterThan(5);
  });
});

describe("timedTranscript", () => {
  it("marks gaps of 0.4 s or more", () => {
    const words = [
      { text: "So", startMs: 0, endMs: 200 },
      { text: "here's", startMs: 300, endMs: 500 },
      { text: "the", startMs: 1400, endMs: 1500 },
      { text: "point.", startMs: 1600, endMs: 1900 },
    ];
    expect(timedTranscript(words)).toBe("So here's [0.9s] the point.");
  });
});

describe("measurementLines", () => {
  const session = {
    durationSeconds: 74,
    wpmCurve: [
      { bucketStartSeconds: 0, wpm: 118 },
      { bucketStartSeconds: 10, wpm: 171 },
    ],
    fillerWordCount: 9,
    fillerRatePerMinute: 7.3,
    repeatedWordCount: 2,
    pitchAvgHz: 138,
    pitchMinHz: 92,
    pitchMaxHz: 231,
    volumeAvgDbfs: -24,
    volumeStddevDbfs: 4.1,
  } as unknown as Session;
  const pauses: PauseAnalysis = {
    pauses: [],
    speechStartMs: 900,
    speechEndMs: 73000,
    speakingRatio: 0.8,
    pausesPerMinute: 11,
    longestPauseMs: 2400,
    meanPauseMs: 600,
    midPhrasePauses: 4,
    hesitations: 3,
    boundaryPauseRate: 0.64,
  };

  it("states the numbers a reviewer needs", () => {
    const text = measurementLines({ session, pauses, presence: null, stutterMode: false }).join("\n");
    expect(text).toContain("142 words per minute");
    expect(text).toContain("from 118 to 171 wpm");
    expect(text).toContain("Filler words: 9 (7.3 per minute)");
    expect(text).toContain("3 hesitations");
    expect(text).toContain("64% of sentence endings");
    expect(text).toContain("span of 15.9 semitones");
    expect(text).toContain("varying by 4.1 dB");
    expect(text).toContain("Face: not measured");
  });

  it("leaves fillers and hesitations out in stuttering mode", () => {
    const text = measurementLines({ session, pauses, presence: null, stutterMode: true }).join("\n");
    expect(text).not.toContain("Filler words");
    expect(text).not.toContain("Repeated words");
    expect(text).not.toContain("hesitations");
  });
});

describe("describeCloudError", () => {
  it("points a rejected key at Settings", () => {
    expect(describeCloudError(new CloudApiError("OpenAI", "x", 401))).toMatch(/didn't accept your API key/);
  });

  it("passes on the provider's reason for an unknown model", () => {
    const body = JSON.stringify({ error: { message: "model gpt-x not found" } });
    expect(describeCloudError(new CloudApiError("OpenAI", "x", 404, body))).toContain("model gpt-x not found");
  });

  it("names running out of credit", () => {
    expect(describeCloudError(new CloudApiError("OpenRouter", "x", 402))).toMatch(/out of credit/);
  });
});

describe("reviewBlockedReason", () => {
  it("needs the video for Gemini and a device transcript for the others", () => {
    expect(reviewBlockedReason(PROVIDERS.gemini, { hasVideo: false, hasDeviceTranscript: true })).toMatch(/needs the video/);
    expect(reviewBlockedReason(PROVIDERS.gemini, { hasVideo: true, hasDeviceTranscript: false })).toBeUndefined();
    expect(reviewBlockedReason(PROVIDERS.anthropic, { hasVideo: false, hasDeviceTranscript: true })).toBeUndefined();
    expect(reviewBlockedReason(PROVIDERS.openai, { hasVideo: true, hasDeviceTranscript: false })).toMatch(/on-device transcript/);
  });
});
