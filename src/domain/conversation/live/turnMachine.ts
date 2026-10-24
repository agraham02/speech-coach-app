import type { TurnMeasurement } from "../evaluateConversation";
import { endpointDecision, lastWordOf, wordCountOf, type EndReason, type ListenProgress } from "./endpoint";
import type { LiveSetup } from "./prepareLive";

// The turn-taking state machine for a live conversation. Pure: a reducer
// over events, so every path (blanks, rambling, interruptions, failures) is
// tested without a phone. The hook (hooks/useLiveConversation.ts) turns its
// phases into effects: ask the server for the partner's line, play it, open
// and close the mic.
//
//   idle ─START─▶ opening ─LINE─▶ partner ─AUDIO_END/SKIP─▶ gap ─TICK─▶ listening
//                                    ▲                                    │ (endpoint / DONE)
//                                    │                                    ▼
//                                    └──────────LINE──── thinking ◀─CAPTURED─ capturing
//
// - Strictly turn-based: the mic is closed while the partner speaks, and opens
//   a moment after the partner's last word (no echo cancellation needed, and
//   the recording session stays in its full-quality measurement mode).
// - The person can tap to cut the partner short (SKIP): the only barge-in.
// - A blank is a turn like any other: the partner carries on, the way a kind
//   person would. Three blanks in a row end the conversation (most likely the
//   mic isn't hearing them).
// - The partner's closing line comes after the last reply (or when time is
//   up); the conversation ends when it has been said.

export type Phase = "idle" | "opening" | "partner" | "gap" | "listening" | "capturing" | "thinking" | "paused" | "failed" | "finished";

export type Safety = "ok" | "redirect" | "crisis";

export interface PartnerLine {
  text: string;
  ended: boolean;
  safety: Safety;
  mood?: string;
}

export interface TurnReply {
  listenStartAt: number;
  endedAt: number;
  endReason: EndReason;
  // Set once the recognizer has handed over the final words.
  measurement: TurnMeasurement | null;
}

export interface LiveTurn {
  partner: PartnerLine;
  partnerStartedAt: number | null;
  partnerEndedAt: number | null;
  // Cut short by a tap.
  partnerSkipped: boolean;
  reply: TurnReply | null;
}

export type FailReason = "offline" | "quota" | "cost_cap" | "not_entitled" | "kill_switch" | "error";

export type EndedBy = "partner" | "you" | "blanks" | "safety" | "failure";

export interface LiveState {
  phase: Phase;
  turns: LiveTurn[];
  startedAt: number | null;
  gapUntil: number | null;
  listen: ListenProgress | null;
  pausedFrom: Phase | null;
  failure: { reason: FailReason; retryable: boolean; message?: string } | null;
  endedBy: EndedBy | null;
  blanksInARow: number;
}

export type LiveEvent =
  | { type: "START"; now: number }
  | { type: "LINE"; line: PartnerLine; now: number }
  | { type: "AUDIO_START"; now: number }
  | { type: "AUDIO_END"; now: number }
  | { type: "SKIP"; now: number }
  | { type: "TICK"; now: number }
  // Recognized words so far in this reply, and when (lag already taken off).
  | { type: "HEARD"; transcript: string; at: number }
  // A volume reading loud enough to be voice.
  | { type: "VOICE"; at: number }
  | { type: "DONE"; now: number }
  | { type: "CAPTURED"; measurement: TurnMeasurement }
  | { type: "FAILED"; reason: FailReason; retryable: boolean; message?: string }
  | { type: "RETRY"; now: number }
  | { type: "INTERRUPT"; now: number }
  | { type: "RESUME"; now: number }
  | { type: "END"; now: number }
  // Back to the start, for another conversation.
  | { type: "RESET" };

export const BLANKS_TO_END = 3;

export function initialLiveState(): LiveState {
  return { phase: "idle", turns: [], startedAt: null, gapUntil: null, listen: null, pausedFrom: null, failure: null, endedBy: null, blanksInARow: 0 };
}

const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];

