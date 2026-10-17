import { getProviderKey } from "../secrets/secretsStore";
import { getCloudConsent, getCloudModel, getCloudProvider, getShareProfileWithReviews } from "../prefs/prefsStore";

// Deep reviews are bring-your-own-key: the app itself is free and runs on
// the phone, and a deep review calls the AI provider the user picked, with
// their key, billed to their account. Nothing goes through a server of ours.
//
// Gemini watches the video (voice, face and words). The others can't take
// video, so they read the on-device transcript plus everything the phone
// measured — pace, pauses, fillers, pitch, loudness, eye contact,
// expression (services/cloud/measuredReview.ts).
export type ProviderId = "gemini" | "openai" | "anthropic" | "openrouter";

export interface CloudProvider {
  id: ProviderId;
  name: string;
  // Who the data goes to, for the consent and disclosure text.
  company: string;
  keyUrl: string;
  keyHint: string;
  defaultModel: string;
  modelHint: string;
  input: "video" | "measurements";
  blurb: string;
}

export const PROVIDERS: Record<ProviderId, CloudProvider> = {
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    company: "Google",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "From Google AI Studio",
    defaultModel: "gemini-flash-latest",
    modelHint: "Any Gemini model that takes video, e.g. gemini-flash-latest",
    input: "video",
    blurb: "Watches the video — voice, face and words together.",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    company: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "From the OpenAI platform",
    defaultModel: "gpt-6.1-sol",
    modelHint: "e.g. gpt-6.1-sol, or gpt-6-luna to spend less",
    input: "measurements",
    blurb: "Reads your transcript and the phone's measurements.",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    company: "Anthropic",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyHint: "From the Claude Console",
    defaultModel: "claude-sonnet-5-5",
    modelHint: "e.g. claude-sonnet-5-5, or claude-haiku-5-5 to spend less",
    input: "measurements",
    blurb: "Reads your transcript and the phone's measurements.",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    company: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "From openrouter.ai — one key, hundreds of models",
    defaultModel: "anthropic/claude-sonnet-5.5",
    modelHint: "Any model ID from openrouter.ai/models",
    input: "measurements",
    blurb: "One key for many models; reads your transcript and the phone's measurements.",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["gemini", "openai", "anthropic", "openrouter"];

export function currentProvider(): CloudProvider {
  return PROVIDERS[getCloudProvider()];
}

export function modelFor(id: ProviderId): string {
  return getCloudModel(id) ?? PROVIDERS[id].defaultModel;
}

export async function hasProviderKey(id: ProviderId = getCloudProvider()): Promise<boolean> {
  return !!(await getProviderKey(id));
}

export function hasConsent(id: ProviderId = getCloudProvider()): boolean {
  return getCloudConsent().includes(id);
}

// What a deep review sends, in one plain sentence (consent, Settings,
// the save screen).
export function whatGetsSent(provider: CloudProvider): string {
  const about = getShareProfileWithReviews() ? " A short note on your goals and what gets in your way (from setup) goes with it, so the feedback fits you — you can see it and turn it off in Settings." : "";
  const drills = ` The words you say in the Say it short drills (summaries and plain explanations) are sent as text too, so it can check the idea — never audio or video.`;
  return provider.input === "video"
    ? `Your video (with its audio) is uploaded to ${provider.company} for each deep review.${about}${drills}`
    : `Your transcript and the phone's measurements (pace, pauses, pitch, loudness, eye contact, expression) are sent to ${provider.company} for each deep review — never the video.${about}${drills}`;
}

// Why this take can't get a review from this provider right now, if not.
export function reviewBlockedReason(
  provider: CloudProvider,
  take: { hasVideo: boolean; hasDeviceTranscript: boolean },
): string | undefined {
  if (provider.input === "video" && !take.hasVideo) return `${provider.name} needs the video, which has been deleted.`;
  if (provider.input === "measurements" && !take.hasDeviceTranscript) {
    return `${provider.name} reviews the on-device transcript, and this take doesn't have one yet.`;
  }
  return undefined;
}
