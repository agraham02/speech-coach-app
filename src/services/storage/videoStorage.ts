import { Directory, File, Paths } from "expo-file-system";
import { flagMediaFolder } from "./mediaBackup";

const SESSIONS_DIR_NAME = "sessions";

function getSessionsDirectory(): Directory {
  const dir = new Directory(Paths.document, SESSIONS_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
    flagMediaFolder(dir);
  }
  return dir;
}

// Moves the temp file vision-camera wrote (a cache path) into permanent app
// storage under `name`.mp4 and returns its file:// URI.
export async function persistRecording(tempFileUri: string, name: string): Promise<string> {
  const sourceFile = new File(tempFileUri);
  const destination = new File(getSessionsDirectory(), `${name}.mp4`);
  await sourceFile.move(destination);
  return destination.uri;
}

// Renames a saved take (preview-<ts>.mp4) to <sessionId>.mp4 once the user
// keeps it, so orphan cleanup can tell kept files from abandoned previews.
// Returns the new file name (stored as sessions.video_file) and URI.
export function claimRecordingForSession(previewUri: string, sessionId: string): { fileName: string; uri: string } {
  const source = new File(previewUri);
  const fileName = `${sessionId}.mp4`;
  const destination = new File(getSessionsDirectory(), fileName);
  if (source.exists && source.uri !== destination.uri) {
    source.moveSync(destination);
  }
  return { fileName, uri: destination.uri };
}

// Always resolve a stored video against the *current* Documents directory:
// on iOS the app-container path changes between builds/reinstalls, so an
// absolute path saved last month can point nowhere today.
export function resolveVideoUri(session: { videoFile: string | null; videoPath: string }): string {
  if (session.videoFile) return new File(getSessionsDirectory(), session.videoFile).uri;
  return session.videoPath;
}

export function videoExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function deleteRecording(fileUri: string): void {
  const file = new File(fileUri);
  if (file.exists) {
    file.delete();
  }
}

// Every file in the sessions folder with its last-modified time (ms).
export function listSessionFiles(): { name: string; uri: string; modifiedMs: number | null }[] {
  return getSessionsDirectory()
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({ name: file.name, uri: file.uri, modifiedMs: file.modificationTime ?? null }));
}

// Deletes every saved video (Reset app).
export function deleteAllRecordings(): void {
  const dir = new Directory(Paths.document, SESSIONS_DIR_NAME);
  if (dir.exists) dir.delete();
}

// Temporary files the app leaves in the cache: the speech recognizer's WAV
// takes and PCM scratch files, the camera's unsaved recordings, the video
// compressor's output, exported database copies and shared JSON. Saved
// videos and Rewind audio never live here (they're moved to Documents), so
// any of these is safe to delete once nothing is still writing it.
const TEMP_MEDIA = /^(.*\.(wav|pcm|mp4|mov)|(tono|speech-coach)-.*\.(db|json))$/i;

export function tempMediaBytes(): number {
  let bytes = 0;
  for (const entry of Paths.cache.list()) if (entry instanceof File && TEMP_MEDIA.test(entry.name)) bytes += entry.size ?? 0;
  return bytes;
}

// Deletes those files when older than `minAgeMs`: a day on launch, so a take
// still on screen is never touched; 0 for Reset and "Clear temporary files".
export function deleteTempMedia(minAgeMs = 0): number {
  const now = Date.now();
  let deleted = 0;
  for (const entry of Paths.cache.list()) {
    if (!(entry instanceof File) || !TEMP_MEDIA.test(entry.name)) continue;
    const modified = entry.modificationTime ?? null;
    if (minAgeMs > 0 && modified != null && now - modified < minAgeMs) continue;
    try {
      entry.delete();
      deleted++;
    } catch {
      // Still in use (a recording in progress) — leave it.
    }
  }
  return deleted;
}
