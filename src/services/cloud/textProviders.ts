import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";
import { getProviderKey } from "../secrets/secretsStore";
import { CloudApiError } from "./cloudErrors";
import { PROVIDERS, type KeyProviderId } from "./providers";
import { usageFromAnthropic, usageFromOpenAI, type TokenUsage } from "../../domain/cloudUsage";

// Text-in, JSON-out calls to the providers that don't watch video: OpenAI
// (Responses API), Anthropic (Messages API) and OpenRouter (OpenAI-style
// chat completions). Each asks for output matching a JSON Schema with the
// provider's own structured-output feature; the caller still validates.

export type TextProviderId = Exclude<KeyProviderId, "gemini">;

interface TextCall {
  provider: TextProviderId;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  // Already strict (see toStrictSchema): every object closed and complete.
  schema: object;
  // Told how many tokens the call used, as the provider reports it.
  onUsage?: (usage: TokenUsage) => void;
}

const TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 16_000;
const RETRY_DELAYS_MS = [2_000, 6_000];

async function requireKey(provider: TextProviderId): Promise<string> {
  const key = await getProviderKey(provider);
  if (!key) throw new CloudApiError(PROVIDERS[provider].name, `No ${PROVIDERS[provider].name} API key set — add one in Settings → Deep reviews.`);
  return key;
}

// POST with a couple of retries on 5xx, which is nearly always transient.
async function post(provider: TextProviderId, url: string, headers: Record<string, string>, body: object): Promise<unknown> {
  const name = PROVIDERS[provider].name;
  for (let attempt = 0; ; attempt++) {
    const response = await fetchWithTimeout(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) },
      TIMEOUT_MS,
      `${name} deep review`,
    );
    if (response.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
      logger.warn(`[cloud] ${provider} ${response.status}, retrying`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new CloudApiError(name, `${name} request failed (${response.status})`, response.status, text);
    try {
      return JSON.parse(text);
    } catch {
      throw new CloudApiError(name, `${name} sent back something that wasn't JSON.`, undefined, text);
    }
  }
}

async function callOpenAI({ model, system, user, schemaName, schema, onUsage }: TextCall): Promise<string> {
  const key = await requireKey("openai");
  const data = (await post("openai", "https://api.openai.com/v1/responses", { Authorization: `Bearer ${key}` }, {
    model,
    instructions: system,
    input: [{ role: "user", content: user }],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
  })) as { status?: string; usage?: unknown; output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[] };
  const openAiUsage = usageFromOpenAI(data.usage);
  if (openAiUsage) onUsage?.(openAiUsage);
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) return part.text;
      if (part.type === "refusal") throw new CloudApiError("OpenAI", `OpenAI declined to review this take: ${part.refusal ?? ""}`.trim());
    }
  }
  throw new CloudApiError("OpenAI", `OpenAI didn't return a review${data.status && data.status !== "completed" ? ` (${data.status})` : ""}.`, undefined, data);
}

async function callAnthropic({ model, system, user, schema, onUsage }: TextCall): Promise<string> {
  const key = await requireKey("anthropic");
  const data = (await post("anthropic", "https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" }, {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  })) as { stop_reason?: string; usage?: unknown; content?: { type: string; text?: string }[] };
  const anthropicUsage = usageFromAnthropic(data.usage);
  if (anthropicUsage) onUsage?.(anthropicUsage);
  if (data.stop_reason === "refusal") throw new CloudApiError("Anthropic Claude", "Claude declined to review this take.");
  const text = (data.content ?? []).find((block) => block.type === "text" && block.text)?.text;
  if (!text) throw new CloudApiError("Anthropic Claude", "Claude didn't return a review.", undefined, data);
  return text;
}

// The first {...} in a reply — for models that answer in JSON but wrap it in
// prose or code fences when they can't use structured output.
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

async function callOpenRouter({ model, system, user, schemaName, schema, onUsage }: TextCall): Promise<string> {
  const key = await requireKey("openrouter");
  const headers = { Authorization: `Bearer ${key}`, "X-Title": "Tono" };
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const ask = async (structured: boolean) =>
    (await post("openrouter", "https://openrouter.ai/api/v1/chat/completions", headers, {
      model,
      messages: structured
        ? messages
        : [...messages, { role: "user", content: `Reply with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` }],
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(structured ? { response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } } : {}),
    })) as { usage?: unknown; choices?: { message?: { content?: string } }[] };

  let data;
  try {
    data = await ask(true);
  } catch (error) {
    // Not every model on OpenRouter supports structured output; ask again
    // with the schema in the prompt instead.
    if (!(error instanceof CloudApiError) || error.status !== 400) throw error;
    logger.warn(`[cloud] openrouter ${model}: no structured output, retrying with the schema in the prompt`);
    data = await ask(false);
  }
  const routerUsage = usageFromOpenAI(data.usage);
  if (routerUsage) onUsage?.(routerUsage);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new CloudApiError("OpenRouter", "OpenRouter didn't return a review.", undefined, data);
  return extractJsonObject(text);
}

export function callTextProvider(call: TextCall): Promise<string> {
  switch (call.provider) {
    case "openai":
      return callOpenAI(call);
    case "anthropic":
      return callAnthropic(call);
    case "openrouter":
      return callOpenRouter(call);
  }
}

// A cheap authenticated request to confirm a key works, for Settings'
// "Check key". Resolves to null when it does, or a reason when it doesn't.
export async function checkProviderKey(provider: KeyProviderId, key: string): Promise<string | null> {
  const trimmed = key.trim();
  if (!trimmed) return "Paste a key first.";
  const name = PROVIDERS[provider].name;
  const [url, headers] = ((): [string, Record<string, string>] => {
    switch (provider) {
      case "gemini":
        return [`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(trimmed)}`, {}];
      case "openai":
        return ["https://api.openai.com/v1/models", { Authorization: `Bearer ${trimmed}` }];
      case "anthropic":
        return ["https://api.anthropic.com/v1/models?limit=1", { "x-api-key": trimmed, "anthropic-version": "2023-06-01" }];
      case "openrouter":
        return ["https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${trimmed}` }];
    }
  })();
  try {
    const response = await fetchWithTimeout(url, { headers }, 20_000, `Checking the ${name} key`);
    if (response.ok) return null;
    if (response.status === 400 || response.status === 401 || response.status === 403) return `${name} didn't accept this key.`;
    return `${name} answered ${response.status} — try again in a moment.`;
  } catch {
    return `Couldn't reach ${name} — check your connection.`;
  }
}
