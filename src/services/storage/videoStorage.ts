import { Directory, File, Paths } from "expo-file-system";

const SESSIONS_DIR_NAME = "sessions";

function getSessionsDirectory(): Directory {
  const dir = new Directory(Paths.document, SESSIONS_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
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
    source.move(destination);
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

export function getVideoFileSize(fileUri: string): number {
  return new File(fileUri).size;
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
