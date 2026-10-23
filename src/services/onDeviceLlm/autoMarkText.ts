import { autoMark } from "../../domain/cadence/autoMark";
import { AUTO_MARK_DATA_NOTE, AUTO_MARK_JSON_SCHEMA, AUTO_MARK_SYSTEM, acceptModelMarks, autoMarkSchema, buildAutoMarkPrompt } from "../../domain/cadence/autoMarkPrompt";
import type { MarkedText } from "../../domain/cadence/marks";
import { providerFor } from "../cloud/routing";
import { generateContent } from "../gemini/geminiClient";
import { getAppleProvider, isAppleModelAvailable } from "./onDeviceCoach";
import { withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";

const MARK_TIMEOUT_MS = 20_000;
const TONO_TIMEOUT_MS = 25_000;

// Who marked it: Tono AI, the on-device model, or the marking-guide rules.
export type MarkedBy = "tono" | "model" | "rules";

// Tono AI marks the text when it is available (signed in, allowed, a text call
// left). Only the one or two sentences chosen are sent. Any failure returns
// null, and the phone takes over.
async function markWithTono(text: string): Promise<MarkedText | null> {
  const resolved = await providerFor("mark_up", { hasVideo: false });
  if (!resolved || resolved.transport !== "hosted") return null;
  try {
    const raw = await withDeadline(
      generateContent({
        systemPrompt: `${AUTO_MARK_SYSTEM}\n${AUTO_MARK_DATA_NOTE}\n\n${buildAutoMarkPrompt(text)}`,
        responseSchema: AUTO_MARK_JSON_SCHEMA,
        transport: "hosted",
        kind: "text",
      }),
      TONO_TIMEOUT_MS,
      "Tono AI marking",
    );
    const marked = (JSON.parse(raw) as { marked?: unknown }).marked;
    const accepted = typeof marked === "string" ? acceptModelMarks(text, marked) : null;
    if (!accepted) logger.warn("[autoMarkText] Tono AI changed the words or marked nothing — using the phone");
    return accepted;
  } catch (error) {
    logger.warn(`[autoMarkText] Tono AI failed, using the phone — ${(error as Error).message}`);
    return null;
  }
}

// Marks a text for reading aloud: Tono AI first, then the on-device model
// (iPhone with Apple Intelligence), then the marking-guide rules. Whatever
// answers, the words must come back exactly as given or the next one is used.
export async function autoMarkText(text: string): Promise<{ marked: MarkedText; by: MarkedBy }> {
  const rules = autoMark(text);
  const viaTono = await markWithTono(rules.text);
  if (viaTono) return { marked: viaTono, by: "tono" };
  if (!isAppleModelAvailable()) return { marked: rules, by: "rules" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateObject } = require("ai") as typeof import("ai");
    const model = getAppleProvider()!();
    const result = await withDeadline(
      generateObject({
        model: model as Parameters<typeof generateObject>[0]["model"],
        schema: autoMarkSchema,
        system: AUTO_MARK_SYSTEM,
        prompt: buildAutoMarkPrompt(rules.text),
      }),
      MARK_TIMEOUT_MS,
      "On-device marking",
    );
    const accepted = acceptModelMarks(rules.text, result.object.marked);
    if (accepted) return { marked: accepted, by: "model" };
    logger.warn("[autoMarkText] model changed the words — using the rules");
  } catch (error) {
    logger.warn(`[autoMarkText] model failed, using the rules — ${(error as Error).message}`);
  }
  return { marked: rules, by: "rules" };
}
