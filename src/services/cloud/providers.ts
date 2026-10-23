import { getProviderKey } from "../secrets/secretsStore";
import { getCloudConsent, getCloudModel, getCloudProvider, getShareProfileWithReviews } from "../prefs/prefsStore";

// Deep reviews run one of two ways. Tono AI (id "tono") goes through Tono's
// own server, which holds the Gemini key, enforces the limits and picks the
// model; it needs a signed-in account. Every other provider is bring your own
// key: the call goes straight from the phone to that provider with the user's
// key, billed to their account, and nothing goes through a server of ours.
//
// Gemini watches the video (voice, face and words). The others can't take
// video, so they read the on-device transcript plus everything the phone
// measured — pace, pauses, fillers, pitch, loudness, eye contact,
// expression (services/cloud/measuredReview.ts).
export type KeyProviderId = "gemini" | "openai" | "anthropic" | "openrouter";
export type ProviderId = KeyProviderId | "tono";

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
  tono: {
    id: "tono",
    name: "Tono AI",
    company: "Tono and Google",
    // Nothing to paste: sign in instead.
    keyUrl: "",
    keyHint: "",
    // The server chooses the model; this label is only what usage records show
    // until a response reports the real one.
    defaultModel: "tono-managed",
    modelHint: "",
    input: "video",
    blurb: "Watches the video, no key needed. Sign in and it just works.",
  },
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

// The bring-your-own-key providers, in display order. Tono AI is separate.
export const PROVIDER_ORDER: KeyProviderId[] = ["gemini", "openai", "anthropic", "openrouter"];

export function currentProvider(): CloudProvider {
  return PROVIDERS[getCloudProvider()];
}

export function modelFor(id: ProviderId): string {
  return getCloudModel(id) ?? PROVIDERS[id].defaultModel;
}

export async function hasProviderKey(id: ProviderId = getCloudProvider()): Promise<boolean> {
  if (id === "tono") return false; // Tono AI uses an account, not a key.
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
  if (provider.id === "tono") {
    return `Your video (with its audio) goes to Google Gemini for each AI review, and is deleted from Google when the review is done. The phone's measurements of the take (pace, pauses, pitch, loudness, eye contact, expression) go with it, never your transcript.${about}${drills} The sentences you choose in Mark it up, and the words of a Rewind, go the same way, as text.`;
  }
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
