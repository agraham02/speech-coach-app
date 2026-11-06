import { Platform, Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { rawFileName, rawStepRecord, tarEnd, tarHeader, tarPadding } from "../../../domain/signalLab/rawBundle";
import type { StepMeasure } from "../../../domain/signalLab/types";
import { logger } from "../../../utils/logger";

// Keeps the latest run of each Signal Lab test on the phone: its audio and its
// tracks. Only the dev tools reach this. A failure here never gets in the way of
// a test: the numbers on screen don't depend on it.

const rawDir = () => new Directory(Paths.document, "signal-lab-raw");
const marker = (testId: string) => `${testId.replace(/[^a-zA-Z0-9_-]+/g, "-")}__`;

function ensureDir(): Directory {
  const dir = rawDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function writeFile(dir: Directory, name: string, content: string | Uint8Array): void {
  const file = new File(dir, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
}

// A new run replaces the last one's files.
export function clearRawTest(testId: string): void {
  try {
    const dir = rawDir();
    if (!dir.exists) return;
    for (const item of dir.list()) if (item instanceof File && item.name.startsWith(marker(testId))) item.delete();
  } catch (error) {
    logger.warn(`[signal-lab] couldn't clear raw data: ${(error as Error).message}`);
  }
}

export function saveRawStep(testId: string, stepId: string, measure: StepMeasure, wav?: Uint8Array): void {
  try {
    const dir = ensureDir();
    writeFile(dir, rawFileName(testId, stepId, "json"), JSON.stringify(rawStepRecord(testId, stepId, measure, new Date().toISOString())));
    if (wav) writeFile(dir, rawFileName(testId, stepId, "wav"), wav);
  } catch (error) {
    logger.warn(`[signal-lab] couldn't save raw data: ${(error as Error).message}`);
  }
}

export function clearRawData(): void {
  try {
    const dir = rawDir();
    if (dir.exists) dir.delete();
  } catch (error) {
    logger.warn(`[signal-lab] couldn't clear raw data: ${(error as Error).message}`);
  }
}

// Packs everything into one tar file and opens the share sheet. False when there
// is nothing to send yet.
export async function shareRawBundle(): Promise<boolean> {
  const dir = rawDir();
  const files = dir.exists ? dir.list().filter((item): item is File => item instanceof File) : [];
  if (files.length === 0) return false;

  const bundle = new File(Paths.cache, "tono-signal-lab-raw.tar");
  if (bundle.exists) bundle.delete();
  bundle.create();
  const handle = bundle.open();
  try {
    const now = Math.floor(Date.now() / 1000);
    for (const file of files) {
      const bytes = await file.bytes();
      handle.writeBytes(tarHeader(file.name, bytes.length, now));
      handle.writeBytes(bytes);
      handle.writeBytes(tarPadding(bytes.length));
    }
    handle.writeBytes(tarEnd());
  } finally {
    handle.close();
  }
  if (Platform.OS === "ios") await Share.share({ url: bundle.uri });
  else await Share.share({ message: bundle.uri });
  return true;
}
