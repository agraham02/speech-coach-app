import { Platform } from "react-native";
import type { CoachInput, CoachOutput } from "../../domain/coach/ruleCoach";
import { APPLE_COACH_SYSTEM, appleCoachSchema, buildAppleCoachPrompt, mergeAppleCoach } from "../../domain/coach/appleCoachPrompt";
import { withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";

// Apple Foundation Models (iOS 26, Apple Intelligence on) via
// @react-native-ai/apple. Loaded lazily: the package's native module only
// exists in iOS builds and throws on import anywhere else.

type AppleProvider = (() => unknown) & { isAvailable: () => boolean };

let provider: AppleProvider | null | undefined;

export function getAppleProvider(): AppleProvider | null {
  if (provider !== undefined) return provider;
  provider = null;
  if (Platform.OS !== "ios") return provider;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apple } = require("@react-native-ai/apple") as { apple: AppleProvider };
    provider = apple;
  } catch (error) {
    logger.warn(`[onDeviceLlm] Apple provider unavailable — ${(error as Error).message}`);
  }
  return provider;
}

export function isAppleModelAvailable(): boolean {
  const p = getAppleProvider();
  if (!p) return false;
  try {
    return p.isAvailable();
  } catch {
    return false;
  }
}

const COACH_TIMEOUT_MS = 30_000;

export async function coachWithOnDeviceModel(input: CoachInput, rules: CoachOutput): Promise<CoachOutput | null> {
  if (!input.transcript?.trim() || !isAppleModelAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateObject } = require("ai") as typeof import("ai");
    const model = getAppleProvider()!();
    const result = await withDeadline(
      generateObject({
        model: model as Parameters<typeof generateObject>[0]["model"],
        schema: appleCoachSchema,
        system: APPLE_COACH_SYSTEM,
        prompt: buildAppleCoachPrompt(input, rules),
      }),
      COACH_TIMEOUT_MS,
      "On-device coaching",
    );
    return mergeAppleCoach(rules, result.object);
  } catch (error) {
    // Refusals, schema failures or timeouts fall back to the rule coach.
    logger.warn(`[onDeviceLlm] Apple coach failed, using rules — ${(error as Error).message}`);
    return null;
  }
}
