import { Platform } from "react-native";
import type { LiveActivity } from "expo-widgets";
import type { PrepActivityProps } from "../../widgets/PrepActivity";
import { logger } from "../../utils/logger";

// The live prep and research timer on iPhone's Dynamic Island and Lock Screen
// (widgets/PrepActivity.tsx). iOS only, and only in a build that contains the
// expo-widgets native module: the app loads it lazily and treats its absence
// (Android, a dev client from before it was added) as "no Dynamic Island",
// never as an error.

type Factory = {
  start: (props: PrepActivityProps, url?: string) => LiveActivity<PrepActivityProps>;
  getInstances: () => LiveActivity<PrepActivityProps>[];
};

let current: LiveActivity<PrepActivityProps> | null = null;

function factory(): Factory | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../../widgets/PrepActivity").default as Factory;
  } catch {
    return null;
  }
}

const MAX_PROMPT = 90;
const short = (text: string) => (text.length > MAX_PROMPT ? `${text.slice(0, MAX_PROMPT - 1).trimEnd()}…` : text);

// Starts the timer, or moves its end if it's already running.
export async function startPrepActivity(promptText: string, startedAtMs: number, endsAtMs: number): Promise<void> {
  const make = factory();
  if (!make) return;
  const props: PrepActivityProps = { prompt: short(promptText), startedAtMs, endsAtMs };
  try {
    if (current) {
      await current.update(props);
      return;
    }
    // Deep link back to the recording screen (scheme "tono").
    current = make.start(props, "tono://");
  } catch (error) {
    logger.warn(`[prep] couldn't start the Dynamic Island timer — ${(error as Error).message}`);
    current = null;
  }
}

export async function endPrepActivity(): Promise<void> {
  const make = factory();
  if (!make) return;
  try {
    // Also ends one left behind by a relaunch.
    const all = [...(current ? [current] : []), ...make.getInstances()];
    await Promise.all(all.map((a) => a.end("immediate").catch(() => undefined)));
  } catch {
    // Nothing to end.
  } finally {
    current = null;
  }
}
