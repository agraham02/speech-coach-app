import { Alert } from "react-native";
import type { Rewind } from "../../services/db/rewindRepo";
import { deleteTakeWithUndo, freeUpRewindAudio } from "../../services/data/takeDeletion";
import { stopClip } from "../../services/audio/clipPlayer";

// Two clear choices for a Rewind. "Delete" erases the whole take: the
// recording, transcript, word timings, counts and the coach's notes, with a few
// seconds to undo. "Free up space" deletes only the recording and keeps what you
// said and the notes. From the Rewind result and from a long press in the Library.
export function confirmDeleteRewind(
  rewind: Pick<Rewind, "id" | "audioFile">,
  handlers: { onDeleted: () => void; onFreed?: () => void; onFailed?: () => void },
): void {
  const buttons: Parameters<typeof Alert.alert>[2] = [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete Rewind",
      style: "destructive",
      onPress: async () => {
        stopClip();
        try {
          if (await deleteTakeWithUndo("rewind", rewind.id)) handlers.onDeleted();
          else handlers.onFailed?.();
        } catch {
          handlers.onFailed?.();
        }
      },
    },
  ];
  if (rewind.audioFile) {
    buttons.push({ text: "Free up space, keep the words and notes", onPress: () => confirmFreeUpRewindAudio(rewind, handlers) });
  }
  Alert.alert(
    "Delete this Rewind?",
    "The recording, the words and the notes are erased from your phone for good. Your streak keeps the day. You can undo for a few seconds.",
    buttons,
  );
}

function confirmFreeUpRewindAudio(
  rewind: Pick<Rewind, "id" | "audioFile">,
  handlers: { onFreed?: () => void; onFailed?: () => void },
): void {
  Alert.alert("Free up space?", "This deletes only the recording. What you said and the notes stay.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Free up space",
      style: "destructive",
      onPress: async () => {
        stopClip();
        try {
          await freeUpRewindAudio(rewind);
          handlers.onFreed?.();
        } catch {
          handlers.onFailed?.();
        }
      },
    },
  ]);
}
