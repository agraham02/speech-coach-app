import { ramblingMetrics, type RamblingMetrics } from "../../coach/ramblingMetrics";
import { outcome, type DrillOutcome } from "../../drills/drillSpecs";
import { BEAT_MAX_MS, BEAT_MIN_MS, echoAskAdd, replyTiming, type EchoBeats, type TurnMeasurement } from "../evaluateConversation";
import { countQuestions } from "../questions";
import { contentWords, mentions, words } from "../text";
import type { LiveFocus } from "./prepareLive";
import type { EndedBy } from "./turnMachine";

// Scores a live conversation on PROCESS only, like every Conversation drill
// (domain/conversation/evaluateConversation.ts): did you reply, how soon, did
// you ask, did you use their words, did you hand it back, did you stop. Never
// how good, clever or funny a reply was. Pure.
//
// Blanks are part of the practice, never a fault: a turn with nothing said
// isn't scored, and a conversation where nothing was said isn't recorded at
// all, so freezing can't make anything harder or easier. Coming back in after
// a blank is noted as the skill it is.

export interface LiveTurnInput {
  partnerText: string;
  measurement: TurnMeasurement;
  cutOff: boolean;
  partnerSkipped: boolean;
}

export interface LiveTurnResult {
  replied: boolean;
  blank: boolean;
  words: number;
  latencyMs: number | null;
  speakingSeconds: number | null;
  asked?: boolean;
  picked?: string[];
  handedBack?: boolean;
  beats?: EchoBeats;
  rambling?: RamblingMetrics;
  cutOff: boolean;
  cameBack: boolean;
  // null for a blank: it isn't scored.
  score: number | null;
  // Short, kind, process-only notes.
  notes: string[];
}

export interface LiveDetails {
  live: true;
  focus: LiveFocus;
  turns: LiveTurnResult[];
  replies: number;
  blanks: number;
  endedBy: EndedBy | null;
  // Wall time from the opener to the end.
  seconds: number;
}

// "Land the plane" in conversation: a point, a reason, then stop. About this
// long; past it the reply reads as running on.
export const LAND_BUDGET_SECONDS = 30;

const HAND_BACK = /\b(what about you|how about you|and you|you ever|have you|do you|did you|are you|what do you|how do you)\b/;

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

// Their words worth picking up: content words of four letters or more.
export function threadsOf(partnerText: string): string[] {
  return [...new Set(contentWords(partnerText).filter((w) => w.length >= 4))];
}