function replaceLast(turns: LiveTurn[], patch: (t: LiveTurn) => LiveTurn): LiveTurn[] {
  if (!turns.length) return turns;
  return [...turns.slice(0, -1), patch(turns[turns.length - 1])];
}

// Replies made so far (blank ones included: they were turns).
export function repliesSoFar(state: LiveState): number {
  return state.turns.filter((t) => t.reply?.measurement).length;
}

// Partner lines still to come after the next one. 0: the next line closes.
export function turnsLeftAfterNext(state: LiveState, setup: Pick<LiveSetup, "maxReplies" | "maxConversationMs">, now: number): number {
  if (state.startedAt != null && now - state.startedAt >= setup.maxConversationMs) return 0;
  return Math.max(0, setup.maxReplies - repliesSoFar(state));
}

// After the partner's line: does the conversation go on to a reply?
function afterPartner(state: LiveState, setup: Pick<LiveSetup, "maxReplies" | "timing">, now: number, skipped: boolean): LiveState {
  const turn = last(state.turns);
  if (!turn) return state;
  const turns = replaceLast(state.turns, (t) => ({ ...t, partnerEndedAt: now, partnerSkipped: skipped, partnerStartedAt: t.partnerStartedAt ?? now }));
  const closing = turn.partner.ended || turn.partner.safety === "crisis" || repliesSoFar(state) >= setup.maxReplies;
  if (closing) return { ...state, turns, phase: "finished", endedBy: turn.partner.safety === "crisis" ? "safety" : "partner", gapUntil: null };
  return { ...state, turns, phase: "gap", gapUntil: now + setup.timing.micOpenDelayMs };
}

function startListening(state: LiveState, now: number): LiveState {
  return {
    ...state,
    phase: "listening",
    gapUntil: null,
    listen: { startedAt: now, lastVoiceAt: null, words: 0, lastWord: null },
    turns: replaceLast(state.turns, (t) => ({ ...t, reply: null })),
  };
}

function endReply(state: LiveState, now: number, endReason: EndReason): LiveState {
  if (!state.listen) return state;
  const reply: TurnReply = { listenStartAt: state.listen.startedAt, endedAt: now, endReason, measurement: null };
  return { ...state, phase: "capturing", turns: replaceLast(state.turns, (t) => ({ ...t, reply })) };
}

