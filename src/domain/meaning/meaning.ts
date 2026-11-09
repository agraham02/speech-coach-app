// The phone's meaning check (docs/overhaul/PLAN.md, section 6.6, level 1): how
// close two words or two passages are, by Apple's built-in embeddings. These are
// the pure rules on top of a similarity number. Nothing here trusts a number it
// hasn't been tested with: the phone runs the gold set below on itself before any
// check is allowed to move a score (services/language/meaningCheck.ts).

export type LinkVerdict = "strong" | "loose" | "none";

export interface LinkThresholds {
  // At or above: a clear link. Between the two: a stretch. Under `loose`: no link.
  strong: number;
  loose: number;
}

// First guesses for Apple's word vectors; the self-test tunes them on the phone.
export const DEFAULT_LINK_THRESHOLDS: LinkThresholds = { strong: 0.5, loose: 0.3 };

// Plan 6.5, the Word links test: catch broken links, don't fail real ones.
export const LINK_BARS = { catchAtLeast: 0.8, wrongAtMost: 0.1 };

export function linkVerdict(similarity: number, t: LinkThresholds): LinkVerdict {
  return similarity >= t.strong ? "strong" : similarity >= t.loose ? "loose" : "none";
}

// ---------------------------------------------------------------------------
// The gold set: spikes/inference-eval/cases_synthetic.json, word_chain
// ---------------------------------------------------------------------------

export interface GoldLink {
  from: string;
  to: string;
  // One verdict, or two joined by "|" when either is acceptable.
  gold: string;
}

export function goldLinks(cases: { words: string[]; gold: string[] }[]): GoldLink[] {
  const out: GoldLink[] = [];
  for (const c of cases) {
    c.gold.forEach((gold, i) => {
      if (c.words[i] != null && c.words[i + 1] != null) out.push({ from: c.words[i], to: c.words[i + 1], gold });
    });
  }
  return out;
}

export interface GoldResult {
  broken: number;
  caught: number;
  good: number;
  wronglyFailed: number;
  unchecked: number;
  catchRate: number;
  wrongRate: number;
  passes: boolean;
}

// `sims[i]` is the similarity of `links[i]`, or null when a word had no vector.
export function scoreGold(links: GoldLink[], sims: (number | null)[], t: LinkThresholds): GoldResult {
  let broken = 0;
  let caught = 0;
  let good = 0;
  let wronglyFailed = 0;
  let unchecked = 0;
  links.forEach((link, i) => {
    const sim = sims[i];
    if (sim == null) {
      unchecked += 1;
      return;
    }
    const verdict = linkVerdict(sim, t);
    if (link.gold === "none") {
      broken += 1;
      if (verdict === "none") caught += 1;
    } else if (link.gold === "strong") {
      good += 1;
      if (verdict === "none") wronglyFailed += 1;
    }
  });
  const catchRate = broken ? caught / broken : 1;
  const wrongRate = good ? wronglyFailed / good : 0;
  const checked = links.length - unchecked;
  return {
    broken,
    caught,
    good,
    wronglyFailed,
    unchecked,
    catchRate,
    wrongRate,
    // Too many words without a vector can't pass: "not checked", never a pass.
    passes: checked >= links.length * 0.8 && catchRate >= LINK_BARS.catchAtLeast && wrongRate <= LINK_BARS.wrongAtMost,
  };
}

// The thresholds that do best on the gold set: the defaults when they pass,
// otherwise a sweep for the cut that catches the most without failing real links.
export function tuneLinkThresholds(links: GoldLink[], sims: (number | null)[]): { thresholds: LinkThresholds; result: GoldResult } {
  const defaults = scoreGold(links, sims, DEFAULT_LINK_THRESHOLDS);
  if (defaults.passes) return { thresholds: DEFAULT_LINK_THRESHOLDS, result: defaults };
  let best = { thresholds: DEFAULT_LINK_THRESHOLDS, result: defaults, value: -Infinity };
  for (let loose = 0.05; loose <= 0.7; loose += 0.025) {
    const thresholds = { loose: Math.round(loose * 1000) / 1000, strong: Math.round((loose + 0.2) * 1000) / 1000 };
    const result = scoreGold(links, sims, thresholds);
    const value = (result.passes ? 10 : 0) + result.catchRate - 2 * result.wrongRate;
    if (value > best.value) best = { thresholds, result, value };
  }
  return { thresholds: best.thresholds, result: best.result };
}

// ---------------------------------------------------------------------------
// Words that belong to a group ("table" isn't an animal)
// ---------------------------------------------------------------------------

// A word fits a category when it sits at least this close to the category's name.
// Set on the phone from the category cases (services/language/meaningCheck.ts).
export const DEFAULT_CATEGORY_BAR = 0.3;

