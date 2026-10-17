import { ramblingMetrics } from "../coach/ramblingMetrics";
import { replyTiming, type TurnMeasurement } from "../conversation/evaluateConversation";
import { words } from "../conversation/text";
import { outcome, type DrillOutcome } from "../drills/drillSpecs";
import type { SummarySetup, SummaryTurn } from "./prepareSummary";
import { averageSentenceWords, longWords, spokenSentences, wordsHit, type SentenceSource } from "./measure";
import type { Accuracy, SummaryReview, Verdict } from "./summaryReviewPrompt";

// Scores a spoken summary. The phone counts sentences, seconds, key words and
// long words; when an AI review is available it judges the idea (did you
// catch it, is it right, is it plain) and leads the content part of the
// score. Never graded on voice. Pure.

const MIN_REPLY_WORDS = 3;
// Pause-separated segments over-count sentences (a thinking pause is not a
// full stop), so they get one sentence of slack.
const PAUSE_SLACK = 1;

export interface SummaryTurnResult {
  replied: boolean;
  words: number;
  latencyMs: number | null;
  speakingSeconds: number | null;
  sentences: number;
  sentenceSource: SentenceSource;
  withinSentences: boolean;
  withinBudget: boolean;
  trailingOff: boolean;
  restarts: number;
  keyHits: string[];
  prevHits?: string[];
  avgSentenceWords?: number;
  longShare?: number;
  longWords?: string[];
  // From the AI review, when there is one.
  mainIdea?: Verdict;
  linkedBack?: Verdict | "not_applicable";
  score: number;
  notes: string[];
}

export interface SummaryDetails {
  turns: SummaryTurnResult[];
  review?: SummaryReview | null;
}

const VERDICT_SCORE: Record<Verdict, number> = { yes: 1, partly: 0.5, no: 0 };
const ACCURACY_SCORE: Record<Exclude<Accuracy, "not_checked">, number> = { yes: 1, mostly: 0.6, no: 0 };

