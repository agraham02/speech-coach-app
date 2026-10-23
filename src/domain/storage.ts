// How much free space the app wants before it writes something big, and how
// it says so. Pure: callers pass the free space (Paths.availableDiskSpace).

const MB = 1_000_000;

// Room to leave after a download, so the phone isn't left at zero.
export const DOWNLOAD_HEADROOM = 200 * MB;
// Below this, a recording might not finish: warn before starting.
export const RECORDING_MIN_FREE = 500 * MB;
// Re-encoding a keepsake writes a second copy before the swap.
export const KEEPSAKE_MIN_FREE = 200 * MB;
// Compact the database once this much of it is free pages.
export const VACUUM_FREE_BYTES = 5 * MB;

// "1.2 GB", "350 MB".
export function formatSpace(bytes: number): string {
  if (bytes >= 1000 * MB) return `${(bytes / (1000 * MB)).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / MB))} MB`;
}

// How much more needs to be free for a download of `size` bytes; 0 when
// there's room. Unknown free space never blocks.
export function shortfallForDownload(free: number | null, size: number): number {
  if (free == null) return 0;
  return Math.max(0, size + DOWNLOAD_HEADROOM - free);
}

export function downloadSpaceMessage(shortfall: number): string {
  return `Not enough space on your phone. Free up about ${formatSpace(shortfall)} and try again.`;
}

export function lowForRecording(free: number | null): boolean {
  return free != null && free < RECORDING_MIN_FREE;
}

export function recordingSpaceMessage(free: number): string {
  return `Your phone has ${formatSpace(free)} free. A recording might stop early. Free up some space, or clear old videos in Settings.`;
}