function evaluateTurn(focus: LiveFocus, input: LiveTurnInput, previousBlank: boolean): LiveTurnResult {
  const transcript = input.measurement.transcript;
  const count = words(transcript).length;
  const blank = count === 0;
  const { latencyMs, speakingMs } = replyTiming(input.measurement);
  const speakingSeconds = speakingMs == null ? null : Math.round(speakingMs / 100) / 10;
  const base = { words: count, latencyMs, speakingSeconds, cutOff: input.cutOff, blank };
  if (blank) {
    return { ...base, replied: false, cameBack: false, score: null, notes: ["A pause here. They carried on, and so did you."] };
  }
  const asked = countQuestions(transcript) > 0;
  const picked = threadsOf(input.partnerText).filter((t) => mentions(transcript, t));
  const lower = words(transcript).join(" ");
  const own = /\b(i|im|ive|my|me|we|our)\b/.test(lower);
  const handedBack = own && (HAND_BACK.test(lower) || asked);
  const cameBack = previousBlank;
  const notes: string[] = [];
  if (cameBack) notes.push("Came back in after a pause");
  const result: LiveTurnResult = { ...base, replied: true, asked, picked, handedBack, cameBack, score: 1, notes };

  switch (focus) {
    case "beat": {
      const l = latencyMs;
      result.score = l == null ? 1 : l < BEAT_MIN_MS ? 0.6 : l <= BEAT_MAX_MS ? 1 : Math.max(0.5, BEAT_MAX_MS / l);
      notes.push(
        l == null ? "Replied" : l < BEAT_MIN_MS ? `Jumped in after ${secs(l)}` : l <= BEAT_MAX_MS ? `Took a beat (${secs(l)})` : `Replied after ${secs(l)}`,
      );
      break;
    }
    case "thread":
    case "hold":
    case "outsider":
      result.score = 0.5 * Number(asked) + 0.5 * Number(picked.length > 0);
      notes.push(asked ? "Asked a question" : "No question this time");
      if (picked.length) notes.push(`Picked up “${picked[0]}”`);
      break;
    case "echo": {
      const beats = echoAskAdd(input.partnerText, transcript);
      result.beats = beats;
      result.score = Math.min(1, (Number(beats.echo) + Number(beats.ask) + Number(beats.add)) / 2);
      notes.push(`Echo ${beats.echo ? "✓" : "–"} · Ask ${beats.ask ? "✓" : "–"} · Add ${beats.add ? "✓" : "–"}`);
      break;
    }
    case "land": {
      const rambling = ramblingMetrics({ transcript, segments: input.measurement.segments, durationSeconds: speakingSeconds ?? undefined, budgetSeconds: LAND_BUDGET_SECONDS });
      result.rambling = rambling;
      const within = !input.cutOff && (speakingSeconds == null || speakingSeconds <= LAND_BUDGET_SECONDS * 1.5);
      result.score = 0.4 * Number(rambling.pointFirst) + 0.3 * Number(within) + 0.3 * Number(!rambling.trailingOff);
      notes.push(rambling.pointFirst ? "Point first" : "The point came a little later");
      notes.push(input.cutOff ? "Still going when the turn ended" : rambling.trailingOff ? "Trailed off at the end" : "Clean ending");
      break;
    }
    default:
      notes.push(latencyMs != null ? `Replied after ${secs(latencyMs)}` : "Replied");
      if (asked) notes.push("Asked a question");
      break;
  }
  if (handedBack && focus !== "thread" && focus !== "hold" && focus !== "outsider") notes.push("Handed it back");
  result.score = Math.round((result.score ?? 0) * 100) / 100;
  return result;
}

function summaryFor(focus: LiveFocus, scored: LiveTurnResult[], total: number): string {
  const n = scored.length;
  const of = (k: number) => `${k} of ${n} ${n === 1 ? "reply" : "replies"}`;
  switch (focus) {
    case "thread":
    case "hold":
    case "outsider":
      return `Asked about them in ${of(scored.filter((t) => t.asked).length)}`;
    case "echo":
      return `Two or more moves in ${of(scored.filter((t) => (t.score ?? 0) >= 1).length)}`;
    case "land":
      return `Point first in ${of(scored.filter((t) => t.rambling?.pointFirst).length)}`;
    case "beat":
      return `Took a beat in ${of(scored.filter((t) => t.latencyMs != null && t.latencyMs >= BEAT_MIN_MS && t.latencyMs <= BEAT_MAX_MS).length)}`;
    default:
      return `Replied ${n} of ${total} times`;
  }
}

export function evaluateLive(
  focus: LiveFocus,
  turns: LiveTurnInput[],
  extra: { endedBy: EndedBy | null; seconds: number },
): { outcome: DrillOutcome | null; details: LiveDetails } {
  const results: LiveTurnResult[] = [];
  turns.forEach((t, i) => results.push(evaluateTurn(focus, t, i > 0 && results[i - 1].blank)));
  const scored = results.filter((t) => t.replied);
  const details: LiveDetails = {
    live: true,
    focus,
    turns: results,
    replies: scored.length,
    blanks: results.length - scored.length,
    endedBy: extra.endedBy,
    seconds: Math.round(extra.seconds),
  };
  // Nothing said at all: a mic problem or a blank. Either way not recorded.
  if (!scored.length) return { outcome: null, details };
  const mean = scored.reduce((s, t) => s + (t.score ?? 0), 0) / scored.length;
  return { outcome: outcome(mean, summaryFor(focus, scored, results.length), mean >= 0.75 && scored.length >= 2), details };
}
