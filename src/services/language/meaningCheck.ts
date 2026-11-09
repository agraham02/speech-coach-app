import { embed, embeddingAvailable } from "../../../modules/tono-language";
import { cosine, similarity } from "./embeddings";
import {
  DEFAULT_CATEGORY_BAR,
  fitTopicBars,
  linkVerdict,
  meanVector,
  sentencesOf,
  topicVerdict,
  tuneLinkThresholds,
  type GoldResult,
  type LinkThresholds,
  type TopicBars,
  type TopicFit,
  type TopicReading,
  type TopicVerdict,
} from "../../domain/meaning/meaning";
import { CATEGORY_ANCHORS, CATEGORY_GOLD, TOPIC_GOLD, WORD_CHAIN_LINKS } from "../../domain/meaning/gold";
import type { ChainPair, JudgedLink, WordChainJudgement } from "../../domain/drills/chainJudging";
import { logger } from "../../utils/logger";

// The phone's meaning checks, switched on only for what this phone has shown it
// can do. Apple gives no accuracy figures for its embeddings (plan 6.6), so the
// first time a check is wanted the phone runs the gold set on itself: word links,
// words in a category, and answers against their prompts. A check that fails its
// own test is simply "not checked", never a guess that moves a score. Android and
// builds without the module can't check anything, which is the same answer.

export interface LinkCheck {
  ready: boolean;
  thresholds: LinkThresholds;
  result: GoldResult | null;
}

export interface CategoryCheck {
  ready: boolean;
  bar: number;
  note: string;
}

export interface TopicCheck extends TopicFit {
  ready: boolean;
}

export interface MeaningCheck {
  available: boolean;
  links: LinkCheck;
  category: CategoryCheck;
  topic: TopicCheck;
}

const NONE: MeaningCheck = {
  available: false,
  links: { ready: false, thresholds: { strong: 0.5, loose: 0.3 }, result: null },
  category: { ready: false, bar: DEFAULT_CATEGORY_BAR, note: "No meaning check on this phone." },
  topic: { ready: false, ok: false, bars: null, note: "No meaning check on this phone." },
};

async function runLinks(): Promise<LinkCheck> {
  const sims = await Promise.all(WORD_CHAIN_LINKS.map((l) => similarity("word", l.from, l.to)));
  const { thresholds, result } = tuneLinkThresholds(WORD_CHAIN_LINKS, sims);
  return { ready: result.passes, thresholds, result };
}

