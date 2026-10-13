import { Directory, File, Paths } from "expo-file-system";

// A Rewind take's audio: one WAV per take in the app's documents folder.
// Only the file name is stored — on iOS the container path changes between
// builds, so a path saved last month can point nowhere (see videoStorage.ts).

const DIR_NAME = "rewinds";

function rewindsDirectory(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
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

export function deleteAllRewindAudio(): void {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (dir.exists) dir.delete();
}
