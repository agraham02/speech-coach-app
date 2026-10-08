import { summarizeVolume, type VolumeReading } from "../dsp/volumePauses";
import { ramblingMetrics, type RamblingMetrics } from "../coach/ramblingMetrics";
import { outcome, scoreSelfRating, type DrillOutcome } from "../drills/drillSpecs";
import { countQuestions } from "./questions";
import { contentWords, mentions, stem, words } from "./text";
import type { ConversationSetup, ConversationTurn } from "./prepareConversation";

// Scores a conversation drill on *process* only — did you reply, how soon,
// did you ask, did you use their words, did you stop — never on how good
// the reply was. That's deliberate: the point of this skill is to lower the
// pressure to perform, so nothing here grades wit or quality. Pure.

// Recognition reports words a little after they're spoken.
export const FIRST_RESULT_LATENCY_MS = 400;
const MIN_REPLY_WORDS = 3;
// Inside this many ms after the partner stops, a reply reads as a natural,
// unhurried beat.
export const BEAT_MIN_MS = 1000;
export const BEAT_MAX_MS = 2500;

export interface TurnMeasurement {
  transcript: string;
  // Pause-separated recognizer utterances.
  segments?: string[];
  // Epoch ms the partner finished speaking.
  partnerEndAt: number;
  // Epoch ms the mic was started for this reply; volume readings count from here.
  listenStartAt: number;
  volume: VolumeReading[];
  firstResultAt: number | null;
  lastResultAt: number | null;
}

// When the reply actually started, from the volume meter when it agrees
// with recognition, otherwise from the first recognized word.
export function replyTiming(m: TurnMeasurement): { latencyMs: number | null; speakingMs: number | null } {
  if (m.firstResultAt == null) return { latencyMs: null, speakingMs: null };
  const asrOnset = m.firstResultAt - FIRST_RESULT_LATENCY_MS;
  const vol = summarizeVolume(m.volume, 300);
  const volOnset = vol.speechStartMs != null ? m.listenStartAt + vol.speechStartMs : null;
  // Volume onset is more precise, but only trust it if it isn't long before
  // any words (a cough, or the tail of the partner's own audio).
  const onset = volOnset != null && volOnset <= m.firstResultAt && m.firstResultAt - volOnset < 3000 ? volOnset : asrOnset;
  // The last word lags its result by about the same amount as the first.
  const end = (m.lastResultAt ?? m.firstResultAt) - FIRST_RESULT_LATENCY_MS;
  return {
    latencyMs: Math.max(0, Math.round(onset - m.partnerEndAt)),
    speakingMs: Math.max(0, Math.round(end - onset)),
  };
}

export interface EchoBeats {
  echo: boolean;
  ask: boolean;
  add: boolean;
}

// Echo: a couple of their content words early in the reply. Ask: a
// question. Add: a dozen-plus words with something of your own ("I", "my").
export function echoAskAdd(partnerText: string, reply: string): EchoBeats {
  const theirs = new Set(contentWords(partnerText).map(stem));
  const opening = words(reply).slice(0, 10).map(stem);
  const echoed = new Set(opening.filter((w) => theirs.has(w)));
  const replyWords = words(reply);
  const own = replyWords.some((w) => w === "i" || w === "my" || w === "me" || w === "im" || w === "ive" || w === "mine" || w === "we");
  return {
    echo: echoed.size >= Math.min(2, Math.max(1, theirs.size)) || (echoed.size >= 1 && theirs.size <= 3),
    ask: countQuestions(reply) > 0,
    add: replyWords.length >= 12 && own,
  };
}

export interface TurnResult {
  replied: boolean;
  words: number;
  latencyMs: number | null;
  speakingSeconds: number | null;
  asked?: boolean;
  picked?: string[];
  beats?: EchoBeats;
  calledBack?: boolean;
  rambling?: RamblingMetrics;
  withinBudget?: boolean;
  score: number;
  // Short, kind, process-only notes for the result card.
  notes: string[];
}

