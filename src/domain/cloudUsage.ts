// What a deep review costs in tokens, as the AI providers report it. Kept for
// the person using the app (Result screen, Settings) and for the Dev tab.

export interface TokenUsage {
  inputTokens: number | null;
  // The answer itself.
  outputTokens: number | null;
  // Reasoning the model did before answering (billed like output).
  thinkingTokens: number | null;
  totalTokens: number | null;
  // Input split by what was sent, when the provider says (video, audio, text).
  inputByType?: Record<string, number>;
}

export interface CloudUsageCall extends TokenUsage {
  at: string;
  provider: string;
  model: string;
  // Gemini watches the video; the others read the transcript and measurements.
  input: "video" | "measurements";
  elapsedMs: number;
  videoBytes: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

function total(input: number | null, output: number | null, thinking: number | null): number | null {
  return input === null && output === null && thinking === null ? null : (input ?? 0) + (output ?? 0) + (thinking ?? 0);
}

// generateContent's usageMetadata. Thought tokens are counted apart from the
// answer's (candidates) tokens.
export function usageFromGemini(meta: unknown): TokenUsage | null {
  const m = obj(meta);
  if (!m) return null;
  const input = num(m.promptTokenCount);
  const output = num(m.candidatesTokenCount);
  const thinking = num(m.thoughtsTokenCount);
  const reported = num(m.totalTokenCount);
  if (input === null && output === null && reported === null) return null;
  const byType: Record<string, number> = {};
  if (Array.isArray(m.promptTokensDetails)) {
    for (const entry of m.promptTokensDetails) {
      const d = obj(entry);
      const count = d ? num(d.tokenCount) : null;
      if (d && typeof d.modality === "string" && count !== null) byType[d.modality.toLowerCase()] = count;
    }
  }
  return {
    inputTokens: input,
    outputTokens: output,
    thinkingTokens: thinking,
    totalTokens: reported ?? total(input, output, thinking),
    ...(Object.keys(byType).length > 0 ? { inputByType: byType } : {}),
  };
}

// OpenAI's usage object (Responses API: input_tokens, output_tokens;
// chat-style, as OpenRouter returns: prompt_tokens, completion_tokens). Their
// output counts include the reasoning tokens, so those are taken out of it.
export function usageFromOpenAI(usage: unknown): TokenUsage | null {
  const u = obj(usage);
  if (!u) return null;
  const input = num(u.input_tokens) ?? num(u.prompt_tokens);
  const outputAll = num(u.output_tokens) ?? num(u.completion_tokens);
  if (input === null && outputAll === null) return null;
  const details = obj(u.output_tokens_details) ?? obj(u.completion_tokens_details);
  const thinking = details ? num(details.reasoning_tokens) : null;
  const output = outputAll === null ? null : Math.max(0, outputAll - (thinking ?? 0));
  return { inputTokens: input, outputTokens: output, thinkingTokens: thinking, totalTokens: num(u.total_tokens) ?? total(input, output, thinking) };
}

// Anthropic's usage: input_tokens and output_tokens (thinking is inside it).
export function usageFromAnthropic(usage: unknown): TokenUsage | null {
  const u = obj(usage);
  if (!u) return null;
  const input = num(u.input_tokens);
  const output = num(u.output_tokens);
  if (input === null && output === null) return null;
  return { inputTokens: input, outputTokens: output, thinkingTokens: null, totalTokens: total(input, output, null) };
}

export interface UsageTotals {
  reviews: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

export function sumUsage(calls: CloudUsageCall[]): UsageTotals {
  const totals: UsageTotals = { reviews: calls.length, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 };
  for (const c of calls) {
    totals.inputTokens += c.inputTokens ?? 0;
    totals.outputTokens += c.outputTokens ?? 0;
    totals.thinkingTokens += c.thinkingTokens ?? 0;
    totals.totalTokens += c.totalTokens ?? total(c.inputTokens, c.outputTokens, c.thinkingTokens) ?? 0;
  }
  return totals;
}

// Calls made in the same calendar month (local time) as `now`.
export function callsThisMonth(calls: CloudUsageCall[], now: Date = new Date()): CloudUsageCall[] {
  return calls.filter((c) => {
    const d = new Date(c.at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(2).replace(/0$/, "").replace(/\.$/, "") + "M";
}

// One line for a single review, for the Result screen.
export function describeUsage(call: CloudUsageCall): string {
  const parts: string[] = [];
  if (call.totalTokens !== null) parts.push(call.totalTokens.toLocaleString("en-US") + " tokens");
  const detail: string[] = [];
  if (call.inputTokens !== null) detail.push(formatTokens(call.inputTokens) + " in");
  if (call.outputTokens !== null) detail.push(formatTokens(call.outputTokens) + " out");
  if (call.thinkingTokens) detail.push(formatTokens(call.thinkingTokens) + " thinking");
  if (detail.length) parts.push("(" + detail.join(", ") + ")");
  if (call.elapsedMs > 0) parts.push("in " + Math.max(1, Math.round(call.elapsedMs / 1000)) + " s");
  return parts.join(" ");
}
