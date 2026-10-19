import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { tapAction, type PermissionKey, type PermissionLine } from "../domain/permissions";
import { openPhoneSettings, readPermissions, requestPermission } from "../services/permissions/permissions";

// What the phone says about each permission now, kept fresh: re-read when the
// app comes back to the front, since the way to change one is the phone's
// Settings app.
export function usePermissions() {
  const [lines, setLines] = useState<PermissionLine[] | null>(null);

  const refresh = useCallback(async () => {
    setLines(await readPermissions());
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Asks while the system will, and opens the phone's Settings once it won't.
  const act = useCallback(
    async (key: PermissionKey) => {
      const line = lines?.find((l) => l.key === key);
      if (line && tapAction(line.state) === "settings") {
        openPhoneSettings();
        return;
      }
      await requestPermission(key);
      await refresh();
    },
    [lines, refresh],
  );

  // Shows every prompt that's still askable, one after the other.
  const askAll = useCallback(async () => {
    for (const line of lines ?? []) {
      if (line.state === "ask") await requestPermission(line.key);
    }
    await refresh();
  }, [lines, refresh]);

  return { lines, refresh, act, askAll };
}
