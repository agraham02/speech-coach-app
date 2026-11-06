import { matchFillers, normalizeForWer, wordErrorRate } from "../eval/wer";
import type { LabCheck, LabOutcome, LabStep, LabTestEntry, StepMeasures } from "./types";

// The Clarity tests (docs/overhaul/PLAN.md, section 6.5, the "Clarity" rows of
// the test table): do fillers survive transcription, how do the recognizers
// compare, and is Whisper fast enough to score drills with.

// The engine real takes use for words (services/asr/asrEngines.ts).
const APP_ENGINE = "turbo-prompted";
// The OS recognizer, the nearest thing to what the live drills hear.
const LIVE_ENGINE = "system";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const nothing = (summary: string): LabOutcome => ({ pass: null, checks: [], summary, numbers: {} });

function verdict(checks: LabCheck[]): boolean | null {
  const decisive = checks.filter((c) => c.pass !== null);
  if (decisive.some((c) => c.pass === false)) return false;
  if (decisive.length > 0 && decisive.every((c) => c.pass === true)) return true;
  return null;
}

// --- Fillers ---------------------------------------------------------------

export const FILLER_SCRIPT =
  "So, um, today I want to talk about how we plan our week. Uh, the first thing is, um, to look at what really matters. " +
  "Then, uh, we pick three tasks and, um, we protect the time for them. After that, uh, we check in, um, at the end of the day. " +
  "And, uh, if something slips, um, we move it, and, uh, we carry on.";

const FILLER_BAR = 9;
const FILLER_EXPECTED = matchFillers(FILLER_SCRIPT, FILLER_SCRIPT).expected;

function evaluateFillers(measures: StepMeasures): LabOutcome {
  const m = measures.read;
  if (!m?.engines) return nothing("No transcription came back, so there is nothing to count.");
  const app = m.engines[APP_ENGINE];
  if (!app) return nothing("The app's transcriber didn't run (is the Whisper model downloaded?), so the test can't say.");
  const kept = matchFillers(FILLER_SCRIPT, app.text);
  const checks: LabCheck[] = [
    { label: "Fillers Whisper kept (the app's engine)", value: `${kept.kept} of ${kept.expected}`, pass: kept.kept >= FILLER_BAR, bar: `${FILLER_BAR} or more of ${FILLER_EXPECTED}` },
    { label: "Fillers Whisper invented", value: `${kept.invented}`, pass: null },
  ];
  const numbers: LabOutcome["numbers"] = { expected: kept.expected, kept: kept.kept, invented: kept.invented };
  for (const [id, out] of Object.entries(m.engines)) {
    if (id === APP_ENGINE) continue;
    const k = matchFillers(FILLER_SCRIPT, out.text);
    checks.push({ label: `${id}: fillers kept`, value: `${k.kept} of ${k.expected}`, pass: null });
    numbers[`kept_${id}`] = k.kept;
  }
  const live = m.engines[LIVE_ENGINE];
  const liveKept = live ? matchFillers(FILLER_SCRIPT, live.text).kept : null;
  const pass = verdict(checks);
  return {
    pass,
    checks,
    summary:
      pass === true
        ? `Whisper kept ${kept.kept} of ${kept.expected} fillers${liveKept != null ? `; the system recognizer kept ${liveKept}` : ""}.`
        : `Whisper kept only ${kept.kept} of ${kept.expected} fillers, so filler counts aren't safe yet; check the prompt.`,
    numbers,
  };
}

// --- Recognizer vs Whisper ---------------------------------------------------

export const COMPARE_PASSAGE =
  "The library opens at nine and closes at six on weekdays. On Saturdays it opens later, at ten, and the children's room has a story hour at eleven. " +
  "Members can borrow up to ten books at a time and keep them for three weeks.";

function evaluateCompare(measures: StepMeasures): LabOutcome {
  const m = measures.read;
  if (!m?.engines || Object.keys(m.engines).length === 0) return nothing("No transcription came back, so there is nothing to compare.");
  const checks: LabCheck[] = [];
  const numbers: LabOutcome["numbers"] = {};
  for (const [id, out] of Object.entries(m.engines)) {
    const wer = wordErrorRate(COMPARE_PASSAGE, out.text);
    checks.push({ label: `${id}: word errors`, value: pct(wer), pass: null });
    numbers[`wer_${id}`] = Math.round(wer * 1000) / 1000;
    numbers[`ms_${id}`] = out.ms;
  }
  const app = m.engines[APP_ENGINE];
  const live = m.engines[LIVE_ENGINE];
  const both = !!app && !!live;
  const appWer = app ? wordErrorRate(COMPARE_PASSAGE, app.text) : null;
  const liveWer = live ? wordErrorRate(COMPARE_PASSAGE, live.text) : null;
  let summary = "Word errors for each engine are in the checks.";
  if (appWer != null && liveWer != null) {
    summary =
      appWer < liveWer
        ? `Whisper made fewer word errors (${pct(appWer)}) than the system recognizer (${pct(liveWer)}), so scoring drills from Whisper is better.`
        : `The system recognizer did as well as Whisper (${pct(liveWer)} against ${pct(appWer)}); the case for re-transcribing drills is weaker.`;
  }
  // Information for a decision, so it passes once both engines ran.
  return { pass: both ? true : null, checks, summary, numbers };
}

