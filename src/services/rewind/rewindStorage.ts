import { Directory, File, Paths } from "expo-file-system";
import { flagMediaFolder } from "../storage/mediaBackup";

// A Rewind take's audio: one WAV per take in the app's documents folder.
// Only the file name is stored — on iOS the container path changes between
// builds, so a path saved last month can point nowhere (see videoStorage.ts).

const DIR_NAME = "rewinds";

function rewindsDirectory(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
    flagMediaFolder(dir);
  }
  return dir;
}

// Writes the take and returns the file name to store.
export function writeRewindAudio(id: string, wav: Uint8Array): string {
  const fileName = `${id}.wav`;
  const file = new File(rewindsDirectory(), fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(wav);
  return fileName;
}

export function resolveRewindUri(fileName: string): string {
  return new File(rewindsDirectory(), fileName).uri;
}

export function rewindAudioExists(fileName: string | null): boolean {
  if (!fileName) return false;
  try {
    return new File(rewindsDirectory(), fileName).exists;
  } catch {
    return false;
  }
}

export function deleteRewindAudio(fileName: string | null): void {
  if (!fileName) return;
  try {
    const file = new File(rewindsDirectory(), fileName);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

// Every file in the rewinds folder with its last-modified time (ms).
export function listRewindFiles(): { name: string; uri: string; modifiedMs: number | null }[] {
  return rewindsDirectory()
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({ name: file.name, uri: file.uri, modifiedMs: file.modificationTime ?? null }));
}

export function deleteAllRewindAudio(): void {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (dir.exists) dir.delete();
}
