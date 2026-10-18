import { Paths } from "expo-file-system";

// Free space on the phone in bytes, or null when the system doesn't say.
export function freeDiskBytes(): number | null {
  try {
    const free = Paths.availableDiskSpace;
    return typeof free === "number" && free > 0 ? free : null;
  } catch {
    return null;
  }
}
