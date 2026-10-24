import { filterMarks } from "../../domain/cadence/marks";
import { toNotation } from "../../domain/cadence/notation";
import { hasAnyPlanText } from "../../domain/planYourPoint";
import { defaultsFromProfile } from "../../domain/profile";
import { speakerFacts, type SpeakerFacts } from "../../domain/reviewerContext";
import type { MarkLevel, Script } from "../../domain/scriptTypes";
import { computeFillerStats } from "../../domain/transcriptAnnotations";
import { todayISODate } from "../../utils/dateUtils";
import { getNextEvent, getShareProfileWithReviews, getUserProfile } from "../prefs/prefsStore";
import { measuredVoice } from "../sessions/sessionScoreService";
import type { MarkUpInput, RewindNotesInput, SummaryNotesInput, TakeReviewInput } from "./kinds";

// What the phone sends Tono AI for each task: structured facts, never a
// prompt. The server writes the prompt from these
// (supabase/functions/_shared/prompts), so the wording can change without an
// app update. The shapes here match the server's input schemas.

// The person's onboarding answers, only when they allow it (Settings).
export function speakerForReview(): SpeakerFacts | null {
  if (!getShareProfileWithReviews()) return null;
  return speakerFacts(getUserProfile(), todayISODate(), getNextEvent());
}

export function stutterMode(): boolean {
  return defaultsFromProfile(getUserProfile()).stutterMode;
}

// The script in the app's mark notation (compact, and anchored to the words,
// so the judge can find each mark), or null when no marks were shown.
export function markedScriptText(script: Script, level: MarkLevel): string | null {
  const marks = filterMarks(script.marks, level);
  if (!marks.length) return null;
  return toNotation({ text: script.text, marks });
}

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export function takeReviewInputs(input: TakeReviewInput) {
  const { session, context, pauses, presence, stutterMode: stutters } = input;
  const { wpmAvg } = measuredVoice(session);
  const curve = (session.wpmCurve ?? []).map((p) => p.wpm).filter((w) => w > 0);
  const transcript = session.transcriptVerbatim?.trim() ? session.transcriptVerbatim : null;
  const typed = transcript ? computeFillerStats(transcript, session.durationSeconds) : null;

  const measurements = {
    durationSeconds: Math.max(0, session.durationSeconds || 0),
    pace: finite(wpmAvg) ? { wpm: wpmAvg, min: curve.length > 1 ? Math.min(...curve) : null, max: curve.length > 1 ? Math.max(...curve) : null } : null,
    // Someone who stutters: fillers are never measured against them.
    fillers:
      !stutters && session.fillerWordCount != null
        ? {
            total: session.fillerWordCount,
            perMinute: finite(session.fillerRatePerMinute) ? session.fillerRatePerMinute : null,
            hesitation: typed?.hesitation.count ?? 0,
            contextual: typed?.contextual.count ?? 0,
          }
        : null,
    repeatedWords: !stutters && session.repeatedWordCount ? session.repeatedWordCount : null,
    pauses: pauses
      ? {
          perMinute: pauses.pausesPerMinute,
          longestSeconds: pauses.longestPauseMs / 1000,
          hesitations: stutters ? null : pauses.hesitations,
          boundaryShare: finite(pauses.boundaryPauseRate) ? pauses.boundaryPauseRate : null,
          firstWordSeconds: finite(pauses.speechStartMs) ? pauses.speechStartMs / 1000 : null,
        }
      : null,
    pitch: finite(session.pitchRangeSt)
      ? { medianHz: session.pitchMedianHz ?? 0, rangeSemitones: session.pitchRangeSt, sdSemitones: finite(session.pitchSdSt) ? session.pitchSdSt : null }
      : null,
    loudness: finite(session.loudnessSpreadDb) ? { spreadDb: session.loudnessSpreadDb, peakSdDb: finite(session.loudnessPeakSdDb) ? session.loudnessPeakSdDb : null } : null,
    face:
      presence && presence.samples > 0
        ? {
            framedPercent: clampPct(presence.framedPercent),
            eyeContactPercent: clampPct(presence.eyeContactPercent),
            eyeSource: presence.eyeContactSource === "head" ? ("head" as const) : ("eyes" as const),
            lookingDownPercent: finite(presence.lookingDownPercent) ? clampPct(presence.lookingDownPercent) : null,
            lookingUpPercent: finite(presence.lookingUpPercent) ? clampPct(presence.lookingUpPercent) : null,
            longestLookAwaySeconds: presence.longestLookAwayMs / 1000,
            expressiveness: clampPct(presence.expressiveness),
            smilePercent: clampPct(presence.smilePercent),
            browRaisesPerMinute: finite(presence.browRaisesPerMinute) ? presence.browRaisesPerMinute : null,
            tensePercent: finite(presence.tensePercent) ? clampPct(presence.tensePercent) : null,
            headMovementDeg: presence.headMovement,
            headTiltDeg: finite(presence.headTiltDeg) ? presence.headTiltDeg : null,
          }
        : null,
  };

  const scripted = context.kind === "script";
  return {
    takeKind: scripted ? ("script" as const) : ("impromptu" as const),
    prompt: context.kind === "prompt" ? context.promptText : null,
    task: context.kind === "prompt" && context.taskContext ? context.taskContext : null,
    plan: context.kind === "prompt" && context.planText && hasAnyPlanText(context.planText) ? context.planText : null,
    script:
      context.kind === "script"
        ? { text: context.script.text, marked: context.cuesEnabled ? markedScriptText(context.script, context.markLevel ?? "full") : null }
        : null,
    transcript,
    words: transcript && session.transcriptWords?.length ? session.transcriptWords.map((w) => [w.text, w.startMs, w.endMs] as [string, number, number]) : null,
    measurements,
    speaker: speakerForReview(),
    stutterMode: stutters,
  };
}

export function rewindNotesInputs(input: RewindNotesInput) {
  return { transcript: input.transcript };
}

export function summaryNotesInputs(input: SummaryNotesInput) {
  return {
    type: input.setup.type,
    turns: input.setup.turns.map((t) => ({
      show: t.show,
      ...(t.own ? { own: true } : {}),
      sentenceLimit: t.sentenceLimit,
      ...(t.example ? { example: t.example } : {}),
      rolling: t.rolling,
      ...(t.prevText ? { prevText: t.prevText } : {}),
    })),
    transcripts: input.transcripts,
    speaker: speakerForReview(),
    stutterMode: stutterMode(),
  };
}

export function markUpInputs(input: MarkUpInput) {
  return { text: input.text };
}