export function liveReducer(setup: Pick<LiveSetup, "maxReplies" | "maxConversationMs" | "timing">, state: LiveState, event: LiveEvent): LiveState {
  if (event.type === "RESET") return initialLiveState();
  if (state.phase === "finished") return state;

  switch (event.type) {
    case "START":
      if (state.phase !== "idle") return state;
      return { ...initialLiveState(), phase: "opening", startedAt: event.now };

    case "LINE": {
      if (state.phase !== "opening" && state.phase !== "thinking") return state;
      const turn: LiveTurn = { partner: event.line, partnerStartedAt: null, partnerEndedAt: null, partnerSkipped: false, reply: null };
      return { ...state, phase: "partner", failure: null, turns: [...state.turns, turn] };
    }

    case "AUDIO_START":
      if (state.phase !== "partner") return state;
      return { ...state, turns: replaceLast(state.turns, (t) => ({ ...t, partnerStartedAt: t.partnerStartedAt ?? event.now })) };

    case "AUDIO_END":
      if (state.phase !== "partner") return state;
      return afterPartner(state, setup, event.now, false);

    case "SKIP":
      if (state.phase !== "partner") return state;
      return afterPartner(state, setup, event.now, true);

    case "TICK": {
      if (state.phase === "gap" && state.gapUntil != null && event.now >= state.gapUntil) return startListening(state, event.now);
      if (state.phase === "listening" && state.listen) {
        const decision = endpointDecision(state.listen, event.now, setup.timing);
        return decision ? endReply(state, event.now, decision) : state;
      }
      return state;
    }

    case "HEARD": {
      if (state.phase !== "listening" || !state.listen) return state;
      const words = wordCountOf(event.transcript);
      // A recognizer update with words in it means speech was still being heard.
      const voiced = words > 0 ? Math.max(state.listen.lastVoiceAt ?? 0, event.at) : state.listen.lastVoiceAt;
      return { ...state, listen: { ...state.listen, words, lastWord: lastWordOf(event.transcript), lastVoiceAt: voiced } };
    }

    case "VOICE": {
      if (state.phase !== "listening" || !state.listen) return state;
      return { ...state, listen: { ...state.listen, lastVoiceAt: Math.max(state.listen.lastVoiceAt ?? 0, event.at) } };
    }

    case "DONE":
      if (state.phase !== "listening") return state;
      return endReply(state, event.now, "tap");

    case "CAPTURED": {
      if (state.phase !== "capturing") return state;
      const blank = wordCountOf(event.measurement.transcript) === 0;
      const turns = replaceLast(state.turns, (t) => (t.reply ? { ...t, reply: { ...t.reply, measurement: event.measurement } } : t));
      const blanksInARow = blank ? state.blanksInARow + 1 : 0;
      const next = { ...state, turns, listen: null, blanksInARow };
      if (blanksInARow >= BLANKS_TO_END) return { ...next, phase: "finished", endedBy: "blanks" };
      return { ...next, phase: "thinking" };
    }

    case "FAILED":
      if (state.phase !== "opening" && state.phase !== "thinking") return state;
      return { ...state, phase: "failed", failure: { reason: event.reason, retryable: event.retryable, ...(event.message ? { message: event.message } : {}) } };

    case "RETRY":
      if (state.phase !== "failed" || !state.failure?.retryable) return state;
      return { ...state, phase: state.turns.length ? "thinking" : "opening", failure: null };

    case "INTERRUPT":
      if (state.phase === "idle" || state.phase === "paused" || state.phase === "failed") return state;
      return { ...state, pausedFrom: state.phase, phase: "paused", gapUntil: null };

    case "RESUME": {
      if (state.phase !== "paused" || !state.pausedFrom) return state;
      const from = state.pausedFrom;
      const resumed = { ...state, pausedFrom: null };
      // A partner line or a reply that was cut by the interruption starts
      // the reply again; the line stays on screen. A request in flight is
      // simply asked again.
      if (from === "partner" || from === "gap" || from === "listening" || from === "capturing") {
        const turns = replaceLast(state.turns, (t) => ({ ...t, partnerEndedAt: t.partnerEndedAt ?? event.now, reply: null }));
        return { ...resumed, turns, listen: null, phase: "gap", gapUntil: event.now + setup.timing.micOpenDelayMs };
      }
      return { ...resumed, phase: from };
    }

    case "END":
      if (state.phase === "idle") return state;
      return { ...state, phase: "finished", endedBy: state.phase === "failed" ? "failure" : "you", listen: null, gapUntil: null };
  }
}

// The conversation so far as the server reads it: oldest first, the
// partner's lines and the person's replies (a blank or a cut-off flagged).
export interface HistoryItem {
  who: "partner" | "you";
  text: string;
  blank?: boolean;
  cutOff?: boolean;
}

export function historyOf(state: LiveState): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const t of state.turns) {
    out.push({ who: "partner", text: t.partner.text });
    const m = t.reply?.measurement;
    if (!m) continue;
    const text = m.transcript.trim();
    out.push({ who: "you", text, ...(text ? {} : { blank: true }), ...(t.reply?.endReason === "cap" ? { cutOff: true } : {}) });
  }
  return out;
}

// Turns with a finished reply, for scoring and the debrief.
export function completedTurns(state: LiveState): (LiveTurn & { reply: TurnReply & { measurement: TurnMeasurement } })[] {
  return state.turns.filter((t): t is LiveTurn & { reply: TurnReply & { measurement: TurnMeasurement } } => !!t.reply?.measurement);
}

// With no voice (the speech failed, or the phone is muted and the person
// chose text), how long to leave the partner's words on screen before the
// mic opens: about reading speed, within sensible bounds.
export function readingDelayMs(text: string): number {
  const words = wordCountOf(text);
  return Math.round(Math.min(6000, Math.max(1200, (words / 3.3) * 1000)));
}
