import { Directory, File, Paths } from "expo-file-system";
import { getVideoStorageBytes } from "../data/dataExport";
import { tempMediaBytes } from "../storage/videoStorage";

export interface StorageLine {
  key: "videos" | "rewinds" | "models" | "data" | "temp";
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

// Where the app's space goes, biggest first (Settings → Storage, Dev tab).
// The models folder counts a paused download's partial file too.
export function storageBreakdown(): StorageLine[] {
  const database = ["speech_coach.db", "speech_coach.db-wal", "speech_coach.db-shm"].reduce((sum, name) => sum + fileBytes("SQLite", name), 0);
  const lines: StorageLine[] = [
    { key: "videos", label: "Videos", bytes: getVideoStorageBytes() },
    { key: "rewinds", label: "Rewind recordings", bytes: directoryBytes("rewinds") },
    { key: "models", label: "Transcription model", bytes: directoryBytes("models") },
    { key: "data", label: "Practice data", bytes: database },
    { key: "temp", label: "Temporary files", bytes: tempMediaBytes() },
  ];
  return lines.sort((a, b) => b.bytes - a.bytes);
}
