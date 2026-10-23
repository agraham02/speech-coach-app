import { Platform } from "react-native";
import { logger } from "../../utils/logger";

// Apple's on-device models (iOS 26, Apple Intelligence on) via
// @react-native-ai/apple, used only for transcription in the Dev tab's ASR
// Lab. Not for judging: Tono AI judges on the server, and the phone's
// coaching is the rules (docs/decisions/inference-strategy.md). Loaded
// lazily: the native module only exists in iOS builds and throws on import
// anywhere else.

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
    logger.warn(`[apple] provider unavailable — ${(error as Error).message}`);
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
