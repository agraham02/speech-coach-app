import { Directory, File, Paths } from "expo-file-system";
import { flagMediaFolder } from "../storage/mediaBackup";

// A Rewind take's audio: one file per take in the app's documents folder
// (WAV while it is processed, then AAC in an m4a; see compressRewindAudio).
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

type AudioCompressor = { Audio: { compress: (uri: string, options: Record<string, unknown>) => Promise<string> } };

// Re-encodes a take's WAV (16 kHz, 16-bit: about 1.9 MB a minute) to AAC in
// an m4a (about 0.25 MB a minute) once Whisper has run on it, and returns the
// new file name; keeps the WAV and returns null if the encode fails or isn't
// smaller. Playback and "Write it out again" decode either format.
export async function compressRewindAudio(id: string, wavName: string): Promise<string | null> {
  const wav = new File(rewindsDirectory(), wavName);
  if (!wav.exists || !wavName.endsWith(".wav")) return null;
  let outUri: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Audio } = require("react-native-compressor") as AudioCompressor;
    const result = await Audio.compress(wav.uri, { bitrate: 32000, samplerate: 16000, channels: 1 });
    outUri = result.startsWith("file://") ? result : `file://${result}`;
    const out = new File(outUri);
    const before = wav.size ?? 0;
    const after = out.exists ? (out.size ?? 0) : 0;
    if (after <= 0 || after >= before) return null;
    const fileName = `${id}.m4a`;
    const dest = new File(rewindsDirectory(), fileName);
    if (dest.exists) dest.delete();
    out.moveSync(dest);
    outUri = null;
    return fileName;
  } catch {
    return null;
  } finally {
    if (outUri) {
      try {
        const leftover = new File(outUri);
        if (leftover.exists) leftover.delete();
      } catch {
        // Launch cleanup sweeps the cache.
      }
    }
  }
}
