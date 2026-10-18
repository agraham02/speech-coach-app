import { Directory, Paths } from "expo-file-system";
import { isExcludedFromBackup, setExcludedFromBackup } from "../../../modules/backup-exclusion";
import { getMediaBackup, setMediaBackup } from "../prefs/prefsStore";
import { logger } from "../../utils/logger";

// iOS backups. Videos (sessions/) and Rewind recordings (rewinds/) can run to
// gigabytes, so they stay out of iCloud unless you turn it on in Settings.
// The database (progress, transcripts, streaks) always backs up. The flag is
// set on each folder, which covers every file inside it (Apple QA1719).
// Android never backs up app files (see modules/backup-exclusion).

export const MEDIA_FOLDERS = ["sessions", "rewinds"] as const;

// Applies the current setting to one media folder; called whenever the
// folder is created, so a folder made after a Reset is covered too.
export function flagMediaFolder(dir: Directory): void {
  setExcludedFromBackup(dir.uri, !getMediaBackup());
}

// Applies the setting to every media folder (on launch, and when it changes).
export function applyMediaBackup(): void {
  const exclude = !getMediaBackup();
  for (const name of MEDIA_FOLDERS) {
    try {
      const dir = new Directory(Paths.document, name);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const result = setExcludedFromBackup(dir.uri, exclude);
      if (result === false) logger.warn(`[backup] couldn't set the backup flag on ${name}/`);
    } catch (error) {
      logger.warn(`[backup] ${name}/ — ${(error as Error).message}`);
    }
  }
}

export function setMediaBackupEnabled(enabled: boolean): void {
  setMediaBackup(enabled);
  applyMediaBackup();
}

// For the Dev tab: what the system reports for each folder (null: unknown).
export function mediaBackupStatus(): { folder: string; excluded: boolean | null }[] {
  return MEDIA_FOLDERS.map((name) => ({ folder: name, excluded: isExcludedFromBackup(new Directory(Paths.document, name).uri) }));
}
