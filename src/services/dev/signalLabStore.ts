import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { addResult, type LabResults } from "../../domain/signalLab/results";
import type { ReadingPreview } from "../../domain/signalLab/readingTrust";
import type { LabResult } from "../../domain/signalLab/types";
import { getHelperJson, setHelperJson } from "./devHelperStore";

// Signal Lab's saved runs and its Dev preview switch. They live in the dev
// helper store, so Reset app doesn't clear a phone's test results, and outside
// dev builds nothing is stored.

const RESULTS_KEY = "signalLab.results";
const PREVIEW_KEY = "signalLab.preview";

export function getLabResults(): LabResults {
  return getHelperJson<LabResults>(RESULTS_KEY, {});
}

export function saveLabResult(result: LabResult): LabResults {
  const next = addResult(getLabResults(), result);
  setHelperJson(RESULTS_KEY, next);
  return next;
}

export function clearLabResults(): void {
  setHelperJson(RESULTS_KEY, null);
}

export function getReadingPreview(): ReadingPreview {
  return getHelperJson<ReadingPreview>(PREVIEW_KEY, {});
}

export function setReadingPreview(preview: ReadingPreview): void {
  setHelperJson(PREVIEW_KEY, preview);
}

// What scoring should treat as counted early. Empty in any build without the
// dev tools, so a production score can never be changed by it.
export function activeReadingPreview(): ReadingPreview {
  return SHOW_DEV_TOOLS ? getReadingPreview() : {};
}
