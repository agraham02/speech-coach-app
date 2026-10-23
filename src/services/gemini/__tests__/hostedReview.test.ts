import { hostedReviewSection, RESPONSE_SCHEMA, withQuickCoach } from "../schema";
import { parseGeminiSessionAnalysis } from "../transcribeSession";

jest.mock("expo-file-system", () => ({ File: class {} }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
jest.mock("../../tono/tonoApi", () => ({}));
jest.mock("../../secrets/secretsStore", () => ({ getGeminiApiKey: async () => null }));
jest.mock("../../prefs/prefsStore", () => ({ getUserProfile: () => ({}), getShareProfileWithReviews: () => false, getNextEvent: () => null }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe("withQuickCoach", () => {
  const schema = withQuickCoach(RESPONSE_SCHEMA) as { properties: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }> }>; required: string[] };

  it("adds a required quick_coach with the five skills as the choice", () => {
    expect(schema.required).toContain("quick_coach");
    expect(schema.properties.quick_coach.required).toEqual(["strength", "tip", "focus_skill", "follow_up_question"]);
    expect(schema.properties.quick_coach.properties!.focus_skill.enum).toEqual(["articulation", "cadence", "impromptu", "confidence", "conversation"]);
  });

  it("leaves the shared review schema alone, so own-key reviews don't ask for it", () => {
    expect(RESPONSE_SCHEMA.required).not.toContain("quick_coach");
    expect(RESPONSE_SCHEMA.properties).not.toHaveProperty("quick_coach");
  });
});

describe("hostedReviewSection", () => {
  it("hands over the measurements for the notes only", () => {
    const text = hostedReviewSection(["- Pace: 150 words per minute on average", "- Face (camera): eye contact with the lens 64%"]);
    expect(text).toContain("- Pace: 150 words per minute on average");
    expect(text).toContain("eye contact with the lens 64%");
    expect(text).toMatch(/for your notes only/);
    expect(text).toMatch(/must not move any score/);
    expect(text).toMatch(/Count filler words yourself/);
  });

  it("still asks for the coach card when nothing was measured", () => {
    const text = hostedReviewSection([]);
    expect(text).not.toContain("MEASURED ON THE PHONE");
    expect(text).toContain("quick_coach");
  });
});

const review = {
  transcript_verbatim: "um hello",
  transcript_clean: "Hello",
  duration_seconds: 10,
  structure: { score: 5, structure_used: "none detected", notes: "n" },
  content: { relevance_score: 5, relevance_notes: "n", coherence_score: 5, coherence_notes: "n" },
  delivery: {
    rate: { score: 5, wpm_avg: 140, notes: "n" },
    volume: { score: 5, notes: "n" },
    pitch_melody: { score: 5, notes: "n" },
    tonality: { score: 5, notes: "n" },
    pausing: { score: 5, notes: "n" },
  },
  presence: { eye_contact_score: 5, facial_expressiveness_score: 5, body_language_notes: "n" },
  combined: { face_voice_congruence_score: 5, archetype_detected: "Friend", archetype_fit_for_topic: "n", overall_score: 5 },
  annotations: [],
  coaching: { summary: "s", top_strength: "a", top_focus_area: "b", recommended_drill: "c" },
};

describe("parsing a review with a coach card", () => {
  it("carries quick_coach through untouched, to be checked later", () => {
    const card = { strength: "x", tip: "y", focus_skill: "cadence", follow_up_question: "z" };
    expect(parseGeminiSessionAnalysis(JSON.stringify({ ...review, quick_coach: card })).quick_coach).toEqual(card);
  });

  it("is fine without one", () => {
    expect(parseGeminiSessionAnalysis(JSON.stringify(review))).not.toHaveProperty("quick_coach");
  });

  it("does not fail the review over a malformed card", () => {
    expect(() => parseGeminiSessionAnalysis(JSON.stringify({ ...review, quick_coach: "oops" }))).not.toThrow();
  });
});

describe("the hosted schema fits the server's limit", () => {
  it("stays under maxSchemaChars even with cue compliance", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DEFAULT_CONFIG } = require("../../../../supabase/functions/_shared/config") as typeof import("../../../../supabase/functions/_shared/config");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildResponseSchemaWithCueCompliance } = require("../schema") as typeof import("../schema");
    const size = JSON.stringify(withQuickCoach(buildResponseSchemaWithCueCompliance())).length;
    expect(size).toBeLessThan(DEFAULT_CONFIG.limits.maxSchemaChars);
  });
});
