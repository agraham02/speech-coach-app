import { Alert } from "react-native";
import { deleteRewind, type Rewind } from "../../services/db/rewindRepo";
import { deleteRewindAudio } from "../../services/rewind/rewindStorage";
import { syncRewindReminder } from "../../services/rewind/rewindReminder";
import { stopClip } from "../../services/audio/clipPlayer";

// Asks, then deletes a Rewind: the row's words now (the row itself is purged
// later), the audio file, and tonight's reminder is worked out again. From
// the Rewind result and from a long press in the Library.
export function confirmDeleteRewind(rewind: Pick<Rewind, "id" | "audioFile">, onDeleted: () => void, onFailed?: () => void): void {
  Alert.alert("Delete this Rewind?", "The recording, transcript and notes are removed from your phone.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: async () => {
        stopClip();
        try {
          await deleteRewind(rewind.id);
        } catch {
          onFailed?.();
          return;
        }
        deleteRewindAudio(rewind.audioFile);
        syncRewindReminder().catch(() => undefined);
        onDeleted();
      },
    },
  ]);
}
