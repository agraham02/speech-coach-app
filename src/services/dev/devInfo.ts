import Constants from "expo-constants";
import { Platform } from "react-native";
import { getDatabase } from "../db/database";
import { LATEST_DB_VERSION } from "../db/migrations";
import { DEFAULT_ASR_MODEL, isModelDownloaded } from "../asr/whisperModels";

// What the Dev hub's status card shows. Everything here is read-only.

export function buildKind(): "Dev" | "Preview" {
  return __DEV__ ? "Dev" : "Preview";
}

export function appVersion(): string {
  return Constants.expoConfig?.version ?? "?";
}

export function osLabel(): string {
  return `${Platform.OS === "ios" ? "iOS" : "Android"} ${Platform.Version}`;
}

export async function readDbVersion(): Promise<{ current: number; latest: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  return { current: row?.user_version ?? 0, latest: LATEST_DB_VERSION };
}

// Steps of saved takes that failed, or were cut off and not resumed.
export async function countProblemSteps(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM session_steps st
     JOIN sessions s ON s.id = st.session_id
     WHERE s.deleted_at IS NULL AND st.status IN ('failed', 'interrupted')`,
  );
  return row?.n ?? 0;
}

// The transcription engine the pipeline uses (shown on the status card).
export function transcriberLabel(): string {
  return isModelDownloaded(DEFAULT_ASR_MODEL) ? "Whisper large-v3-turbo + filler prompt" : "Not downloaded";
}

// The header every JSON export carries, so a pasted file says what made it.
export function exportContext(): { exportedAt: string; app: { version: string; build: string; os: string } } {
  return { exportedAt: new Date().toISOString(), app: { version: appVersion(), build: buildKind(), os: osLabel() } };
}
