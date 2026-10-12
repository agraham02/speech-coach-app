import { autoMark } from "../../domain/cadence/autoMark";
import { AUTO_MARK_SYSTEM, acceptModelMarks, autoMarkSchema, buildAutoMarkPrompt } from "../../domain/cadence/autoMarkPrompt";
import type { MarkedText } from "../../domain/cadence/marks";
import { getAppleProvider, isAppleModelAvailable } from "./onDeviceCoach";
import { withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";

const MARK_TIMEOUT_MS = 20_000;

// Marks a text for reading aloud: the on-device model when there is one
// (iPhone with Apple Intelligence), the marking-guide rules otherwise — or
// whenever the model's answer doesn't keep the words exactly.
export async function autoMarkText(text: string): Promise<{ marked: MarkedText; by: "model" | "rules" }> {
  const rules = autoMark(text);
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
