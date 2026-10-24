import type { AnalysisContext, AnalysisKind, Producer, ShowLevel, Unavailable } from "./types";

// Which producers handle a kind of analysis, in order. One pure function, so
// the order is written down once and tested: Tono AI first (when the person
// consented, it's allowed for their tier and their age, and there's something
// left), then the rules where the rules have a version.
//
// The tiers (docs/decisions/tiers-and-trial.md): the measured layer is free
// for everyone. The judged layer is Plus and the trial, plus one free judged
// take a month for everyone else. Exercise judging (Rewind, Word Chain,
// Bridge Chain, Say it short) and mark-ups are judged only for Plus and the
// trial (and testers in beta).

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
  take_review: ["tono_ai"],
  coaching: ["rules"],
  rewind_notes: ["tono_ai"],
  word_chain: ["tono_ai"],
  bridge_chain: ["tono_ai"],
  summary_notes: ["tono_ai"],
  mark_up: ["tono_ai", "rules"],
  conversation_debrief: ["tono_ai", "rules"],
};

// What a take review sends to Tono AI: the transcript and measurements by
// default; the video when that's the setting or there's no transcript.
export function tonoInputFor(ctx: AnalysisContext): "text" | "video" | null {
  if (ctx.judgeInput === "text" && ctx.hasTranscript) return "text";
  if (ctx.hasVideo) return "video";
  if (ctx.hasTranscript) return "text";
  return null;
}

// Under 18, and the server's policy keeps Tono AI off for minors. An
// unanswered age question never blocks anyone.
export function ageGated(ctx: Pick<AnalysisContext, "isAdult" | "minorsMayUseAi">): boolean {
  return ctx.isAdult === false && !ctx.minorsMayUseAi;
}

function tonoBlock(kind: AnalysisKind, ctx: AnalysisContext): Unavailable | null {
  if (ctx.tono.killSwitch) return "kill_switch";
  if (ageGated(ctx)) return "age_gate";
  // Exercise notes and mark-ups are Plus (and trial, and beta) features.
  if (kind !== "take_review" && ctx.tier === "free") return "not_entitled";
  if (!ctx.tono.consent) return "no_consent";
  // The debrief belongs to the conversation it follows, so it never needs
  // minutes left (the server lets it finish too).
  if (kind === "conversation_debrief") return null;
  // One take, one count, whatever the judge is sent.
  const count = kind === "take_review" ? "take" : "text";
  if (!ctx.tono.allowed[count]) return "quota";
  return null;
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
  if (kind === "take_review") {
    const input = tonoInputFor(ctx);
    if (!input) return { producers: [], blocked: "no_input" };
    tonoInput = input;
  }

  const blocked = tonoBlock(kind, ctx);
  if (blocked) return { producers: rules, blocked };
  return { producers: ["tono_ai", ...rules], blocked: null, ...(tonoInput ? { tonoInput } : {}) };
}

// Blocks that Plus or the trial would lift: the screen shows a quiet locked
// line. Everything else (opted out, under 18, the kill switch, no consent)
// shows the facts and nothing locked.
const LOCKED: Unavailable[] = ["not_entitled", "quota"];

// What a screen can show for a kind: "judged" when Tono AI will judge it,
// "locked" when Plus or the trial would, "facts" otherwise. Coaching follows
// the take review: its judged version comes with the review. A subscriber
// who used their count sees "facts": there's nothing more to buy.
export function whatCanShow(kind: AnalysisKind, ctx: AnalysisContext): ShowLevel {
  const route = routeAnalysis(kind === "coaching" ? "take_review" : kind, ctx);
  if (route.producers[0] === "tono_ai") return "judged";
  const paying = ctx.tier === "plus" || ctx.tier === "trial";
  return route.blocked && LOCKED.includes(route.blocked) && !paying ? "locked" : "facts";
}

// Whether the live conversation (Tono Plus) can run now, or why not. Not an
// analysis kind (it is the conversation itself), but the same gate: the kill
// switch, the age policy, the tier, consent and minutes left.
// `minutes` is what the server last said (null before it has said anything).
// locked: Plus or the trial would open it, so the screen shows the lesson
// content and one quiet line. Otherwise it says why and offers nothing to buy.
export function liveConversationGate(
  ctx: Pick<AnalysisContext, "tier" | "tono" | "isAdult" | "minorsMayUseAi">,
  minutes: { total: number | null; left: number | null },
): { open: true } | { open: false; reason: Unavailable; locked: boolean } {
  if (ctx.tono.killSwitch) return { open: false, reason: "kill_switch", locked: false };
  if (ageGated(ctx)) return { open: false, reason: "age_gate", locked: false };
  const paying = ctx.tier === "plus" || ctx.tier === "trial";
  // A free account has no minutes unless the server says it has (a sample).
  const hasMinutes = minutes.total == null ? ctx.tier !== "free" : minutes.total > 0;
  if (!hasMinutes) return { open: false, reason: paying ? "quota" : "not_entitled", locked: !paying };
  const left = minutes.left == null ? ctx.tono.allowed.conversation !== false : minutes.left > 0 && ctx.tono.allowed.conversation !== false;
  if (!left) return { open: false, reason: "quota", locked: ctx.tier === "free" };
  if (!ctx.tono.consent) return { open: false, reason: "no_consent", locked: false };
  return { open: true };
}
