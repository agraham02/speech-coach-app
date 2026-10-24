import { reviewInCloud } from "./rewindReview";
import { updateRewind } from "../db/rewindRepo";
import { producerName } from "../../domain/analysis/provenance";

// Asking for the notes on a Rewind, with its state kept outside the screen: the
// request carries on if the person leaves the result screen, and coming back
// shows it still being written (or why it wasn't). Memory only: the request is
// one short call, so if the app is closed first the button is simply there
// again. Nothing is queued behind the person's back; sending a transcript is
// always their tap.

export type NotesState = { status: "idle" } | { status: "running"; since: number } | { status: "failed"; message: string };

const IDLE: NotesState = { status: "idle" };
const states = new Map<string, NotesState>();
const listeners = new Set<() => void>();

const set = (id: string, state: NotesState) => {
  if (state.status === "idle") states.delete(id);
  else states.set(id, state);
  listeners.forEach((l) => l());
};

export function getNotesState(id: string): NotesState {
  return states.get(id) ?? IDLE;
}

export function subscribeNotes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Resolves when the request has ended (notes saved, declined or failed).
export async function requestNotes(rewind: { id: string; transcript: string }, openSettings: () => void): Promise<void> {
  if (states.get(rewind.id)?.status === "running") return;
  set(rewind.id, { status: "running", since: Date.now() });
  try {
    const result = await reviewInCloud(rewind.transcript, openSettings);
    if (result.ok) {
      await updateRewind(rewind.id, { review: result.review, reviewSource: producerName(result.provenance) });
      set(rewind.id, IDLE);
    } else if (result.message) {
      set(rewind.id, { status: "failed", message: result.message });
    } else {
      // The person said no to the consent question.
      set(rewind.id, IDLE);
    }
  } catch (error) {
    set(rewind.id, { status: "failed", message: (error as Error).message || "Couldn't get notes right now. Try again in a moment." });
  }
}
