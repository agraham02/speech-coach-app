import { contentWordKey } from "../dsp/volumePauses";
import { quoteIn, wordsOf } from "../analysis/quotes";

// Judging Word Chain and Bridge Chain (docs/decisions/exercise-judging.md).
// The phone hears the words and splits them into the chain; Tono AI says
// whether each link makes sense; the phone checks the answer is complete and
// grounded, and scores it. Pure.

// ---------------------------------------------------------------------------
// The chain, split into the pieces that restart on a fresh word
// ---------------------------------------------------------------------------

// A Word Chain run between two start words: the start word shown, then the
// words said after it (a repeat of an earlier word, or a start word, isn't a
// new link). Each word links to the one before it; the first to the start.
export interface ChainSegment {
  seed: string;
  words: string[];
}

// A Bridge Chain run: the start word shown, and everything said after it.
export interface BridgeSegment {
  seed: string;
  said: string;
}

// The most links judged in one attempt: level 10 asks for 25 in a minute.
export const MAX_JUDGED_LINKS = 60;
export const MAX_BRIDGE_STEPS = 40;

// Where each start word's run begins in the heard words (`starts[i]` for
// `seeds[i]`), tolerant of a final transcript a little shorter than the live
// one the starts were noted on.
function boundaries(count: number, starts: number[], seeds: number): number[] {
  const out: number[] = [];
  let previous = 0;
  for (let i = 0; i < seeds; i++) {
    const at = i === 0 ? 0 : Math.min(count, Math.max(previous, starts[i] ?? count));
    out.push(at);
    previous = at;
  }
  return out;
}

