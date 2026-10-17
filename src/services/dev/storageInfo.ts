import { Directory, File, Paths } from "expo-file-system";
import { getVideoStorageBytes } from "../data/dataExport";
import { WHISPER_MODELS, downloadedModelBytes } from "../asr/whisperModels";

export interface StorageLine {
  label: string;
  bytes: number;
}

function fileBytes(...parts: string[]): number {
  try {
    const file = new File(Paths.document, ...parts);
    return file.exists ? file.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

function directoryBytes(name: string): number {
  try {
    const dir = new Directory(Paths.document, name);
    if (!dir.exists) return 0;
    return dir.list().reduce((sum, entry) => sum + (entry instanceof File ? entry.size ?? 0 : 0), 0);
  } catch {
    return 0;
  }
}

// Where the app space goes, biggest first.
export function storageBreakdown(): StorageLine[] {
  const database = fileBytes("SQLite", "speech_coach.db") + fileBytes("SQLite", "speech_coach.db-wal");
  const models = WHISPER_MODELS.reduce((sum, m) => sum + downloadedModelBytes(m.id), 0);
  return [
    { label: "Videos", bytes: getVideoStorageBytes() },
    { label: "Rewind audio", bytes: directoryBytes("rewinds") },
    { label: "Whisper models", bytes: models },
    { label: "Database", bytes: database },
  ].sort((a, b) => b.bytes - a.bytes);
}