export interface ConversationDetails {
  turns: TurnResult[];
  retention?: number;
  selfRating?: number;
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function timingScore(latencyMs: number | null, windowMs: number): number {
  if (latencyMs == null) return 1;
  return latencyMs <= windowMs ? 1 : Math.max(0.5, windowMs / latencyMs);
}

function evaluateTurn(setup: ConversationSetup, turn: ConversationTurn, m: TurnMeasurement, isLast: boolean): TurnResult {
  const wordCount = words(m.transcript).length;
  const { latencyMs, speakingMs } = replyTiming(m);
  const replied = wordCount >= MIN_REPLY_WORDS;
  const speakingSeconds = speakingMs == null ? null : Math.round(speakingMs / 100) / 10;
  const base = { replied, words: wordCount, latencyMs, speakingSeconds };
  if (!replied) {
    return { ...base, score: 0, notes: [wordCount > 0 ? "A few words — that's a start." : "No reply this time. That's okay — it's what this practices."] };
  }
  const timingNote = latencyMs != null ? `Replied after ${secs(latencyMs)}` : "Replied";
  const partnerText = turn.lines.map((l) => l.text).join(" ");

  switch (setup.type) {
    case "conv_beat": {
      const beat = latencyMs == null ? 1 : latencyMs < BEAT_MIN_MS ? 0.6 : latencyMs <= BEAT_MAX_MS ? 1 : Math.max(0.5, BEAT_MAX_MS / latencyMs);
      const note =
        latencyMs == null
          ? "Replied"
          : latencyMs < BEAT_MIN_MS
            ? `Jumped in after ${secs(latencyMs)} — try one breath first`
            : latencyMs <= BEAT_MAX_MS
              ? `Took a beat (${secs(latencyMs)}) — just right`
              : `Replied after ${secs(latencyMs)} — the beat can be shorter`;
      return { ...base, score: beat, notes: [note] };
    }
    case "conv_thread":
    case "conv_held":
    case "conv_outsider":
    case "conv_replay": {
      const asked = countQuestions(m.transcript) > 0;
      const picked = turn.threads.filter((t) => mentions(m.transcript, t));
      const notes = [
        timingNote,
        asked ? "Asked a question" : "No question this time",
        picked.length ? `Picked up “${picked[0]}”` : "Didn't use their words this time",
      ];
      // A replay is a second go at a moment you froze in: any reply counts.
      const score = setup.type === "conv_replay" ? timingScore(latencyMs, setup.replyWindowMs) : 0.5 * Number(asked) + 0.5 * Number(picked.length > 0);
      return { ...base, asked, picked, score, notes };
    }
    case "conv_echo": {
      const beats = echoAskAdd(partnerText, m.transcript);
      const got = Number(beats.echo) + Number(beats.ask) + Number(beats.add);
      const required = setup.params.requiredBeats ?? 2;
      return {
        ...base,
        beats,
        score: Math.min(1, got / required),
        notes: [`Echo ${beats.echo ? "✓" : "–"} · Ask ${beats.ask ? "✓" : "–"} · Add ${beats.add ? "✓" : "–"}`, timingNote],
      };
    }
    case "land_plane":
    case "squeeze": {
      const budget = turn.budgetSeconds ?? 40;
      const rambling = ramblingMetrics({ transcript: m.transcript, segments: m.segments, durationSeconds: speakingSeconds ?? undefined, budgetSeconds: budget });
      const withinBudget = speakingSeconds == null || speakingSeconds <= budget * 1.15;
      const notes = [
        withinBudget ? `Within time (${Math.round(speakingSeconds ?? 0)} s of ${budget})` : `Ran a bit long (${Math.round(speakingSeconds ?? 0)} s of ${budget})`,
      ];
      if (setup.type === "land_plane") {
        notes.unshift(rambling.pointFirst ? "Point first" : "Your point came a little later");
        notes.push(rambling.trailingOff ? "Trailed off at the end" : "Clean ending");
        if (rambling.tangentMarkers >= 2) notes.push(`${rambling.tangentMarkers} detours`);
        const score = 0.4 * Number(rambling.pointFirst) + 0.3 * Number(withinBudget) + 0.3 * Number(!rambling.trailingOff);
        return { ...base, rambling, withinBudget, score, notes };
      }
      return { ...base, rambling, withinBudget, score: withinBudget ? 1 : 0.5, notes };
    }
    case "callback": {
      const calledBack = turn.callbackWords ? turn.callbackWords.some((w) => mentions(m.transcript, w)) : undefined;
      const notes = [timingNote];
      if (isLast && turn.callbackWords) notes.push(calledBack ? "Called back to the first story" : "No callback this time");
      return { ...base, calledBack, score: calledBack === false ? 0.5 : 1, notes };
    }
    case "conv_reply":
    case "conv_group":
    case "conv_react":
      return { ...base, score: timingScore(latencyMs, setup.replyWindowMs), notes: [timingNote] };
  }
}

export function evaluateConversation(
  setup: ConversationSetup,
  measurements: TurnMeasurement[],
  extra: { selfRating?: number } = {},
): { outcome: DrillOutcome; details: ConversationDetails } {
  const turns = measurements.map((m, i) => evaluateTurn(setup, setup.turns[i], m, i === measurements.length - 1));
  const replies = turns.filter((t) => t.replied).length;
  const allReplied = replies === turns.length && turns.length > 0;
  const mean = turns.length ? turns.reduce((s, t) => s + t.score, 0) / turns.length : 0;
  const details: ConversationDetails = { turns };

  switch (setup.type) {
    case "conv_react": {
      const rated = extra.selfRating != null ? scoreSelfRating(extra.selfRating) : null;
      details.selfRating = extra.selfRating;
      const score = rated ? 0.5 * rated.score + 0.5 * Number(allReplied) : Number(allReplied);
      return { outcome: outcome(score, allReplied ? "You reacted in the moment" : "No reaction this time", allReplied && (rated?.success ?? true)), details };
    }
    case "squeeze": {
      const first = measurements[0]?.transcript ?? "";
      const last = measurements[measurements.length - 1]?.transcript ?? "";
      const short = new Set(contentWords(last).map(stem));
      const long = new Set(contentWords(first).map(stem));
      const kept = [...short].filter((w) => long.has(w)).length;
      const retention = short.size ? Math.round((kept / Math.min(short.size, 8)) * 100) / 100 : 0;
      details.retention = Math.min(1, retention);
      const target = setup.params.retentionTarget ?? 0.3;
      const within = turns.filter((t) => t.withinBudget).length;
      const score = 0.6 * (within / Math.max(turns.length, 1)) + 0.4 * Math.min(1, details.retention / target);
      const success = allReplied && within === turns.length && details.retention >= target;
      return { outcome: outcome(score, `${within} of ${turns.length} takes on time · kept the heart of the story`, success), details };
    }
    case "callback": {
      const calledBack = turns[turns.length - 1]?.calledBack === true;
      const score = 0.6 * Number(calledBack) + 0.4 * (replies / Math.max(turns.length, 1));
      return { outcome: outcome(score, calledBack ? "You called back to the first story" : `Replied ${replies} of ${turns.length} times`, calledBack && allReplied), details };
    }
    case "conv_echo": {
      const got = turns[0]?.beats;
      const n = got ? Number(got.echo) + Number(got.ask) + Number(got.add) : 0;
      return { outcome: outcome(mean, `${n} of 3 moves`, allReplied && n >= (setup.params.requiredBeats ?? 2)), details };
    }
    case "conv_thread":
    case "conv_held":
    case "conv_outsider": {
      const t = turns[0];
      const success = allReplied && !!t?.asked && (t?.picked?.length ?? 0) > 0;
      return { outcome: outcome(mean, t?.asked ? "You asked about what they said" : "You replied", success), details };
    }
    case "land_plane": {
      const t = turns[0];
      const success = allReplied && !!t?.rambling?.pointFirst && !!t.withinBudget && !t.rambling.trailingOff;
      return { outcome: outcome(mean, t?.replied ? t.notes.slice(0, 2).join(" · ") : "No answer this time", success), details };
    }
    default: {
      const latencies = turns.map((t) => t.latencyMs).filter((v): v is number => v != null);
      const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
      const summary = turns.length > 1 ? `Jumped in ${replies} of ${turns.length} times` : avg != null ? `Replied after ${secs(avg)}` : "You replied";
      return { outcome: outcome(mean, summary, allReplied && mean >= 0.8), details };
    }
  }
}
