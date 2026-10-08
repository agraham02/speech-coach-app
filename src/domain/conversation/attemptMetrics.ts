import type { ConversationDetails } from "./evaluateConversation";

// What a conversation drill stores in drill_attempts.metrics_json, and the
// per-attempt numbers the Progress screen charts from it. Pure.

export interface ConversationMetrics extends ConversationDetails {
  // "How much of your attention was on yourself?" 0-10, before / after.
  // Null when skipped.
  selfFocusBefore: number | null;
  selfFocusAfter: number | null;
}

export interface AttemptSummary {
  latencyMs: number | null;
  // Whether a question was asked, for drills that look for one.
  asked: boolean | null;
  selfFocusBefore: number | null;
  selfFocusAfter: number | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Tolerates partial / older JSON: anything missing comes back null.
export function summarizeAttempt(raw: unknown): AttemptSummary {
  const m = (raw ?? {}) as Partial<ConversationMetrics>;
  const turns = Array.isArray(m.turns) ? m.turns : [];
  const latencies = turns.map((t) => t?.latencyMs).filter(isNum);
  const askedFlags = turns.map((t) => t?.asked).filter((v): v is boolean => typeof v === "boolean");
  return {
    latencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    asked: askedFlags.length ? askedFlags.some(Boolean) : null,
    selfFocusBefore: isNum(m.selfFocusBefore) ? m.selfFocusBefore : null,
    selfFocusAfter: isNum(m.selfFocusAfter) ? m.selfFocusAfter : null,
  };
}