// A category's words must sit nearer its name than the words that don't belong.
async function runCategory(): Promise<CategoryCheck> {
  const yes: number[] = [];
  const no: number[] = [];
  for (const c of CATEGORY_GOLD) {
    const anchor = CATEGORY_ANCHORS[c.category];
    if (!anchor) continue;
    for (const w of c.yes) {
      const s = await similarity("word", w, anchor);
      if (s != null) yes.push(s);
    }
    for (const w of c.no) {
      const s = await similarity("word", w, anchor);
      if (s != null) no.push(s);
    }
  }
  if (yes.length < 15 || no.length < 15) return { ready: false, bar: DEFAULT_CATEGORY_BAR, note: "Too many of the test words had no vector." };
  const yesLow = quantile(yes, 0.1);
  const noHigh = quantile(no, 0.9);
  // The line sits nearer the wrong words: wrongly failing a real animal costs more
  // than letting an odd word through. It passes when the groups hardly overlap.
  const bar = noHigh + (yesLow - noHigh) * 0.4;
  const caught = no.filter((s) => s < bar).length / no.length;
  const wrong = yes.filter((s) => s < bar).length / yes.length;
  return { ready: caught >= 0.8 && wrong <= 0.1, bar, note: `Catches ${Math.round(caught * 100)}% of wrong words, wrongly fails ${Math.round(wrong * 100)}% of right ones (line ${bar.toFixed(2)}).` };
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

export async function readTopic(prompt: string, answer: string): Promise<TopicReading | null> {
  const parts = sentencesOf(answer);
  if (!prompt.trim() || !parts.length) return null;
  const [promptVector, ...vectors] = await Promise.all([embed("sentence", prompt), ...parts.map((p) => embed("sentence", p))]);
  const usable = vectors.filter((v): v is number[] => v != null);
  const mean = meanVector(usable);
  if (!promptVector || !mean) return null;
  const onTopic = cosine(promptVector, mean);
  if (onTopic == null) return null;
  let coherence: number | null = null;
  if (usable.length >= 3) {
    const pairs: number[] = [];
    for (let i = 1; i < usable.length; i++) {
      const c = cosine(usable[i - 1], usable[i]);
      if (c != null) pairs.push(c);
    }
    coherence = pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : null;
  }
  return { onTopic, coherence };
}

async function runTopic(): Promise<TopicCheck> {
  const readings = await Promise.all(TOPIC_GOLD.map((c) => readTopic(c.prompt, c.answer)));
  const fit = fitTopicBars(TOPIC_GOLD, readings);
  return { ...fit, ready: fit.ok };
}

let pending: Promise<MeaningCheck> | null = null;

// Runs once per launch (a second or less) and remembers the answer.
export function meaningCheck(): Promise<MeaningCheck> {
  pending ??= (async () => {
    try {
      if (!(await embeddingAvailable("word"))) return NONE;
      const sentence = await embeddingAvailable("sentence");
      const [links, category, topic] = await Promise.all([runLinks(), runCategory(), sentence ? runTopic() : Promise.resolve(NONE.topic)]);
      logger.info(`[meaning] links ${links.ready ? "ready" : "off"}, category ${category.ready ? "ready" : "off"}, topic ${topic.ready ? "ready" : "off"}`);
      return { available: true, links, category, topic };
    } catch (error) {
      logger.warn(`[meaning] self-test failed — ${(error as Error).message}`);
      return NONE;
    }
  })();
  return pending;
}

// Forget the answer (the Signal Lab test re-runs it).
export function resetMeaningCheck(): void {
  pending = null;
}

// ---------------------------------------------------------------------------
// What the drills and takes ask
// ---------------------------------------------------------------------------

// Word chain: a verdict per link, by the phone. Null when the phone can't check
// well enough: the module is missing, its self-test failed, or too few of the
// words had a vector. Words with no vector are left out, not failed.
const MIN_CHECKABLE = 0.6;

export async function phoneJudgeChain(pairs: ChainPair[]): Promise<WordChainJudgement | null> {
  if (!pairs.length) return null;
  const check = await meaningCheck();
  if (!check.links.ready) return null;
  const sims = await Promise.all(pairs.map((p) => similarity("word", p.from, p.to)));
  const links: JudgedLink[] = [];
  pairs.forEach((p, i) => {
    const sim = sims[i];
    if (sim != null) links.push({ ...p, verdict: linkVerdict(sim, check.links.thresholds), reason: "" });
  });
  return links.length >= pairs.length * MIN_CHECKABLE ? { links } : null;
}

// Category sprint: which of the words belong. Null words can't be checked and are
// left out of both lists. The whole check is null when this phone can't do it.
export async function checkCategoryWords(words: string[], categoryId: string): Promise<{ fits: string[]; misfits: string[] } | null> {
  const anchor = CATEGORY_ANCHORS[categoryId];
  // Only the categories the self-test covered: a word's closeness to a weak anchor
  // ("rain" to "weather") says little, and a right word must never be dropped on it.
  if (!anchor || !words.length || !CATEGORY_GOLD.some((c) => c.category === categoryId)) return null;
  const check = await meaningCheck();
  if (!check.category.ready) return null;
  const sims = await Promise.all(words.map((w) => similarity("word", w, anchor)));
  const fits: string[] = [];
  const misfits: string[] = [];
  let checked = 0;
  words.forEach((w, i) => {
    const sim = sims[i];
    if (sim == null) return;
    checked += 1;
    (sim >= check.category.bar ? fits : misfits).push(w);
  });
  return checked >= words.length * MIN_CHECKABLE ? { fits, misfits } : null;
}

// Whether the sentences of a drill hang together (Sixty seconds, Random-word story).
// Only the "incoherent" answer is acted on. Null when the phone can't tell.
export async function checkCoherence(text: string): Promise<TopicVerdict | null> {
  const check = await meaningCheck();
  const below = check.topic.bars?.incoherentBelow;
  if (!check.topic.ready || below == null) return null;
  const vectors = (await Promise.all(sentencesOf(text).map((s) => embed("sentence", s)))).filter((v): v is number[] => v != null);
  if (vectors.length < 3) return null;
  const sims: number[] = [];
  for (let i = 1; i < vectors.length; i++) {
    const c = cosine(vectors[i - 1], vectors[i]);
    if (c != null) sims.push(c);
  }
  if (!sims.length) return null;
  return sims.reduce((a, b) => a + b, 0) / sims.length < below ? "incoherent" : "ok";
}

// A take about its prompt: ok, or why not. Null when the phone can't tell.
export async function checkTopic(prompt: string, answer: string): Promise<TopicVerdict | null> {
  const check = await meaningCheck();
  if (!check.topic.ready || !check.topic.bars) return null;
  const reading = await readTopic(prompt, answer);
  return reading ? topicVerdict(reading, check.topic.bars as TopicBars) : null;
}
