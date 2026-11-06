import type { LabOutcome, LabTestEntry } from "./types";

// The Content tests (docs/overhaul/PLAN.md, section 6.5, the "Content" rows of
// the test table). They can't run yet: the phone's meaning check (Apple's
// NLEmbedding) is built in phase 3b, and the judge's accuracy needs the hosted
// eval plus about 30 takes you rate by hand. They are listed so the lab shows
// what is still to prove, and each says what it is waiting for.

const waiting = (reason: string) => (): LabOutcome => ({ pass: null, checks: [], summary: reason, numbers: {} });

const WORD_LINKS_WAIT = "Needs the phone's meaning check (phase 3b) before it can run.";
const JUDGE_WAIT = "Needs the hosted judge eval (spikes/inference-eval) and about 30 takes you rate by hand.";

export const CONTENT_TESTS: LabTestEntry[] = [
  {
    def: {
      id: "content.word_links",
      group: "content",
      title: "Word links",
      summary: "The gold set of Word Chain cases in spikes/inference-eval/cases_synthetic.json, run on the phone.",
      minutes: 1,
      steps: [],
      bars: ["Catches 80% or more of the broken links", "Wrongly fails under 10%"],
      onFail: "Fall back to the small content check on the server.",
      blockedBy: WORD_LINKS_WAIT,
    },
    evaluate: waiting(WORD_LINKS_WAIT),
  },
  {
    def: {
      id: "content.on_topic",
      group: "content",
      title: "On topic",
      summary: "Real answers, off-topic answers and gibberish, to see what the phone's meaning check flags.",
      minutes: 1,
      steps: [],
      bars: ["Flags the off-topic answers and the gibberish", "Never flags a real answer"],
      onFail: "Fall back to the small content check on the server.",
      blockedBy: WORD_LINKS_WAIT,
    },
    evaluate: waiting(WORD_LINKS_WAIT),
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
    evaluate: waiting(JUDGE_WAIT),
  },
];
