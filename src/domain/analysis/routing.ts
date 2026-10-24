import type { AnalysisContext, AnalysisKind, Producer, ShowLevel, Unavailable } from "./types";

// Which producers handle a kind of analysis, in order. One pure function, so
// the order is written down once and tested: Tono AI first (when it's the
// chosen provider, signed in, allowed and consented), then the person's own
// key (until session 08 removes it), then the rules where the rules have a
// version. Replaces domain/aiRouting.ts.

export interface Route {
  producers: Producer[];
  // Why the judged producer was left out, when it was.
  blocked: Unavailable | null;
  // What a Tono AI take review would send.
  tonoInput?: "text" | "video";
}

// Which producers can ever make each kind. The rules have no take review
// (the measured layer is always computed by the pipeline, not requested) and
// no notes on a Rewind or a summary (their counts are shown regardless).
export const SUPPORTED: Record<AnalysisKind, Producer[]> = {
  take_review: ["tono_ai", "own_key"],
  coaching: ["rules"],
  // The exercise judges are Tono AI only: judging them is part of Plus, and
  // they were never built for a person's own key.
  rewind_notes: ["tono_ai"],
  word_chain: ["tono_ai"],
  bridge_chain: ["tono_ai"],
  summary_notes: ["tono_ai", "own_key"],
  mark_up: ["tono_ai", "rules"],
};

// What a take review sends to Tono AI: the transcript and measurements by
// default; the video when that's the setting or there's no transcript.
export function tonoInputFor(ctx: AnalysisContext): "text" | "video" | null {
  if (ctx.judgeInput === "text" && ctx.hasTranscript) return "text";
  if (ctx.hasVideo) return "video";
  if (ctx.hasTranscript) return "text";
  return null;
}

function tonoBlock(ctx: AnalysisContext, allowance: "review" | "text"): Unavailable | null {
  if (ctx.tono.killSwitch) return "kill_switch";
  if (!ctx.tono.signedIn) return "signed_out";
  if (!ctx.tono.consent) return "no_consent";
  if (!ctx.tono.allowed[allowance]) return "quota";
  return null;
}

function ownKeyCan(kind: AnalysisKind, ctx: AnalysisContext): boolean {
  if (!ctx.ownKey) return false;
  if (kind === "take_review") return ctx.ownKey === "gemini" ? ctx.hasVideo : ctx.hasTranscript;
  return kind === "summary_notes";
}

export function routeAnalysis(kind: AnalysisKind, ctx: AnalysisContext): Route {
  const forced = ctx.flags.forceProducer;
  if (forced) {
    return SUPPORTED[kind].includes(forced) ? { producers: [forced], blocked: null } : { producers: [], blocked: "unsupported" };
  }
  const rules: Producer[] = SUPPORTED[kind].includes("rules") ? ["rules"] : [];
  if (kind === "coaching") return { producers: rules, blocked: null };
  if (!ctx.takeOptIn) return { producers: rules, blocked: "opted_out" };

  let tonoInput: "text" | "video" | undefined;
  let allowance: "review" | "text" = "text";
  if (kind === "take_review") {
    const input = tonoInputFor(ctx);
    if (!input) return { producers: [], blocked: "no_input" };
    tonoInput = input;
    allowance = input === "video" ? "review" : "text";
  }

  const judged: Producer[] = [];
  let blocked: Unavailable | null = null;
  if (ctx.wantsTono) {
    blocked = tonoBlock(ctx, allowance);
    if (!blocked) judged.push("tono_ai");
  }
  if (ownKeyCan(kind, ctx)) judged.push("own_key");
  if (!judged.length && !blocked) blocked = "unsupported";
  return { producers: [...judged, ...rules], blocked: judged.length ? null : blocked, ...(tonoInput ? { tonoInput } : {}) };
}

const LOCKED: Unavailable[] = ["not_entitled", "signed_out", "quota", "cost_cap", "budget_paused"];

// What a screen can show for a kind: "judged" when an AI will judge it,
// "locked" when one would with an account or Plus, "facts" otherwise.
// Coaching follows the take review: its judged version comes with the review.
export function whatCanShow(kind: AnalysisKind, ctx: AnalysisContext): ShowLevel {
  const route = routeAnalysis(kind === "coaching" ? "take_review" : kind, ctx);
  if (route.producers[0] === "tono_ai" || route.producers[0] === "own_key") return "judged";
  return route.blocked && LOCKED.includes(route.blocked) ? "locked" : "facts";
}
