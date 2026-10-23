import type { ModelPrice } from "./config.ts";

export interface TokenCounts {
  inputText: number;
  inputVideo: number;
  inputAudio: number;
  output: number;
  thinking: number;
}

const PER_M = 1_000_000;

// Thinking tokens are billed as output.
export function costUsd(tokens: TokenCounts, price: ModelPrice): number {
  const audioRate = price.audioPerM ?? price.inputPerM;
  const input = (tokens.inputText + tokens.inputVideo) * price.inputPerM + tokens.inputAudio * audioRate;
  const output = (tokens.output + tokens.thinking) * price.outputPerM;
  return (input + output) / PER_M;
}

// A rough ceiling used BEFORE the call, to check caps and budgets. Every input
// token is priced at the dearer of the two input rates and the output is
// assumed to fill the cap.
export function estimateCostUsd(args: { inputTokens: number; maxOutputTokens: number; price: ModelPrice }): number {
  const rate = Math.max(args.price.inputPerM, args.price.audioPerM ?? 0);
  return (args.inputTokens * rate + args.maxOutputTokens * args.price.outputPerM) / PER_M;
}

// Google video plus audio runs at about 100 tokens a second at default
// sampling (docs: video-understanding): roughly 70 for the frames at one
// frame a second and 32 for the audio. Scaled by the sampling rate for the
// video part only.
const VIDEO_TOKENS_PER_SECOND = 70;
const AUDIO_TOKENS_PER_SECOND = 32;

export function estimateVideoInputTokens(seconds: number, fps = 1): number {
  return Math.ceil(seconds * (VIDEO_TOKENS_PER_SECOND * fps + AUDIO_TOKENS_PER_SECOND));
}

// About one token per 3.5 characters of English; rounded up on purpose.
export function estimateTextTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
}

// Reads Gemini usageMetadata. Returns null when it holds nothing usable, so
// the caller can fall back to the reserved estimate rather than record zero.
export function tokensFromGeminiUsage(usage: GeminiUsageMetadata | undefined | null): TokenCounts | null {
  if (!usage || typeof usage.promptTokenCount !== "number") return null;
  const by: Record<string, number> = {};
  for (const d of usage.promptTokensDetails ?? []) {
    if (d.modality && typeof d.tokenCount === "number") {
      const key = d.modality.toUpperCase();
      by[key] = (by[key] ?? 0) + d.tokenCount;
    }
  }
  const hasDetail = Object.keys(by).length > 0;
  const video = by.VIDEO ?? 0;
  const audio = by.AUDIO ?? 0;
  const text = hasDetail ? usage.promptTokenCount - video - audio : usage.promptTokenCount;
  return {
    inputText: Math.max(0, text),
    inputVideo: video,
    inputAudio: audio,
    output: usage.candidatesTokenCount ?? 0,
    thinking: usage.thoughtsTokenCount ?? 0,
  };
}