// ---------------------------------------------------------------------------
// A take about its prompt
// ---------------------------------------------------------------------------

// Sentences of a transcript, at most `max`, short fragments joined to the next.
export function sentencesOf(text: string, max = 12): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let carry = "";
  for (const part of parts) {
    const joined = carry ? `${carry} ${part}` : part;
    if (joined.split(" ").length < 4) carry = joined;
    else {
      out.push(joined);
      carry = "";
    }
  }
  if (carry) out.push(out.length ? `${out.pop()} ${carry}` : carry);
  // Live recognition has no full stops: cut a long run of words into pieces.
  const words = text.trim().split(/\s+/);
  if (out.length < 3 && words.length >= 30) {
    const pieces: string[] = [];
    for (let i = 0; i < words.length; i += 14) pieces.push(words.slice(i, i + 14).join(" "));
    if (pieces.length > 1 && pieces[pieces.length - 1].split(" ").length < 6) pieces.push(`${pieces.splice(-2).join(" ")}`);
    return pieces.slice(0, max);
  }
  return out.slice(0, max);
}

export function meanVector(vectors: number[][]): number[] | null {
  const usable = vectors.filter((v) => v.length > 0);
  if (!usable.length || usable.some((v) => v.length !== usable[0].length)) return null;
  const sum = new Array<number>(usable[0].length).fill(0);
  for (const v of usable) for (let i = 0; i < v.length; i++) sum[i] += v[i];
  return sum.map((x) => x / usable.length);
}

export interface TopicCase {
  prompt: string;
  answer: string;
  kind: "on" | "off" | "gibberish";
}

export interface TopicReading {
  // Answer against prompt, and neighbouring sentences against each other.
  onTopic: number;
  coherence: number | null;
}

export interface TopicBars {
  // Under this a take isn't about its prompt.
  offTopicBelow: number;
  // Under this the sentences have nothing to do with each other.
  incoherentBelow: number | null;
}

export interface TopicFit {
  ok: boolean;
  bars: TopicBars | null;
  note: string;
}

const MIN_GAP = 0.08;
// Nearer the off-topic side: wrongly failing a real answer costs more than letting
// a weak one through ("never flags a real answer", plan 6.5).
const CAUTION = 0.3;

// Whether the phone can tell on-topic from off-topic and nonsense on these cases,
// and where to draw the line if it can.
export function fitTopicBars(cases: TopicCase[], readings: (TopicReading | null)[]): TopicFit {
  const on: number[] = [];
  const off: number[] = [];
  const onCoherence: number[] = [];
  const gibberishCoherence: number[] = [];
  cases.forEach((c, i) => {
    const r = readings[i];
    if (!r) return;
    if (c.kind === "on") {
      on.push(r.onTopic);
      if (r.coherence != null) onCoherence.push(r.coherence);
    } else {
      off.push(r.onTopic);
      if (c.kind === "gibberish" && r.coherence != null) gibberishCoherence.push(r.coherence);
    }
  });
  if (on.length < 3 || off.length < 3) return { ok: false, bars: null, note: "Not enough of the topic cases could be read." };
  const lowestOn = Math.min(...on);
  const highestOff = Math.max(...off);
  if (lowestOn - highestOff < MIN_GAP) return { ok: false, bars: null, note: `On-topic answers (lowest ${lowestOn.toFixed(2)}) don't separate from off-topic ones (highest ${highestOff.toFixed(2)}).` };
  const offTopicBelow = highestOff + (lowestOn - highestOff) * CAUTION;
  let incoherentBelow: number | null = null;
  if (onCoherence.length >= 3 && gibberishCoherence.length >= 2) {
    const lowestOnCoherence = Math.min(...onCoherence);
    const highestGibberish = Math.max(...gibberishCoherence);
    if (lowestOnCoherence - highestGibberish >= MIN_GAP) incoherentBelow = highestGibberish + (lowestOnCoherence - highestGibberish) * CAUTION;
  }
  return { ok: true, bars: { offTopicBelow, incoherentBelow }, note: `On-topic from ${lowestOn.toFixed(2)}, off-topic up to ${highestOff.toFixed(2)}; the line is ${offTopicBelow.toFixed(2)}.` };
}

export type TopicVerdict = "ok" | "off_topic" | "incoherent";

export function topicVerdict(reading: TopicReading, bars: TopicBars): TopicVerdict {
  if (bars.incoherentBelow != null && reading.coherence != null && reading.coherence < bars.incoherentBelow) return "incoherent";
  return reading.onTopic < bars.offTopicBelow ? "off_topic" : "ok";
}
