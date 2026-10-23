import {
  deleteSessionVideo,
  eraseSessionRows,
  listPendingDeletedSessions,
  markSessionDeleted,
  restoreSession,
  sweepOrphanedSessionRows,
  updateSessionGeminiFile,
  type PendingDeletedSession,
} from "../db/sessionsRepo";
import { eraseRewindRow, listPendingDeletedRewinds, markRewindDeleted, restoreRewind, updateRewind } from "../db/rewindRepo";
import { deleteExportCopies, deleteRecording, resolveVideoUri } from "../storage/videoStorage";
import { deleteRewindAudio } from "../rewind/rewindStorage";
import { syncRewindReminder } from "../rewind/rewindReminder";
import { clearDecodedAudio } from "../pipeline/steps/decodedAudioCache";
import { forgetTakeInDevStore } from "../dev/devStore";
import { tonoDeleteFile } from "../tono/tonoApi";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { logger } from "../../utils/logger";

// Delete means delete. Deleting a take (a recording in the Library, or a
// Rewind) erases everything about it: the video or audio, the transcript and
// word timings, the analysis and review, the scores, its rating history, and
// the row itself. The only thing that stays is a bare date marker for the
// streak (db/practiceDaysRepo.ts), which has no link to the take.
//
// There is a short undo. Confirming hides the take everywhere at once (its
// row gets deleted_at, which every query skips, so nothing computed in the
// meantime counts it) and starts a timer. The erase itself runs when the
// timer ends, when the app goes to the background, or at the next launch if
// the app was killed in the window (dataPurge.ts). Until then the data is
// still on the phone; that is what makes undo possible.
//
// Where a take's data can live, and what removes it:
//   sessions row + scores, session_steps, session_artifacts, review_passes,
//     skill_events, skill_checks built on it ........ eraseSessionRows
//   the video file (also the audio, and a keepsake) ... deleteRecording
//   its uploaded copy at Google (Tono AI server) ...... tonoDeleteFile
//   decoded-audio memory, exported copies in the cache,
//     the Dev tab's typed reference and run history ... below
//   a Rewind row + its WAV ............................ eraseRewindRow, deleteRewindAudio
// A Plus cloud backup of the database or media does not exist yet. When it is
// added, a delete must remove the backed-up copy too (supabase `backups`
// table; docs/testing/device-test-plan.md, "Delete means delete").

export type TakeKind = "session" | "rewind";

export const UNDO_WINDOW_MS = 8000;
// A little longer than the toast, so a tap at the last moment still lands.
const ERASE_DELAY_MS = UNDO_WINDOW_MS + 500;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const timerKey = (kind: TakeKind, id: string) => `${kind}:${id}`;

// Screens that list takes refresh when one is deleted, restored or erased.
const listeners = new Set<() => void>();
export function subscribeToTakeChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const announce = () => listeners.forEach((l) => l());

// Erasing runs one at a time (the timer, the background and launch can all ask).
let queue: Promise<unknown> = Promise.resolve();
function serially<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

// Hides the take and starts the undo window. Resolves false when there is no
// such take. Nothing is erased yet.
export async function deleteTake(kind: TakeKind, id: string): Promise<boolean> {
  const marked = kind === "session" ? await markSessionDeleted(id) : await markRewindDeleted(id);
  if (!marked) return false;
  const key = timerKey(kind, id);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      eraseOne(kind, id).catch((error) => logger.error(`[delete] erase failed - ${(error as Error).message}`));
    }, ERASE_DELAY_MS),
  );
  if (kind === "rewind") syncRewindReminder().catch(() => undefined);
  announce();
  return true;
}

// Undo, inside the window. False when it's too late (already erased).
export async function undoDeleteTake(kind: TakeKind, id: string): Promise<boolean> {
  const key = timerKey(kind, id);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  const restored = await serially(() => (kind === "session" ? restoreSession(id) : restoreRewind(id)));
  if (restored && kind === "rewind") syncRewindReminder().catch(() => undefined);
  announce();
  return restored;
}

