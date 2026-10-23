import { Alert } from "react-native";
import type { Session } from "../../domain/sessionTypes";
import { deleteTakeWithUndo, freeUpSessionVideo } from "../../services/data/takeDeletion";

// Two clear choices for a take, from the Library and from the Result screen.
//
// "Delete take" is what plain Delete always means: the video and audio, the
// transcript, the scores, the notes and its rating history are all erased for
// good (with a few seconds to undo). Your streak keeps the day, as a bare date.
//
// "Free up space" is a different thing and is named so it can't be mistaken for
// it: only the video (and its audio) goes, to give the space back. The
// transcript, scores and progress stay. Each dialog says exactly what goes and
// what stays.
export function confirmDeleteTake(
  session: Pick<Session, "id" | "videoFile" | "videoPath" | "videoDeletedAt" | "geminiFileName">,
  handlers: { onDeleted: () => void; onFreed: () => void; onFailed: () => void },
): void {
  const buttons: Parameters<typeof Alert.alert>[2] = [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete take",
      style: "destructive",
      onPress: async () => {
        try {
          if (await deleteTakeWithUndo("session", session.id)) handlers.onDeleted();
          else handlers.onFailed();
        } catch {
          handlers.onFailed();
        }
      },
    },
  ];
  if (!session.videoDeletedAt) {
    buttons.push({ text: "Free up space, keep the transcript and scores", onPress: () => confirmFreeUpSpace(session, handlers) });
  }
  Alert.alert(
    "Delete this take?",
    "The video, audio, transcript, scores and notes are erased from your phone for good, and it no longer counts toward anything. Your streak keeps the day. You can undo for a few seconds.",
    buttons,
  );
}

function confirmFreeUpSpace(
  session: Pick<Session, "id" | "videoFile" | "videoPath" | "geminiFileName">,
  handlers: { onFreed: () => void; onFailed: () => void },
): void {
  Alert.alert(
    "Free up space?",
    "This deletes only the video and its audio. The transcript, scores and progress stay. A deep review of this take won't be possible afterwards.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Free up space",
        style: "destructive",
        onPress: async () => {
          try {
            await freeUpSessionVideo(session);
            handlers.onFreed();
          } catch {
            handlers.onFailed();
          }
        },
      },
    ],
  );
}
