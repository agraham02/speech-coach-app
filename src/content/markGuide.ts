import type { MarkKind } from "../domain/cadence/marks";

// What each delivery mark asks you to do, in plain words — shown under the
// mark legend wherever marked text is read aloud (Line of the day, Mark it
// up, Speeches). Matches how MarkedTextView draws each mark.

export interface MarkMeaning {
  label: string;
  // How the mark looks in the text.
  looks: string;
  meaning: string;
}

export const MARK_MEANINGS: Partial<Record<MarkKind, MarkMeaning>> = {
  emphasis: {
    label: "Stress",
    looks: "Bold, underlined word",
    meaning: "Lean on this word: a little louder, a little longer, a touch higher. It's the word the line is really about.",
  },
  rise: {
    label: "Rise",
    looks: "↗ after a word",
    meaning: "Let your pitch go up on this word. It sounds open, as if there's more coming, or asks a yes/no question.",
  },
  fall: {
    label: "Fall",
    looks: "↘ after a word",
    meaning: "Let your pitch come down on this word. It sounds finished and sure. Most statements end with a fall.",
  },
  pause: {
    label: "Pause",
    looks: "|",
    meaning: "A short beat, about as long as a quick breath. Stop the sound completely, then go on.",
  },
  long_pause: {
    label: "Long pause",
    looks: "‖",
    meaning: "A full stop of two or three seconds. Let the last thing land before you say the next.",
  },
  slow: {
    label: "Slow",
    looks: "s p a c e d  letters",
    meaning: "Slow down through these words and give each one room.",
  },
  fast: {
    label: "Fast",
    looks: "Italic",
    meaning: "Move quickly through these words. They're the setup, not the point.",
  },
  louder: {
    label: "Louder",
    looks: "Bigger text",
    meaning: "More volume here, pushed from your breath, not your throat.",
  },
  softer: {
    label: "Softer",
    looks: "Smaller, lighter text",
    meaning: "Drop your volume and draw the listener in.",
  },
  note: {
    label: "Tone note",
    looks: "Small italic line above a phrase",
    meaning: "How the phrase should feel, such as warm, surprised or matter-of-fact.",
  },
};
