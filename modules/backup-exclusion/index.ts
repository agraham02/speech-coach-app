import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

// JS side of the BackupExclusion module (ios/BackupExclusionModule.swift).
// iOS only: Android's backup rules (expo-secure-store's) are a whitelist of
// shared preferences, so app files are never backed up there. The module is
// missing from builds made before it was added, so every call degrades to
// "unknown" instead of throwing.

interface BackupExclusionNative {
  setExcluded(path: string, excluded: boolean): boolean;
  isExcluded(path: string): boolean | null;
}

function native(): BackupExclusionNative | null {
  if (Platform.OS !== "ios") return null;
  try {
    return requireOptionalNativeModule<BackupExclusionNative>("BackupExclusion");
  } catch {
    return null;
  }
}

// Keeps a file or folder (a file:// URI or a path) out of iCloud and device
// backups. True when the system confirms the flag; false when it could not be
// set; null when this build has no way to (Android, or an older iOS build).
export function excludeFromBackup(path: string): boolean | null {
  const module = native();
  if (!module) return null;
  try {
    return module.setExcluded(path, true);
  } catch {
    return false;
  }
}

// What the system reports for the path: true, false, or null if unknown.
export function isExcludedFromBackup(path: string): boolean | null {
  const module = native();
  if (!module) return null;
  try {
    return module.isExcluded(path);
  } catch {
    return null;
  }
}
