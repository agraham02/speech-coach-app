import { buildSummaryReviewPrompt, acceptSummaryReview, jsonSchemaFor, schemaFor, SUMMARY_REVIEW_SYSTEM, type SummaryReview } from "../../domain/summary/summaryReviewPrompt";
import type { SummarySetup } from "../../domain/summary/prepareSummary";
import { defaultsFromProfile } from "../../domain/profile";
import { getAppleProvider, isAppleModelAvailable } from "../onDeviceLlm/onDeviceCoach";
import { callTextProvider, type TextProviderId } from "../cloud/textProviders";
import { toStrictSchema } from "../cloud/jsonSchema";
import { MAX_REVIEW_WORDS, fenced, reviewsLeft, wordCount } from "../cloud/inputGuards";
import { modelFor } from "../cloud/providers";
import { providerFor } from "../cloud/routing";
import { speakerContextForReview } from "../cloud/speakerContext";
import { generateContent } from "../gemini/geminiClient";
import { SPEECH_IS_DATA, STUTTER_NOTE } from "../gemini/schema";
import { getCloudCallsToday, getUserProfile, noteCloudCall } from "../prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";
import { withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";

// The AI's notes on a spoken summary (domain/summary/summaryReviewPrompt.ts).
// Only the words are sent: the transcripts plus our own subject or passage
// text. The user's cloud provider goes first when it has a key, the deep-
// review consent and the daily allowance; otherwise the on-device model
// (Apple Intelligence) runs on its own. Never throws: no review means the
// drill scores on what the phone measured and shows the written example.

const CLOUD_TIMEOUT_MS = 25_000;
const DEVICE_TIMEOUT_MS = 40_000;
// Too little said to say anything about.
const MIN_WORDS = 4;

export type ReviewSource = "cloud" | "device";

export interface SummaryReviewResult {
  review: SummaryReview;
  source: ReviewSource;
  // The cloud provider's name, for the label.
  provider?: string;
}

function systemFor(setup: SummarySetup): string {
  const stutters = defaultsFromProfile(getUserProfile()).stutterMode;
  return SUMMARY_REVIEW_SYSTEM[setup.type] + speakerContextForReview() + SPEECH_IS_DATA + (stutters ? STUTTER_NOTE : "");
}

async function reviewInCloud(setup: SummarySetup, transcripts: string[]): Promise<SummaryReviewResult | null> {
  const resolved = await providerFor("summary_notes", { hasVideo: false });
  if (!resolved) return null;
  const { provider, transport } = resolved;
  const hosted = transport === "hosted";
  const today = todayISODate();
  // The person's own key has a daily cap here; Tono AI's server has its own.
  if (!hosted && reviewsLeft(getCloudCallsToday(today)) <= 0) return null;
  const prompt = buildSummaryReviewPrompt(setup, transcripts, fenced);
  const system = systemFor(setup);
  try {
    if (!hosted) noteCloudCall(today);
    const schema = jsonSchemaFor(setup.type);
    const raw =
      provider.id === "gemini" || hosted
        ? await withDeadline(
            generateContent({ systemPrompt: `${system}\n\n${prompt}`, responseSchema: schema, ...(hosted ? { transport: "hosted" as const, kind: "text" as const } : {}) }),
            CLOUD_TIMEOUT_MS,
            `${provider.name} summary notes`,
          )
        : await withDeadline(
            callTextProvider({ provider: provider.id as TextProviderId, model: modelFor(provider.id), system, user: prompt, schemaName: "summary_review", schema: toStrictSchema(schema) }),
            CLOUD_TIMEOUT_MS,
            `${provider.name} summary notes`,
          );
    const accepted = acceptSummaryReview(setup, JSON.parse(raw), transcripts);
    if (!accepted) logger.warn(`[summary] ${provider.name} notes weren't usable`);
    return accepted ? { review: accepted, source: "cloud", provider: provider.name } : null;
  } catch (error) {
    logger.warn(`[summary] cloud notes failed — ${(error as Error).message}`);
    return null;
  }
}

async function reviewOnDevice(setup: SummarySetup, transcripts: string[]): Promise<SummaryReviewResult | null> {
  if (!isAppleModelAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateObject } = require("ai") as typeof import("ai");
    const model = getAppleProvider()!();
    const result = await withDeadline(
      generateObject({
        model: model as Parameters<typeof generateObject>[0]["model"],
        schema: schemaFor(setup.type),
        system: systemFor(setup),
        prompt: buildSummaryReviewPrompt(setup, transcripts, fenced),
      }),
      DEVICE_TIMEOUT_MS,
      "On-device summary notes",
    );
    const accepted = acceptSummaryReview(setup, result.object, transcripts);
    if (!accepted) logger.warn("[summary] on-device notes weren't usable");
    return accepted ? { review: accepted, source: "device" } : null;
  } catch (error) {
    logger.warn(`[summary] on-device notes failed — ${(error as Error).message}`);
    return null;
  }
}

export async function reviewSummary(setup: SummarySetup, transcripts: string[]): Promise<SummaryReviewResult | null> {
  const total = transcripts.join(" ");
  if (wordCount(total) < MIN_WORDS || wordCount(total) > MAX_REVIEW_WORDS) return null;
  return (await reviewInCloud(setup, transcripts)) ?? (await reviewOnDevice(setup, transcripts));
}
