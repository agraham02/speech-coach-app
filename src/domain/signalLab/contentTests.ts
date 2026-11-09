import type { LabCheck, LabOutcome, LabTestEntry, StepMeasures } from "./types";
import { DEFAULT_LINK_THRESHOLDS, LINK_BARS, fitTopicBars, scoreGold, topicVerdict, tuneLinkThresholds } from "../meaning/meaning";
import { TOPIC_GOLD, WORD_CHAIN_LINKS } from "../meaning/gold";

// The Content tests (docs/overhaul/PLAN.md, section 6.5, the "Content" rows of
// the test table). The first two run the phone's meaning check (Apple's
// NLEmbedding, modules/tono-language) on its stored cases. The phone runs the
// same cases on itself before it lets any check move a score
// (services/language/meaningCheck.ts), so a pass here is what that self-test
// reports, with the numbers shown. The judge's accuracy needs the hosted eval
// plus about 30 takes you rate by hand.

const JUDGE_WAIT = "Needs the hosted judge eval (spikes/inference-eval) and about 30 takes you rate by hand.";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const none = (summary: string): LabOutcome => ({ pass: null, checks: [], summary, numbers: {} });

function wordLinks(measures: StepMeasures): LabOutcome {
  const meaning = measures.run?.meaning;
  const sims = meaning?.linkSims;
  if (!sims || sims.length !== WORD_CHAIN_LINKS.length) return none("The meaning check did not run, so there is nothing to say yet.");
  const { thresholds, result } = tuneLinkThresholds(WORD_CHAIN_LINKS, sims);
  const usingDefaults = thresholds === DEFAULT_LINK_THRESHOLDS;
  const checks: LabCheck[] = [
    { label: "Broken links caught", value: `${result.caught} of ${result.broken} (${pct(result.catchRate)})`, pass: result.catchRate >= LINK_BARS.catchAtLeast, bar: `${pct(LINK_BARS.catchAtLeast)} or more` },
    { label: "Real links wrongly failed", value: `${result.wronglyFailed} of ${result.good} (${pct(result.wrongRate)})`, pass: result.wrongRate <= LINK_BARS.wrongAtMost, bar: `under ${pct(LINK_BARS.wrongAtMost)}` },
    { label: "Links with both words known", value: `${WORD_CHAIN_LINKS.length - result.unchecked} of ${WORD_CHAIN_LINKS.length}`, pass: result.unchecked <= WORD_CHAIN_LINKS.length * 0.2, bar: "80% or more" },
    { label: "Cut used", value: `a link from ${thresholds.strong.toFixed(2)}, a stretch from ${thresholds.loose.toFixed(2)}${usingDefaults ? "" : " (tuned on this phone)"}`, pass: null },
  ];
  if (meaning?.category) checks.push({ label: "Words in a category", value: meaning.category.note, pass: null });
  const byDefaults = scoreGold(WORD_CHAIN_LINKS, sims, DEFAULT_LINK_THRESHOLDS);
  return {
    pass: result.passes,
    checks,
    summary: result.passes
      ? `Passes: it caught ${pct(result.catchRate)} of the broken links and failed ${pct(result.wrongRate)} of the real ones.`
      : `Does not pass: it caught ${pct(result.catchRate)} and wrongly failed ${pct(result.wrongRate)}. Word chain stays checked by Tono AI only.`,
    numbers: {
      catchRate: result.catchRate,
      wrongRate: result.wrongRate,
      unchecked: result.unchecked,
      loose: thresholds.loose,
      strong: thresholds.strong,
      defaultCatchRate: byDefaults.catchRate,
      defaultWrongRate: byDefaults.wrongRate,
    },
  };
}

function onTopic(measures: StepMeasures): LabOutcome {
  const readings = measures.run?.meaning?.topicReadings;
  if (!readings || readings.length !== TOPIC_GOLD.length) return none("The meaning check did not run, so there is nothing to say yet.");
  const fit = fitTopicBars(TOPIC_GOLD, readings);
  const checks: LabCheck[] = [{ label: "Separates on-topic from off-topic", value: fit.note, pass: fit.ok, bar: "a gap of 0.08 or more" }];
  const numbers: LabOutcome["numbers"] = { ok: fit.ok };
  if (fit.bars) {
    const bars = fit.bars;
    const verdicts = TOPIC_GOLD.map((c, i) => ({ c, v: readings[i] ? topicVerdict(readings[i]!, bars) : null }));
    const real = verdicts.filter((x) => x.c.kind === "on");
    const flaggedReal = real.filter((x) => x.v !== "ok").length;
    const wrong = verdicts.filter((x) => x.c.kind !== "on");
    const caught = wrong.filter((x) => x.v !== "ok").length;
    checks.push(
      { label: "Real answers flagged", value: `${flaggedReal} of ${real.length}`, pass: flaggedReal === 0, bar: "none" },
      { label: "Off-topic and gibberish flagged", value: `${caught} of ${wrong.length}`, pass: caught === wrong.length, bar: "all" },
      { label: "Lines", value: `off-topic under ${bars.offTopicBelow.toFixed(2)}${bars.incoherentBelow != null ? `, disconnected sentences under ${bars.incoherentBelow.toFixed(2)}` : ", no line for disconnected sentences"}`, pass: null },
    );
    numbers.offTopicBelow = bars.offTopicBelow;
    numbers.incoherentBelow = bars.incoherentBelow;
    numbers.flaggedReal = flaggedReal;
    numbers.caught = caught;
  }
  const pass = checks.filter((c) => c.pass !== null).every((c) => c.pass);
  return {
    pass,
    checks,
    summary: pass ? "Passes: it flags the off-topic answers and the gibberish and never a real answer." : "Does not pass. Takes stay unchecked for topic on this phone, and Tono AI judges it instead.",
    numbers,
  };
}

export const CONTENT_TESTS: LabTestEntry[] = [
  {
    def: {
      id: "content.word_links",
      group: "content",
      title: "Word links",
      summary: "The gold set of Word Chain cases (spikes/inference-eval/cases_synthetic.json plus more), run on the phone.",
      minutes: 1,
      steps: [{ id: "run", title: "Run the cases", instruction: "Runs the Word Chain gold set through this phone's meaning check. Nothing to say or do.", seconds: 1, capture: "none", meaning: "word_links" }],
      bars: ["Catches 80% or more of the broken links", "Wrongly fails under 10%"],
      onFail: "Fall back to the small content check on the server.",
    },
    evaluate: wordLinks,
  },
  {
    def: {
      id: "content.on_topic",
      group: "content",
      title: "On topic",
      summary: "Real answers, off-topic answers and gibberish for four prompts, to see what the phone's meaning check flags.",
      minutes: 1,
      steps: [{ id: "run", title: "Run the cases", instruction: "Runs twelve answers through this phone's meaning check. Nothing to say or do.", seconds: 1, capture: "none", meaning: "on_topic" }],
      bars: ["Flags the off-topic answers and the gibberish", "Never flags a real answer"],
      onFail: "Fall back to the small content check on the server.",
    },
    evaluate: onTopic,
  },
  {
    def: {
      id: "content.judge",
      group: "content",
      title: "Judge",
      summary: "The hosted judge eval plus about 30 takes you rate by hand, run twice.",
      minutes: 15,
      steps: [],
      bars: ["Two runs land within one rubric level of each other at least 90% of the time"],
      onFail: "Fix the prompt, or try another model.",
      blockedBy: JUDGE_WAIT,
    },
    evaluate: () => none(JUDGE_WAIT),
  },
];
