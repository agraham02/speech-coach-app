import { Platform } from "react-native";
import type { LiveActivity } from "expo-widgets";
import type { PrepActivityProps } from "../../widgets/PrepActivity";
import { logger } from "../../utils/logger";

// The live prep and research timer on iPhone's Dynamic Island and Lock Screen
// (widgets/PrepActivity.tsx). iOS only, and only in a build that contains the
// expo-widgets native module: the app loads it lazily and treats its absence
// (Android, a dev client from before it was added) as "no Dynamic Island",
// never as an error.
//
// The widget's layout is JavaScript: createLiveActivity stores it in the App
// Group each launch, so layout changes ship over the air. Only the native
// module and the widget extension need a build (1.1.0 and later have both).
//
// ActivityKit only lets an app start a Live Activity while it's in the
// foreground, so it starts when the countdown does and stays up while you're
// back in the app (iOS hides your own app's activity from the Dynamic Island
// then anyway). It ends when the countdown is over, and its stale date is the
// deadline, so one left behind by a killed app dims rather than counting on.

type Factory = {
  start: (props: PrepActivityProps, url?: string, staleDate?: Date) => LiveActivity<PrepActivityProps>;
  getInstances: () => LiveActivity<PrepActivityProps>[];
};

let current: LiveActivity<PrepActivityProps> | null = null;
let missingLogged = false;

function factory(): Factory | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../../widgets/PrepActivity").default as Factory;
  } catch (error) {
    // Once per launch, so a build without the module shows up in Logs.
    if (!missingLogged) {
      missingLogged = true;
      logger.warn(`[prep] no Dynamic Island timer in this build — ${(error as Error).message}`);
    }
    return null;
  }
}

const MAX_PROMPT = 90;
const short = (text: string) => (text.length > MAX_PROMPT ? `${text.slice(0, MAX_PROMPT - 1).trimEnd()}…` : text);

export type PrepActivityLabel = PrepActivityProps["label"];

// Starts the timer, or moves its end if it's already running.
export async function startPrepActivity(
  promptText: string,
  startedAtMs: number,
  endsAtMs: number,
  label: PrepActivityLabel = "Researching",
): Promise<void> {
  const make = factory();
  if (!make) return;
  const props: PrepActivityProps = { prompt: short(promptText), startedAtMs, endsAtMs, label };
  const staleDate = new Date(endsAtMs);
  try {
    if (current) {
      await current.update(props, staleDate);
      return;
    }
    // Deep link back to the recording screen (scheme "tono").
    current = make.start(props, "tono://", staleDate);
    logger.info("[prep] Dynamic Island timer started");
  } catch (error) {
    // Most often: Live Activities are turned off for Tono in Settings.
    logger.warn(`[prep] couldn't start the Dynamic Island timer — ${(error as Error).message}`);
    current = null;
  }
}

// Whether this launch has a timer up (one it started and hasn't ended).
export function prepActivityRunning(): boolean {
  return current != null;
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
