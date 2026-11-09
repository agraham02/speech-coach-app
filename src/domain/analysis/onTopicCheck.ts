import { quoteIn } from "./quotes";
import type { TopicVerdict } from "../meaning/meaning";

// The small content check's answer (docs/overhaul/PLAN.md, 6.6, level 2): a level
// from 0 to 5 for "is this about what was asked", with a quote the phone verifies
// against what was really said. A quote that isn't in the answer isn't evidence,
// and nothing unverified is used. Pure.

export interface OnTopicCheck {
  // 0 not about it at all, 5 directly and fully.
  level: number;
  // Words from the answer, copied exactly.
  quote: string;
  note: string;
}

const clean = (text: unknown, max: number) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max) : "");

// The model's answer, kept only when the level is a whole number from 0 to 5 and
// the quote is really in the answer. The last try (`final`) accepts a quote that
// isn't there for a level that doesn't need evidence to be believed (a 4 or 5
// with nothing to show is not believed, so it drops to 3).
export function acceptOnTopic(raw: unknown, answer: string, options: { final?: boolean } = {}): { ok: true; value: OnTopicCheck } | { ok: false; problems: string[] } {
  const r = raw as { level?: unknown; quote?: unknown; note?: unknown } | null;
  const level = typeof r?.level === "number" && Number.isInteger(r.level) ? r.level : null;
  if (level == null || level < 0 || level > 5) return { ok: false, problems: ["level must be a whole number from 0 to 5."] };
  const quote = clean(r?.quote, 300);
  const note = clean(r?.note, 120);
  if (quote && quoteIn(quote, answer)) return { ok: true, value: { level, quote, note } };
  if (!options.final) return { ok: false, problems: ["The quote must be copied exactly from what they said, and it was not found there."] };
  // Out of tries: a low level stands on its own (nothing on the subject to quote);
  // a high one without evidence is capped, so it can never fail someone or praise
  // them on a guess.
  return { ok: true, value: { level: Math.min(level, 3), quote: "", note } };
}

// Level 0 or 1 is "not about it". Anything else lets the take through: the check
// is a safety net against nonsense, not a score.
export function topicFromLevel(level: number): TopicVerdict {
  return level <= 1 ? "off_topic" : "ok";
}
