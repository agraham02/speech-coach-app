import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { getHelperJson, setHelperJson } from "./devHelperStore";

// Dev, App tools, State presets: "Skip the transcription model download".
// While on, the onboarding step and the download banners treat the 574 MB
// model as ready, so a fresh install on the emulator is not held up by it.
// Nothing is faked below that: isModelDownloaded() still tells the truth, a
// take's Transcript step fails with a clear message that says the download is
// skipped (onDeviceAsrClient.ts), and Settings, Coaching & AI shows the real
// state with its Download button. Kept in the dev helpers' store, which Reset
// app does not clear. Always false in a production build.

const KEY = "skipModelDownload";

let value: boolean | null = null;
const listeners = new Set<() => void>();

export function skipModelDownloadActive(): boolean {
  if (!SHOW_DEV_TOOLS) return false;
  if (value === null) value = getHelperJson<boolean>(KEY, false) === true;
  return value;
}

export function setSkipModelDownload(on: boolean): void {
  if (!SHOW_DEV_TOOLS) return;
  value = on;
  setHelperJson(KEY, on ? true : null);
  listeners.forEach((l) => l());
}

export function subscribeSkipModel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