// --- Whisper speed ------------------------------------------------------------

const SPEED_BAR_MS = 10_000;
const SPEED_CLIP_SECONDS = 30;

function evaluateSpeed(measures: StepMeasures): LabOutcome {
  const m = measures.clip;
  const app = m?.engines?.[APP_ENGINE];
  if (!m || !app) return nothing("Whisper didn't run (is the model downloaded?), so its speed wasn't measured.");
  const seconds = m.durationMs / 1000;
  if (seconds < 15) return nothing("The clip was too short to time (under 15 seconds).");
  // Scaled to a 30 s clip, so the bar means the same whatever you recorded.
  const per30 = app.ms / (m.durationMs / (SPEED_CLIP_SECONDS * 1000));
  const checks: LabCheck[] = [
    { label: "Whisper time for a 30 s clip", value: `${(per30 / 1000).toFixed(1)} s`, pass: per30 <= SPEED_BAR_MS, bar: `${SPEED_BAR_MS / 1000} s or less` },
    { label: "Clip length and Whisper time", value: `${seconds.toFixed(1)} s in ${(app.ms / 1000).toFixed(1)} s`, pass: null },
  ];
  const pass = verdict(checks);
  return {
    pass,
    checks,
    summary: pass ? `Whisper reads a 30 s clip in about ${(per30 / 1000).toFixed(1)} s, fast enough to score drills with.` : `Whisper needs about ${(per30 / 1000).toFixed(1)} s for a 30 s clip: drills would need a longer "Checking" state or to score afterwards.`,
    numbers: { clipSeconds: Math.round(seconds * 10) / 10, whisperMs: app.ms, per30Ms: Math.round(per30) },
  };
}

// --- Definitions ---------------------------------------------------------------

const readStep = (id: string, title: string, instruction: string, script: string, seconds: number): LabStep => ({ id, title, instruction, script, seconds, capture: "take", engines: true });

export const CLARITY_TESTS: LabTestEntry[] = [
  {
    def: {
      id: "clarity.fillers",
      group: "clarity",
      title: "Fillers",
      summary: "Read a script that has ten ums and uhs in it, saying every one aloud. Do they survive transcription?",
      minutes: 2,
      steps: [readStep("read", "Read it, ums and all", "Read the script at your normal pace and say every um and uh exactly as written.", FILLER_SCRIPT, 40)],
      bars: [`Whisper (the app's engine) keeps ${FILLER_BAR} or more of the ${FILLER_EXPECTED} fillers`, "What the system recognizer keeps is shown beside it"],
      onFail: "Fix the Whisper prompt before filler counts are trusted.",
    },
    evaluate: evaluateFillers,
  },
  {
    def: {
      id: "clarity.recognizer_vs_whisper",
      group: "clarity",
      title: "Recognizer vs Whisper",
      summary: "The same passage through each transcription engine, to see how many words each gets wrong.",
      minutes: 2,
      steps: [readStep("read", "Read the passage", "Read it clearly at your normal pace.", COMPARE_PASSAGE, 30)],
      bars: ["Word errors for each engine", "Decides whether drills are scored from Whisper (plan section 6.6)"],
      onFail: "Information only: the result decides the rule, so it can't fail.",
    },
    evaluate: evaluateCompare,
  },
  {
    def: {
      id: "clarity.whisper_speed",
      group: "clarity",
      title: "Whisper speed",
      summary: "How long Whisper takes on a clip of about 30 seconds on this phone.",
      minutes: 1,
      steps: [readStep("clip", "Talk for 30 seconds", "Talk about anything for 30 seconds.", "Talk about your morning, a place you like, or what you did last weekend.", SPEED_CLIP_SECONDS)],
      bars: [`Whisper reads a 30 s clip in ${SPEED_BAR_MS / 1000} s or less, so drills can use it`],
      onFail: 'Show a longer "Checking" state, or score the drill after it ends.',
    },
    evaluate: evaluateSpeed,
  },
];

// Pulled out so the tests can name the words the passages are made of.
export const CLARITY_PASSAGE_WORDS = {
  fillers: normalizeForWer(FILLER_SCRIPT).length,
  compare: normalizeForWer(COMPARE_PASSAGE).length,
};