export function chainSegments(tokens: string[], starts: number[], seeds: string[]): ChainSegment[] {
  if (!seeds.length) return [];
  const seen = new Set(seeds.map((w) => contentWordKey(w)).filter((k): k is string => k !== null));
  const at = boundaries(tokens.length, starts, seeds.length);
  const segments: ChainSegment[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const words: string[] = [];
    for (const t of tokens.slice(at[i], at[i + 1] ?? tokens.length)) {
      const key = contentWordKey(t);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      words.push(t.toLowerCase().replace(/[^a-z'-]/g, ""));
    }
    if (words.length) segments.push({ seed: seeds[i], words });
  }
  return segments;
}

export function bridgeSegments(tokens: string[], starts: number[], seeds: string[]): BridgeSegment[] {
  if (!seeds.length) return [];
  const at = boundaries(tokens.length, starts, seeds.length);
  const segments: BridgeSegment[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const said = tokens.slice(at[i], at[i + 1] ?? tokens.length).join(" ").trim();
    if (said) segments.push({ seed: seeds[i], said });
  }
  return segments;
}

export interface ChainPair {
  n: number;
  from: string;
  to: string;
}

// Every consecutive pair to judge, numbered across the whole attempt.
export function chainPairs(segments: ChainSegment[]): ChainPair[] {
  const pairs: ChainPair[] = [];
  for (const segment of segments) {
    let from = segment.seed;
    for (const to of segment.words) {
      if (pairs.length >= MAX_JUDGED_LINKS) return pairs;
      pairs.push({ n: pairs.length + 1, from, to });
      from = to;
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Word Chain: a verdict per link
// ---------------------------------------------------------------------------

export type LinkVerdict = "strong" | "loose" | "none";

export interface JudgedLink extends ChainPair {
  verdict: LinkVerdict;
  reason: string;
}

export interface WordChainJudgement {
  links: JudgedLink[];
}

// A clear link counts fully, a stretch counts half, no link counts nothing.
export const LINK_CREDIT: Record<LinkVerdict, number> = { strong: 1, loose: 0.5, none: 0 };

const LINK_VERDICTS = new Set<string>(["strong", "loose", "none"]);

function clean(text: unknown, max: number): string {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// The model's answer, kept only when it covers every pair asked about. The
// words in each link are the phone's own (never the model's rewording).
export function acceptWordChain(raw: unknown, pairs: ChainPair[]): { ok: true; value: WordChainJudgement } | { ok: false; problems: string[] } {
  const list = (raw as { links?: unknown } | null)?.links;
  if (!Array.isArray(list)) return { ok: false, problems: ['The answer must be {"links": [...]}.'] };
  const byN = new Map<number, { verdict?: unknown; reason?: unknown }>();
  for (const entry of list) {
    const e = entry as { n?: unknown; verdict?: unknown; reason?: unknown };
    if (typeof e?.n === "number" && !byN.has(e.n)) byN.set(e.n, e);
  }
  const missing: number[] = [];
  const links: JudgedLink[] = [];
  for (const pair of pairs) {
    const e = byN.get(pair.n);
    if (!e) {
      missing.push(pair.n);
      continue;
    }
    if (typeof e.verdict !== "string" || !LINK_VERDICTS.has(e.verdict)) return { ok: false, problems: [`Link ${pair.n} needs a verdict of strong, loose or none.`] };
    links.push({ ...pair, verdict: e.verdict as LinkVerdict, reason: clean(e.reason, 100) });
  }
  if (missing.length) return { ok: false, problems: [`You left out link number ${missing.slice(0, 5).join(", ")}. Return exactly one entry for each of the ${pairs.length} pairs.`] };
  return { ok: true, value: { links } };
}

export interface LinkTally {
  strong: number;
  loose: number;
  none: number;
  credit: number;
}

export function tallyLinks(links: JudgedLink[]): LinkTally {
  const t = { strong: 0, loose: 0, none: 0, credit: 0 };
  for (const l of links) {
    t[l.verdict] += 1;
    t.credit += LINK_CREDIT[l.verdict];
  }
  return t;
}

// ---------------------------------------------------------------------------
// Bridge Chain: a verdict per explained step
// ---------------------------------------------------------------------------

export type BridgeVerdict = "explained" | "thin" | "unexplained";

export interface BridgeStep {
  n: number;
  // The word moved to, as heard.
  word: string;
  // The reason, copied from what was said ("" when none was given).
  reason: string;
  verdict: BridgeVerdict;
  note: string;
}

export interface BridgeChainJudgement {
  steps: BridgeStep[];
}

export const BRIDGE_CREDIT: Record<BridgeVerdict, number> = { explained: 1, thin: 0.5, unexplained: 0 };

const BRIDGE_VERDICTS = new Set<string>(["explained", "thin", "unexplained"]);

// The model's steps, kept only where they are grounded: the word must have
// been said, and a reason must be what was said word for word. A reason that
// isn't (or a step whose word wasn't said) can't be counted as explained.
export function acceptBridgeChain(raw: unknown, segments: BridgeSegment[]): { ok: true; value: BridgeChainJudgement } | { ok: false; problems: string[] } {
  const list = (raw as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(list)) return { ok: false, problems: ['The answer must be {"steps": [...]}.'] };
  const said = segments.map((s) => s.said).join(" ");
  const spokenWords = new Set(wordsOf(said).map((w) => contentWordKey(w) ?? w));
  const steps: BridgeStep[] = [];
  for (const entry of list) {
    const e = entry as { word?: unknown; reason?: unknown; verdict?: unknown; note?: unknown };
    const word = clean(e?.word, 40);
    if (!word || typeof e.verdict !== "string" || !BRIDGE_VERDICTS.has(e.verdict)) continue;
    const key = wordsOf(word)
      .map((w) => contentWordKey(w) ?? w)
      .find(Boolean);
    // Not a word that was said: the model made the step up.
    if (!key || !spokenWords.has(key)) continue;
    if (steps.length >= MAX_BRIDGE_STEPS) break;
    let verdict = e.verdict as BridgeVerdict;
    let reason = clean(e.reason, 160);
    if (verdict === "unexplained") reason = "";
    else if (!reason || !quoteIn(reason, said)) {
      // Claimed a reason the speaker didn't say: at most half credit.
      reason = "";
      verdict = "thin";
    }
    steps.push({ n: steps.length + 1, word, reason, verdict, note: clean(e.note, 100) });
  }
  const spoken = wordsOf(said).length;
  if (!steps.length && spoken >= 8) return { ok: false, problems: ["You returned no steps, but the speaker said several words. List each word they moved to."] };
  return { ok: true, value: { steps } };
}

export interface BridgeTally {
  explained: number;
  thin: number;
  unexplained: number;
  credit: number;
}

export function tallyBridges(steps: BridgeStep[]): BridgeTally {
  const t = { explained: 0, thin: 0, unexplained: 0, credit: 0 };
  for (const s of steps) {
    t[s.verdict] += 1;
    t.credit += BRIDGE_CREDIT[s.verdict];
  }
  return t;
}

