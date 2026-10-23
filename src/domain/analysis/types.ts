import type { KeyProviderId } from "../../services/cloud/providers";

// The AnalysisService's vocabulary (docs/decisions/scoring-taxonomy.md, part 3).
// Every kind of analysis has one typed result shape; providers (Tono AI, the
// rules, for now the person's own key) produce it; the UI knows only the shape
// and its provenance, never which model or prompt made it.

// The kinds built so far. Later sessions add theirs here (session 10:
// "word_chain", "bridge_chain"; session 12: "conversation_turn",
// "conversation_debrief", "tts"; insights: "insight") with an input and an
// output type in services/analysis/kinds.ts.
export type AnalysisKind =
  | "take_review" // the judged layer of a recorded take: sub-scores, notes, coaching
  | "coaching" // the coach card for a take: strength, tip, focus skill, follow-up
  | "rewind_notes" // notes on a Rewind's words
  | "summary_notes" // Say it short
  | "mark_up"; // delivery marks for a text to read aloud

// Who produced a result. "own_key" is the bring-your-own-key provider, kept
// working until session 08 removes it. Room for "on_device_llm" or
// "apple_pcc" later without touching a screen.
export type Producer = "tono_ai" | "own_key" | "rules";

export interface Provenance {
  producer: Producer;
  // The name to show ("Tono AI", "OpenAI"). Absent for the rules.
  provider?: string;
  // As reported by the server (Tono AI can change models without an update).
  model?: string;
  // Which prompt template wrote it, so a model or prompt change is traceable.
  promptVersion: string;
  // True only for an AI judgement; the rules never judge.
  judged: boolean;
  // What the judge had: the transcript and measurements, or the video too.
  input?: "text" | "video";
  at: string;
}

// Why a result isn't there.
export type Unavailable =
  | "not_entitled" // the kind needs Plus (session 08 wires the tiers)
  | "signed_out"
  | "no_consent"
  | "opted_out" // switched off for this take
  | "offline" // no connection; a take review is retried when back online
  | "quota"
  | "cost_cap"
  | "budget_paused"
  | "kill_switch"
  | "age_gate"
  | "too_short"
  | "too_long"
  | "no_input" // nothing to judge (no transcript, no video)
  | "unsupported" // no provider does this kind here
  | "error";

export type AnalysisResult<T> =
  | { status: "done"; value: T; provenance: Provenance }
  | { status: "pending"; step?: string }
  | { status: "unavailable"; reason: Unavailable; message?: string; fallback?: { value: T; provenance: Provenance } };

// What routing needs to know, gathered from the account, consent, prefs and
// the take (services/analysis/context.ts). Pure data, so routing is testable.
export interface AnalysisContext {
  // Tono AI is the chosen provider (the default). Someone who picked their
  // own key's provider hasn't asked for Tono AI.
  wantsTono: boolean;
  tono: {
    signedIn: boolean;
    consent: boolean;
    // Last known allowance; the server has the final say.
    allowed: { review: boolean; text: boolean; insight: boolean };
    killSwitch: boolean;
  };
  // A bring-your-own-key provider with a key and consent (until session 08).
  ownKey: KeyProviderId | null;
  // The per-take switch: this take may be sent for judging.
  takeOptIn: boolean;
  // What a judged take review sends by default: the transcript and the
  // measurements ("text"), or the video too ("video").
  judgeInput: "text" | "video";
  hasVideo: boolean;
  hasTranscript: boolean;
  flags: { forceProducer?: Producer };
}

// What a screen may show for a kind: a judgement, the measured facts only, or
// the facts plus a locked judged layer (Plus would add it).
export type ShowLevel = "judged" | "facts" | "locked";
