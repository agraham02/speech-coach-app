import ExpoModulesCore

// Marks a file or folder as excluded from iCloud and device backups. Apple's
// rule (QA1719): the flag on a folder covers everything inside it, and it is
// the way to keep large re-downloadable data in Documents out of a backup.
// expo-file-system has no API for it.
public class BackupExclusionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackupExclusion")

    // Sets or clears the flag. True when the flag now has the requested value.
    Function("setExcluded") { (path: String, excluded: Bool) -> Bool in
      guard var url = BackupExclusionModule.fileURL(path) else { return false }
      do {
        var values = URLResourceValues()
        values.isExcludedFromBackup = excluded
        try url.setResourceValues(values)
        // Read it back rather than trust the call.
        let stored = try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
        return stored == excluded
      } catch {
        NSLog("BackupExclusion: could not set the flag on %@: %@", path, error.localizedDescription)
        return false
      }
    }

    // The flag as the system reports it; nil when the path does not exist.
    Function("isExcluded") { (path: String) -> Bool? in
      guard let url = BackupExclusionModule.fileURL(path) else { return nil }
      return try? url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
    }
  }

  // Accepts a file:// URI (what expo-file-system hands out) or a plain path.
  private static func fileURL(_ path: String) -> URL? {
    let url: URL
    if path.hasPrefix("file://") {
      guard let parsed = URL(string: path) else { return nil }
      url = parsed
    } else {
      url = URL(fileURLWithPath: path)
    }
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }
}
