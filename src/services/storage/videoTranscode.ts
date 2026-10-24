import { File } from "expo-file-system";
import { logger } from "../../utils/logger";

// Smaller copies of a take's video (react-native-compressor, already in the
// app for keepsakes; no new native code). Decided 2026-10-23 (session 06):
// - once a take has been analysed, its stored video is replaced by a 720p
//   playback copy (services/data/videoShrink.ts);
// - a deep review uploads a 720p copy at about 1 Mb/s instead of the
//   original (about 15 Mb/s at 1080p): Gemini samples video at 1 frame a
//   second and audio at about 1 kb/s, so the model gets the same input
//   with 10 to 15 times less to upload.
// The audio track stays in every copy (it's the take's only audio), so
// voice analysis can be re-run from a shrunk take.

export interface VideoProfile {
  maxSize: number;
  bitrate: number;
}

// Kept on the phone for playback and re-analysis: about 15 MB a minute.
export const PLAYBACK_PROFILE: VideoProfile = { maxSize: 720, bitrate: 2_000_000 };
// Sent for a deep review: about 7.5 MB a minute.
export const REVIEW_UPLOAD_PROFILE: VideoProfile = { maxSize: 720, bitrate: 1_000_000 };
// Older keepsakes, compressed past the retention cutoff.
export const KEEPSAKE_PROFILE: VideoProfile = { maxSize: 720, bitrate: 1_500_000 };

type Compressor = { Video: { compress: (uri: string, options: Record<string, unknown>) => Promise<string> } };

// Writes a compressed copy and returns its file:// URI. Throws on failure.
export async function compressCopy(uri: string, profile: VideoProfile): Promise<string> {
  // Required lazily, so code that only imports this module in tests never
  // loads the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Video } = require("react-native-compressor") as Compressor;
  const result = await Video.compress(uri, { compressionMethod: "manual", maxSize: profile.maxSize, bitrate: profile.bitrate });
  return result.startsWith("file://") ? result : `file://${result}`;
}

// Replaces the file with a compressed copy — only if it actually came out
// smaller (a short or already-small take can grow when re-encoded). Returns
// whether it was replaced.
export async function compressInPlace(uri: string, profile: VideoProfile): Promise<boolean> {
  const original = new File(uri);
  if (!original.exists) return false;
  const before = original.size ?? 0;
  const compressedUri = await compressCopy(uri, profile);
  try {
    return swapIfSmaller(uri, original, before, new File(compressedUri));
  } finally {
    // Whatever happened, the compressor's copy doesn't stay behind. (A fresh
    // handle on its old path: a File that was moved now points at the take.)
    const leftover = new File(compressedUri);
    if (leftover.uri !== new File(uri).uri && leftover.exists) leftover.delete();
  }
}

function swapIfSmaller(uri: string, original: File, before: number, compressed: File): boolean {
  const after = compressed.exists ? (compressed.size ?? 0) : 0;
  if (after > 0 && after < before) {
    // Swap via a backup so a failure midway never loses the take. (A stray
    // backup is unreferenced, so launch cleanup removes it.)
    const backup = new File(`${uri}.bak`);
    if (backup.exists) backup.delete();
    original.moveSync(backup);
    try {
      compressed.moveSync(new File(uri));
      backup.delete();
      logger.info(`[video] compressed ${Math.round(before / 1048576)} MB → ${Math.round(after / 1048576)} MB`);
      return true;
    } catch (error) {
      backup.moveSync(new File(uri));
      throw error;
    }
  }
  if (compressed.exists) compressed.delete();
  return false;
}

// A smaller copy to upload for a deep review, and how to clean it up. Falls
// back to the original when the copy fails or wouldn't be smaller.
export async function reviewUploadCopy(uri: string): Promise<{ uri: string; cleanup: () => void }> {
  const keep = { uri, cleanup: () => undefined };
  try {
    const before = new File(uri).size ?? 0;
    const started = Date.now();
    const copyUri = await compressCopy(uri, REVIEW_UPLOAD_PROFILE);
    const copy = new File(copyUri);
    const after = copy.exists ? (copy.size ?? 0) : 0;
    if (after <= 0 || after >= before) {
      if (copy.exists && copy.uri !== new File(uri).uri) copy.delete();
      return keep;
    }
    logger.info(`[video] review copy ${Math.round(before / 1048576)} MB → ${Math.round(after / 1048576)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return {
      uri: copyUri,
      cleanup: () => {
        try {
          const f = new File(copyUri);
          if (f.exists) f.delete();
        } catch {
          // Launch cleanup sweeps old cache media anyway.
        }
      },
    };
  } catch (error) {
    logger.warn(`[video] review copy failed, uploading the original: ${(error as Error).message}`);
    return keep;
  }
}
