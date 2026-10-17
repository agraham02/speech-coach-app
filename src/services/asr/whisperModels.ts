import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import type { DownloadPauseState } from "expo-file-system/legacy";
import { getDevJson, setDevJson } from "../dev/devStore";
import { excludeFromBackup, isExcludedFromBackup } from "../../../modules/backup-exclusion";
import { logger } from "../../utils/logger";

// The GGML models whisper.rn can run, downloaded on demand into the app
// documents folder (not the cache, which iOS may purge). A model is in place
// only once its download finished: it is written under a .part name first.

export type WhisperModelId = "turbo-q5";

// Model files this app used to offer. Removed from the phone once, so a
// finished experiment does not keep half a gigabyte.
const RETIRED_MODEL_FILES = ["ggml-crisperwhisper-small-f16.bin", "ggml-crisperwhisper-turbo-f16.bin"];

export function removeRetiredModels(): void {
  try {
    const dir = modelsDirectory();
    for (const name of RETIRED_MODEL_FILES) {
      for (const suffix of ["", ".part"]) {
        const file = new File(dir, name + suffix);
        if (file.exists) file.delete();
      }
    }
  } catch {
    // Nothing to clean up, or it is in use: try again next launch.
  }
}

// The model the app transcribes with once it is downloaded.
export const DEFAULT_ASR_MODEL: WhisperModelId = "turbo-q5";

export interface WhisperModelInfo {
  id: WhisperModelId;
  label: string;
  file: string;
  url: string;
  // Approximate download size, for display and for progress when the server
  // does not report a length.
  bytes: number;
  license: string;
  note: string;
}

const WHISPER_CPP = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

export const WHISPER_MODELS: WhisperModelInfo[] = [
  {
    id: "turbo-q5",
    label: "Whisper large-v3-turbo (q5)",
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: WHISPER_CPP + "ggml-large-v3-turbo-q5_0.bin",
    bytes: 574_000_000,
    license: "MIT",
    note: "Hears every um and uh when primed with the filler prompt.",
  },
];

export function modelInfo(id: WhisperModelId): WhisperModelInfo {
  const info = WHISPER_MODELS.find((m) => m.id === id);
  if (!info) throw new Error("Unknown model " + id);
  return info;
}

// The models are large and can always be downloaded again, so they stay out
// of iCloud and device backups. The flag is on the folder, which covers every
// file inside it (Apple QA1719), including a half-finished .part download.
let backupExcluded = false;

function modelsDirectory(): Directory {
  const dir = new Directory(Paths.document, "models");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (!backupExcluded) {
    const result = excludeFromBackup(dir.uri);
    // Tried again on the next call unless it worked or cannot work here.
    backupExcluded = result !== false;
    logger.info("[models] models folder excluded from backup: " + (result === null ? "not supported in this build" : result));
  }
  return dir;
}

export interface ModelBackupStatus {
  // The system's answer for the folder, and for each downloaded model file.
  // null: unknown (Android, or an iOS build made before the module existed).
  folder: boolean | null;
  files: { name: string; excluded: boolean | null }[];
}

export function modelBackupStatus(): ModelBackupStatus {
  const dir = modelsDirectory();
  const files = WHISPER_MODELS.filter((m) => isModelDownloaded(m.id)).map((m) => ({ name: m.file, excluded: isExcludedFromBackup(modelFile(m.id).uri) }));
  return { folder: isExcludedFromBackup(dir.uri), files };
}

// Sets the flag again on the folder and every downloaded file, and says
// whether the system now agrees. For the Dev tools and after a download.
export function reapplyBackupExclusion(): ModelBackupStatus {
  backupExcluded = false;
  const dir = modelsDirectory();
  for (const m of WHISPER_MODELS) if (isModelDownloaded(m.id)) excludeFromBackup(modelFile(m.id).uri);
  return { ...modelBackupStatus(), folder: isExcludedFromBackup(dir.uri) };
}

export function modelFile(id: WhisperModelId): File {
  return new File(modelsDirectory(), modelInfo(id).file);
}

export function isModelDownloaded(id: WhisperModelId): boolean {
  try {
    return modelFile(id).exists;
  } catch {
    return false;
  }
}