// Delete, then offer "Deleted · Undo" for the length of the window. The one
// call every Delete button makes.
export async function deleteTakeWithUndo(kind: TakeKind, id: string): Promise<boolean> {
  const deleted = await deleteTake(kind, id);
  if (!deleted) return false;
  showGlobalToast(
    kind === "rewind" ? "Rewind deleted" : "Deleted",
    "success",
    () => {
      undoDeleteTake(kind, id)
        .then((restored) => (restored ? showGlobalToast("Restored", "success") : showGlobalToast("Too late to undo that", "error")))
        .catch(() => showGlobalToast("Couldn't undo that", "error"));
    },
    { durationMs: UNDO_WINDOW_MS, actionLabel: "Undo", exclusive: true },
  );
  return true;
}

async function eraseOne(kind: TakeKind, id: string): Promise<void> {
  await serially(async () => {
    if (kind === "session") for (const s of await listPendingDeletedSessions(id)) await eraseSession(s);
    else for (const r of await listPendingDeletedRewinds(id)) await eraseRewind(r);
  });
  announce();
}

// Erases every take whose delete is pending: at launch, and whenever the app
// goes to the background. Also removes rows a late step wrote for a take that
// was already gone. Returns how many takes were erased.
export function finishPendingDeletes(): Promise<number> {
  return serially(async () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    let erased = 0;
    for (const s of await listPendingDeletedSessions()) {
      await eraseSession(s);
      erased++;
    }
    for (const r of await listPendingDeletedRewinds()) {
      await eraseRewind(r);
      erased++;
    }
    const orphans = await sweepOrphanedSessionRows();
    if (orphans) logger.info(`[delete] removed ${orphans} leftover row(s) of takes that were already gone`);
    if (erased) announce();
    return erased;
  });
}

async function eraseSession(s: PendingDeletedSession): Promise<void> {
  try {
    // The phone's data first: once the rows are gone nothing about the take
    // can be read back.
    await eraseSessionRows(s.id);
    deleteRecording(resolveVideoUri(s));
    clearDecodedAudio();
    deleteExportCopies();
    forgetTakeInDevStore(s.id);
    await removeRemoteCopy(s.geminiFileName);
    logger.info(`[delete] erased take ${s.id}`);
  } catch (error) {
    logger.error(`[delete] couldn't fully erase take ${s.id} - ${(error as Error).message}`);
  }
}

async function eraseRewind(r: { id: string; audioFile: string | null }): Promise<void> {
  try {
    await eraseRewindRow(r.id);
    deleteRewindAudio(r.audioFile);
    deleteExportCopies();
    logger.info(`[delete] erased Rewind ${r.id}`);
  } catch (error) {
    logger.error(`[delete] couldn't fully erase Rewind ${r.id} - ${(error as Error).message}`);
  }
}

// The video a deep review uploaded. The Tono AI server removes it right after
// a successful review; this covers a take deleted before that, or after a
// failed review (which keeps it for a retry). Google deletes any file after
// 48 hours by itself, so a failure here (offline, signed out, or an upload
// made with the person's own key) is only logged.
async function removeRemoteCopy(fileName: string | null): Promise<void> {
  if (!fileName) return;
  try {
    await tonoDeleteFile(fileName);
  } catch (error) {
    logger.info(`[delete] couldn't remove the uploaded copy now (${(error as Error).message}); it expires on its own`);
  }
}

// "Free up space": deletes only the video (and the audio inside it) and keeps
// the take's transcript, scores and progress. Also drops the copy uploaded for
// a deep review. A deep review of the take isn't possible afterwards. Used by
// the Library, the Result screen and the old-video cleanup.
export async function freeUpSessionVideo(session: { id: string; videoFile: string | null; videoPath: string; geminiFileName?: string | null }): Promise<void> {
  await deleteSessionVideo(session.id);
  deleteRecording(resolveVideoUri(session));
  clearDecodedAudio();
  if (session.geminiFileName) {
    await updateSessionGeminiFile(session.id, null);
    await removeRemoteCopy(session.geminiFileName);
  }
}

// The same for a Rewind: the recording goes, the words and notes stay.
export async function freeUpRewindAudio(rewind: { id: string; audioFile: string | null }): Promise<void> {
  await updateRewind(rewind.id, { audioFile: null });
  deleteRewindAudio(rewind.audioFile);
}
