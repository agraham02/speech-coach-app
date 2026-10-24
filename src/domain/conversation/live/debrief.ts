import { quoteIn, snapToSource, wordsOf } from "../../analysis/quotes";
import type { LiveDetails } from "./evaluateLive";
import type { LiveFocus } from "./prepareLive";

// The short debrief after a live conversation: a few moments where the person
// made a move, one strength, one thing to try next. Tono AI writes it (the
// `conversation_debrief` task on the server); the phone checks it; the rules
// below write one from the phone's own counts when there is no judge. Pure.
//
// Process only, like every Conversation result: moves, never quality. The
// phone enforces that too: every quote must be the person's own words from
// that turn, and a note that grades ("great", "clever", scores, numbers out
// of ten) is dropped.

export const DEBRIEF_MOVES = ["asked_about_them", "used_their_words", "shared_something", "handed_back", "landed", "went_long", "came_back", "reacted"] as const;
export type DebriefMove = (typeof DEBRIEF_MOVES)[number];

export const MOVE_LABELS: Record<DebriefMove, string> = {
  asked_about_them: "Asked about them",
  used_their_words: "Used their words",
  shared_something: "Shared something",
  handed_back: "Handed it back",
  landed: "Made the point, then stopped",
  went_long: "Kept going past the point",
  came_back: "Came back in after a pause",
  reacted: "Reacted",
};

export interface DebriefMoment {
  // 1-based, as shown.
  turn: number;
  move: DebriefMove;
  quote: string;
}

export interface LiveDebrief {
  moments: DebriefMoment[];
  strength: string;
  tryNext: string;
}

export const MAX_MOMENTS = 6;
const MAX_QUOTE_WORDS = 20;
const MAX_NOTE_CHARS = 280;

// Grading words and scores: a debrief that uses them is judging quality.
const GRADING = /\b(\d+\s*(\/|out of)\s*10|\d+\s*%|score|scored|grade|rating|brilliant|clever|witty|hilarious|perfect|excellent|terrible|bad answer|good answer|great answer|well done)\b/i;

function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_NOTE_CHARS || GRADING.test(text)) return null;
  return text;
}

// Tono AI's debrief, checked against what was said. `replies[i]` is the
// person's reply in turn i + 1 ("" for a blank). Null when what's left isn't
// worth showing (no usable strength and try-next).
export function acceptDebrief(raw: unknown, replies: string[]): LiveDebrief | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { moments?: unknown; strength?: unknown; tryNext?: unknown };
  const strength = cleanNote(o.strength);
  const tryNext = cleanNote(o.tryNext);
  if (!strength || !tryNext) return null;
  const moments: DebriefMoment[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(o.moments) ? o.moments : []) {
    if (!m || typeof m !== "object") continue;
    const { turn, move, quote } = m as { turn?: unknown; move?: unknown; quote?: unknown };
    if (typeof turn !== "number" || !Number.isInteger(turn) || turn < 1 || turn > replies.length) continue;
    if (typeof move !== "string" || !(DEBRIEF_MOVES as readonly string[]).includes(move)) continue;
    const reply = replies[turn - 1];
    if (!reply?.trim() || typeof quote !== "string") continue;
    // Their exact words, or the nearest run of them; nothing else is shown.
    const words = wordsOf(quote);
    if (!words.length || words.length > MAX_QUOTE_WORDS) continue;
    const exact = quoteIn(quote, reply) ? quote.trim() : snapToSource(quote, reply);
    if (!exact) continue;
    const key = `${turn}:${move}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moments.push({ turn, move: move as DebriefMove, quote: exact.replace(/^["“]|["”]$/g, "") });
    if (moments.length >= MAX_MOMENTS) break;
  }
  return { moments, strength, tryNext };
}

const TRY_NEXT: Record<LiveFocus, string> = {
  reply: "Next time, say the first real thing that comes to mind. Plain is fine.",
  beat: "Next time, let one easy breath out before each reply.",
  thread: "Next time, grab one word from the last thing they said and ask about it.",
  echo: "Next time, start a reply by echoing two of their words.",
  hold: "Next time, keep just one word in mind while they talk, then ask about it.",
  outsider: "Next time, ask how one part of their work actually works.",
  land: "Next time, say your point in the first sentence, then stop.",
  react: "Next time, react first (a laugh, a 'no way'), then ask one thing.",
  open: "Next time, start with something plain about the moment, then ask a question.",
  exit: "Next time, end it yourself: something you liked, a reason, goodbye.",
};

// The phone's own debrief, from its counts, when Tono AI isn't there.
export function rulesDebrief(details: LiveDetails, replies: string[]): LiveDebrief {
  const moments: DebriefMoment[] = [];
  details.turns.forEach((t, i) => {
    const reply = replies[i] ?? "";
    if (!t.replied || !reply.trim() || moments.length >= MAX_MOMENTS) return;
    const first = reply.trim().split(/\s+/).slice(0, 12).join(" ");
    if (t.cameBack) moments.push({ turn: i + 1, move: "came_back", quote: first });
    else if (t.picked?.length) moments.push({ turn: i + 1, move: "used_their_words", quote: first });
    else if (t.asked) moments.push({ turn: i + 1, move: "asked_about_them", quote: first });
    else if (t.handedBack) moments.push({ turn: i + 1, move: "handed_back", quote: first });
  });
  const asked = details.turns.filter((t) => t.asked).length;
  const picked = details.turns.filter((t) => t.picked?.length).length;
  const cameBack = details.turns.some((t) => t.cameBack);
  const strength = cameBack
    ? "After a pause you came back in, which is the skill this practices."
    : picked
      ? `You picked up their words in ${picked} ${picked === 1 ? "reply" : "replies"}.`
      : asked
        ? `You asked about them in ${asked} ${asked === 1 ? "reply" : "replies"}.`
        : details.replies
          ? `You kept the conversation going for ${details.replies} ${details.replies === 1 ? "turn" : "turns"}.`
          : "You showed up for it, which is the practice.";
  return { moments, strength, tryNext: TRY_NEXT[details.focus] };
}