export function downloadedModelBytes(id: WhisperModelId): number {
  try {
    const file = modelFile(id);
    return file.exists ? file.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

// The model file, or an error when it has not been downloaded yet.
export async function ensureModel(id: WhisperModelId): Promise<string> {
  const file = modelFile(id);
  if (!file.exists) throw new Error(modelInfo(id).label + " is not downloaded yet.");
  return file.uri;
}

// ---- Downloads -----------------------------------------------------------
// Owned by this module rather than a screen, so leaving the ASR Lab does not
// stop one. They run in an iOS background session, can be paused and
// resumed, and a paused one keeps its partial file.

export interface DownloadState {
  status: "downloading" | "paused" | "failed";
  // 0-1
  progress: number;
  bytesPerSecond: number;
  error?: string;
}

type PausedMap = Partial<Record<WhisperModelId, { pause: DownloadPauseState; progress: number }>>;

const PAUSED_KEY = "modelDownloadsPaused";
const states = new Map<WhisperModelId, DownloadState>();
const tasks = new Map<WhisperModelId, LegacyFS.DownloadResumable>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeDownloads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function partFile(id: WhisperModelId): File {
  return new File(modelsDirectory(), modelInfo(id).file + ".part");
}

function setPaused(id: WhisperModelId, value: PausedMap[WhisperModelId]): void {
  const all = getDevJson<PausedMap>(PAUSED_KEY, {});
  if (value) all[id] = value;
  else delete all[id];
  setDevJson(PAUSED_KEY, all);
}

// What the UI should show for a model that is downloading, paused (also after
// an app restart) or failed. Undefined when there is nothing in progress.
export function getDownloadState(id: WhisperModelId): DownloadState | undefined {
  const live = states.get(id);
  if (live) return live;
  const paused = getDevJson<PausedMap>(PAUSED_KEY, {})[id];
  return paused ? { status: "paused", progress: paused.progress, bytesPerSecond: 0 } : undefined;
}

// Told when a model finishes downloading.
const readyListeners = new Set<(id: WhisperModelId) => void>();
export function subscribeModelReady(listener: (id: WhisperModelId) => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

// Starts a download, or resumes a paused one. Returns at once.
export function startDownload(id: WhisperModelId): void {
  if (tasks.has(id) || isModelDownloaded(id)) return;
  runDownload(id).catch(() => undefined);
}

async function runDownload(id: WhisperModelId): Promise<void> {
  const info = modelInfo(id);
  const part = partFile(id);
  const saved = getDevJson<PausedMap>(PAUSED_KEY, {})[id];
  let resumeData: string | undefined = saved && part.exists ? saved.pause.resumeData : undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let lastBytes = 0;
    let lastAt = Date.now();
    let speed = 0;
    const task = LegacyFS.createDownloadResumable(
      info.url,
      part.uri,
      { sessionType: LegacyFS.FileSystemSessionType.BACKGROUND },
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const now = Date.now();
        if (now - lastAt >= 1000) {
          const instant = (totalBytesWritten - lastBytes) / ((now - lastAt) / 1000);
          speed = speed === 0 ? instant : speed * 0.6 + instant * 0.4;
          lastBytes = totalBytesWritten;
          lastAt = now;
        }
        const total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : info.bytes;
        states.set(id, { status: "downloading", progress: Math.min(1, totalBytesWritten / total), bytesPerSecond: speed });
        emit();
      },
      resumeData,
    );
    tasks.set(id, task);
    states.set(id, { status: "downloading", progress: saved && resumeData ? saved.progress : 0, bytesPerSecond: 0 });
    emit();
    try {
      const result = resumeData ? await task.resumeAsync() : await task.downloadAsync();
      tasks.delete(id);
      // Undefined: paused or cancelled, which already updated the state.
      if (!result) return;
      if (result.status >= 400) throw new Error("The server answered " + result.status + ".");
      setPaused(id, undefined);
      await part.move(modelFile(id));
      // The folder is already flagged; the file too, in case a move dropped it.
      excludeFromBackup(modelFile(id).uri);
      states.delete(id);
      emit();
      readyListeners.forEach((listener) => listener(id));
      return;
    } catch (error) {
      tasks.delete(id);
      // A stale resume token (the signed link expired): start over once.
      if (resumeData && attempt === 0) {
        resumeData = undefined;
        setPaused(id, undefined);
        try {
          if (part.exists) part.delete();
        } catch {
          // Nothing to remove.
        }
        continue;
      }
      states.set(id, { status: "failed", progress: 0, bytesPerSecond: 0, error: (error as Error).message });
      emit();
      return;
    }
  }
}

// Stops a download but keeps what was downloaded, so it can be resumed.
export async function pauseDownload(id: WhisperModelId): Promise<void> {
  const task = tasks.get(id);
  if (!task) return;
  const progress = states.get(id)?.progress ?? 0;
  const pause = await task.pauseAsync();
  tasks.delete(id);
  states.delete(id);
  setPaused(id, { pause, progress });
  emit();
}

// Stops a download and throws away the partial file.
export async function cancelDownload(id: WhisperModelId): Promise<void> {
  const task = tasks.get(id);
  tasks.delete(id);
  states.delete(id);
  if (task) await task.cancelAsync().catch(() => undefined);
  setPaused(id, undefined);
  try {
    const part = partFile(id);
    if (part.exists) part.delete();
  } catch {
    // Nothing to remove.
  }
  emit();
}

export function formatSpeed(bytesPerSecond: number): string {
  return (bytesPerSecond / 1_000_000).toFixed(1) + " MB/s";
}

export function deleteModel(id: WhisperModelId): void {
  try {
    const file = modelFile(id);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

export function formatModelSize(bytes: number): string {
  return bytes >= 1_000_000_000 ? (bytes / 1_000_000_000).toFixed(2) + " GB" : Math.round(bytes / 1_000_000) + " MB";
}