function secs(n: number | null): string {
  return n == null ? "" : `${Math.round(n)} s`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// 1 inside the limit, falling as it is exceeded.
function underScore(value: number, limit: number): number {
  if (value <= limit) return 1;
  return Math.max(0, 1 - (value - limit) / Math.max(limit, 1));
}

function evaluateTurn(setup: SummarySetup, turn: SummaryTurn, m: TurnMeasurement, turnIndex: number, review: SummaryReview | null): SummaryTurnResult {
  const spoken = words(m.transcript);
  const { latencyMs, speakingMs } = replyTiming(m);
  const speakingSeconds = speakingMs == null ? null : Math.round(speakingMs / 100) / 10;
  const replied = spoken.length >= MIN_REPLY_WORDS;
  const empty: SummaryTurnResult = {
    replied,
    words: spoken.length,
    latencyMs,
    speakingSeconds,
    sentences: 0,
    sentenceSource: "punctuation",
    withinSentences: false,
    withinBudget: true,
    trailingOff: false,
    restarts: 0,
    keyHits: [],
    score: 0,
    notes: [spoken.length > 0 ? "A few words — that's a start." : "No answer this time. That's okay — it's what this practices."],
  };
  if (!replied) return empty;

  const count = spokenSentences(m.transcript, m.segments);
  const limit = turn.sentenceLimit + (count.source === "pauses" ? PAUSE_SLACK : 0);
  const withinSentences = count.count <= limit;
  const withinBudget = speakingSeconds == null || speakingSeconds <= turn.budgetSeconds * 1.15;
  const rambling = ramblingMetrics({ transcript: m.transcript, segments: m.segments, durationSeconds: speakingSeconds ?? undefined, budgetSeconds: turn.budgetSeconds });
  const sentenceScore = underScore(count.count, limit);
  const timeScore = withinBudget ? 1 : 0.5;
  const endScore = rambling.trailingOff ? 0 : 1;
  const base: SummaryTurnResult = {
    ...empty,
    sentences: count.count,
    sentenceSource: count.source,
    withinSentences,
    withinBudget,
    trailingOff: rambling.trailingOff,
    restarts: rambling.restarts,
    notes: [],
  };

  const timeNote = withinBudget ? `Within time (${secs(speakingSeconds)} of ${turn.budgetSeconds})` : `Ran a bit long (${secs(speakingSeconds)} of ${turn.budgetSeconds})`;

  switch (setup.type) {
    case "sum_up": {
      const sum = review?.drill === "sum_up" ? review : null;
      let score = 0.4 * sentenceScore + 0.3 * timeScore + 0.3 * endScore;
      if (sum) {
        const core = VERDICT_SCORE[sum.core];
        const content = sum.accurate === "not_checked" ? core : 0.6 * core + 0.4 * ACCURACY_SCORE[sum.accurate];
        score = 0.3 * sentenceScore + 0.2 * timeScore + 0.15 * endScore + 0.35 * content;
      }
      const notes = [
        withinSentences ? plural(count.count, "sentence", "sentences") : `${plural(count.count, "sentence", "sentences")} — the limit was ${turn.sentenceLimit}`,
        timeNote,
        rambling.trailingOff ? "Trailed off at the end" : "Clean ending",
      ];
      if (sum) notes.push(sum.core === "yes" ? "Caught the core of it" : sum.core === "partly" ? "Caught part of the core" : "Missed the core");
      return { ...base, score, notes };
    }
    case "relay": {
      const rel = review?.drill === "relay" ? review.turns[turnIndex] : null;
      const needed = Math.min(setup.params.keyWordsNeeded ?? 1, turn.keyWords.length);
      const keyHits = wordsHit(m.transcript, turn.keyWords);
      const prevHits = turn.rolling && turn.prevKeyWords ? wordsHit(m.transcript, turn.prevKeyWords) : undefined;
      const keyScore = needed ? Math.min(1, keyHits.length / needed) : 1;
      const prevScore = prevHits ? (prevHits.length >= 1 ? 1 : 0) : null;
      let score: number;
      if (rel) {
        const idea = VERDICT_SCORE[rel.mainIdea];
        const link = rel.linkedBack === "not_applicable" ? null : VERDICT_SCORE[rel.linkedBack];
        score = link == null ? 0.3 * sentenceScore + 0.2 * timeScore + 0.5 * idea : 0.25 * sentenceScore + 0.15 * timeScore + 0.4 * idea + 0.2 * link;
      } else {
        score = prevScore == null ? 0.4 * sentenceScore + 0.3 * timeScore + 0.3 * keyScore : 0.35 * sentenceScore + 0.25 * timeScore + 0.25 * keyScore + 0.15 * prevScore;
      }
      const notes = [withinSentences ? plural(count.count, "sentence", "sentences") : `${plural(count.count, "sentence", "sentences")} — the limit was ${turn.sentenceLimit}`, timeNote];
      if (keyHits.length) notes.push(`Caught “${keyHits.slice(0, 3).join("”, “")}”`);
      else notes.push("Didn't mention this paragraph's key words");
      if (prevScore != null) notes.push(prevScore === 1 ? "Linked back to the last paragraph" : "Didn't link back to the last paragraph");
      return {
        ...base,
        keyHits,
        prevHits,
        mainIdea: rel?.mainIdea,
        linkedBack: rel?.linkedBack,
        score,
        notes,
      };
    }
    case "explain_simple": {
      const exp = review?.drill === "explain_simple" ? review : null;
      const avg = averageSentenceWords(count);
      const plain = longWords(m.transcript, turn.keyWords);
      const cap = setup.params.longWordShare ?? 0.1;
      const maxWords = setup.params.maxSentenceWords ?? 14;
      const lengthScore = underScore(avg, maxWords);
      let plainScore = underScore(plain.share, cap);
      let score = 0.35 * timeScore + 0.35 * lengthScore + 0.3 * plainScore;
      if (exp) {
        plainScore = 0.5 * plainScore + 0.5 * (1 - Math.min(1, exp.jargon.length / 3));
        const accurate = exp.accurate === "not_checked" ? 1 : ACCURACY_SCORE[exp.accurate];
        score = 0.2 * timeScore + 0.2 * lengthScore + 0.2 * plainScore + 0.4 * accurate;
      }
      const notes = [
        timeNote,
        avg <= maxWords + 1 ? `Short sentences (${Math.round(avg)} words on average)` : `Sentences ran long (${Math.round(avg)} words on average, aim for ${maxWords})`,
        plain.share <= cap ? "Everyday words" : `A few long words: ${plain.long.slice(0, 4).join(", ")}`,
      ];
      return { ...base, avgSentenceWords: Math.round(avg * 10) / 10, longShare: Math.round(plain.share * 100) / 100, longWords: plain.long, score, notes };
    }
  }
}

function turnPassed(setup: SummarySetup, turn: SummaryTurn, r: SummaryTurnResult, review: SummaryReview | null): boolean {
  if (!r.replied || !r.withinBudget) return false;
  switch (setup.type) {
    case "sum_up": {
      const sum = review?.drill === "sum_up" ? review : null;
      return r.withinSentences && !r.trailingOff && (sum ? sum.core !== "no" && sum.accurate !== "no" : true);
    }
    case "relay": {
      if (!r.withinSentences) return false;
      if (r.mainIdea) return r.mainIdea !== "no" && (r.linkedBack === undefined || r.linkedBack === "not_applicable" || r.linkedBack !== "no");
      const needed = Math.min(setup.params.keyWordsNeeded ?? 1, turn.keyWords.length);
      return r.keyHits.length >= needed && (!r.prevHits || r.prevHits.length >= 1);
    }
    case "explain_simple": {
      const exp = review?.drill === "explain_simple" ? review : null;
      const lengthOk = (r.avgSentenceWords ?? 0) <= (setup.params.maxSentenceWords ?? 14) + 1;
      const plainOk = (r.longShare ?? 0) <= (setup.params.longWordShare ?? 0.1);
      return lengthOk && plainOk && (exp ? exp.accurate !== "no" : true);
    }
  }
}

export function evaluateSummary(setup: SummarySetup, measurements: TurnMeasurement[], review: SummaryReview | null = null): { outcome: DrillOutcome; details: SummaryDetails } {
  const turns = setup.turns.map((turn, i) => {
    const m = measurements[i] ?? { transcript: "", partnerEndAt: 0, listenStartAt: 0, volume: [], firstResultAt: null, lastResultAt: null };
    return evaluateTurn(setup, turn, m, i, review);
  });
  const mean = turns.length ? turns.reduce((s, t) => s + t.score, 0) / turns.length : 0;
  const allReplied = turns.length > 0 && turns.every((t) => t.replied);
  const passed = turns.filter((t, i) => turnPassed(setup, setup.turns[i], t, review)).length;
  const success = allReplied && passed === turns.length;
  const details: SummaryDetails = { turns, review };

  const summary =
    setup.type === "relay"
      ? `${passed} of ${turns.length} summaries on target`
      : turns[0]?.replied
        ? turns[0].notes.slice(0, 2).join(" · ")
        : "No answer this time";
  return { outcome: outcome(mean, summary, success), details };
}
