import { Directory, File, Paths } from "expo-file-system";

const SESSIONS_DIR_NAME = "sessions";

function getSessionsDirectory(): Directory {
  const dir = new Directory(Paths.document, SESSIONS_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

// Moves the temp file vision-camera wrote (e.g. a tmp cache path) into permanent
// app storage, named by session id, and returns the stable file:// URI to store in the DB.
export async function persistRecording(
  tempFileUri: string,
  sessionId: string,
): Promise<string> {
  const sourceFile = new File(tempFileUri);
  const destination = new File(getSessionsDirectory(), `${sessionId}.mp4`);
  await sourceFile.move(destination);
  return destination.uri;
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
