import type { AllowanceTier } from "../aiAllowance";

// The AnalysisService's vocabulary (docs/decisions/scoring-taxonomy.md, part 3).
// Every kind of analysis has one typed result shape; providers (Tono AI and
// the rules) produce it; the UI knows only the shape and its provenance, never
// which model or prompt made it.

// The kinds built so far. Later sessions add theirs here (session 12:
// "conversation_turn", "conversation_debrief", "tts"; insights: "insight")
// with an input and an output type in services/analysis/kinds.ts, and a task
// on the server (supabase/functions/_shared/prompts).
export type AnalysisKind =
  | "take_review" // the judged layer of a recorded take: sub-scores, notes, coaching
  | "coaching" // the coach card for a take: strength, tip, focus skill, follow-up
  | "rewind_notes" // notes on a Rewind's words
  | "word_chain" // each link of a Word Chain attempt: does it make sense
  | "bridge_chain" // each step of a Bridge Chain attempt: was the link explained
  | "summary_notes" // Say it short
  | "mark_up"; // delivery marks for a text to read aloud

// Who produced a result. Room for "on_device_llm" or "apple_pcc" later
// without touching a screen.
export type Producer = "tono_ai" | "rules";

export interface Provenance {
  producer: Producer;
  // The name to show ("Tono AI"). Absent for the rules.
  provider?: string;
  // As reported by the server (Tono AI can change models without an update).
  model?: string;
  // Which prompt template wrote it (the server reports it), so a model or
  // prompt change is traceable.
  promptVersion: string;
  // True only for an AI judgement; the rules never judge.
  judged: boolean;
  // What the judge had: the transcript and measurements, or the video too.
  input?: "text" | "video";
  at: string;
}

// Why a result isn't there.
export type Unavailable =
  | "not_entitled" // the kind needs Plus or the trial
  | "signed_out" // no account could be made or used (rare: one is made on demand)
  | "no_consent"
  | "opted_out" // switched off for this take
  | "offline" // no connection; a take review is retried when back online
  | "quota" // this month's (or the trial's) count is used
  | "cost_cap"
  | "budget_paused"
  | "kill_switch"
  | "age_gate" // under 18, and the server's policy keeps Tono AI off for minors
  | "too_short"
  | "too_long"
  | "no_input" // nothing to judge (no transcript, no video)
  | "unsupported" // no provider does this kind here
  | "error";

export type AnalysisResult<T> =
  | { status: "done"; value: T; provenance: Provenance }
  | { status: "pending"; step?: string }
  | { status: "unavailable"; reason: Unavailable; message?: string; fallback?: { value: T; provenance: Provenance } };

// What routing needs to know, gathered from the account, consent, the age
// answer, prefs and the take (services/cloud/routing.ts). Pure data, so
// routing is testable.
export interface AnalysisContext {
  // Which allowance applies: free (the measured layer, plus the monthly free
  // judged take), beta (TestFlight), the trial, or Plus. Free until the
  // server says otherwise.
  tier: AllowanceTier;
  tono: {
    // The one Tono AI consent.
    consent: boolean;
    // Last known: which kinds the server would accept. The server has the
    // final say.
    allowed: { take: boolean; text: boolean; insight: boolean };
    killSwitch: boolean;
  };
  // From the age question in onboarding: false for under 18, null when it
  // wasn't answered (nobody is blocked on a guess).
  isAdult: boolean | null;
  // The server's policy for under-18s (config.minorsMayUseAi).
  minorsMayUseAi: boolean;
  // The per-take switch: this take may be sent for judging.
  takeOptIn: boolean;
  // What a judged take review sends by default: the transcript and the
  // measurements ("text"), or the video too ("video", a Dev setting).
  judgeInput: "text" | "video";
  hasVideo: boolean;
  hasTranscript: boolean;
  flags: { forceProducer?: Producer };
}

// What a screen may show for a kind: a judgement, the measured facts only, or
// the facts plus a locked judged layer (Plus or the trial would add it).
export type ShowLevel = "judged" | "facts" | "locked";
