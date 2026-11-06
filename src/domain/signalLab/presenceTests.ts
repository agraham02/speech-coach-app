import { SETTLE_MS } from "../dev/faceLab";
import { faceMovement, type FaceEventKind } from "../faceMovement";
import { groupLooks } from "../lookGroups";
import { classifyLook, computePresenceMetrics, type PresenceSample } from "../presenceMetrics";
import type { LabCheck, LabOutcome, LabStep, LabTestEntry, StepMeasures } from "./types";

// The Presence tests (docs/overhaul/PLAN.md, section 6.5, the "Presence" rows
// of the test table). Each entry is a definition plus a pure evaluator; the
// runner records the steps, and registry.ts lists them in the lab.
//
// Face timelines in a step's measure are in step time (tMs counts from the
// start of the step), the same clock as the cues. The first SETTLE_MS of each
// step is skipped: the eyes are still moving there.

// Less than this much settled data (2 s at 20 Hz) can't say anything.
const MIN_SAMPLES = 40;
// A bar on the number of looking samples to be right, in percent.
const LOOKING_BAR = 85;
const GLANCE_ON_LENS_BAR = 90;
const STILL_MAX = 8;
const EVENT_SHARE_BAR = 80;
// An event this close to its cue counts as on cue.
const CUE_WINDOW_MS = 1000;
// A difference in the looking share this big, between the lens and your own
// preview, means the cut-offs tell the two apart.
const PREVIEW_APART_POINTS = 25;

const round1 = (v: number) => Math.round(v * 10) / 10;
const pctText = (v: number) => `${round1(v)}%`;

function settled(face: PresenceSample[] | undefined): PresenceSample[] | null {
  if (!face) return null;
  const rest = face.filter((s) => s.tMs >= SETTLE_MS);
  return rest.length >= MIN_SAMPLES ? rest : null;
}

// The plain per-sample figure: how many samples classifyLook calls looking.
// A missing face is not looking.
function lookingPercent(face: PresenceSample[]): number {
  const hasGaze = face.some((s) => s.present && s.gazeX !== undefined);
  const looking = face.filter((s) => classifyLook(s, undefined, hasGaze).looking).length;
  return (looking / face.length) * 100;
}

// false as soon as one required check fails; null while any is undecided;
// true only when there is something to decide and all of it passed.
function verdict(required: LabCheck[]): boolean | null {
  if (required.some((c) => c.pass === false)) return false;
  if (required.length === 0 || required.some((c) => c.pass === null)) return null;
  return true;
}

function notCaptured(label: string, bar: string): LabCheck {
  return { label, value: "not captured (too little data)", pass: null, bar };
}

// ---- presence.looking ----------------------------------------------------

const LOOKING_STEPS: { id: string; title: string; instruction: string; label: string; expectLooking: boolean }[] = [
  { id: "lens", title: "Look at the lens", instruction: "Hold the phone as you would for a take and look straight at the camera lens. Keep your face in the frame.", label: "At the lens", expectLooking: true },
  { id: "notes", title: "Look at your notes", instruction: "Look down at notes held just below the phone, as if reading them.", label: "At your notes (down)", expectLooking: false },
  { id: "ceiling", title: "Look at the ceiling", instruction: "Look up at the ceiling, as if searching for the next word.", label: "At the ceiling (up)", expectLooking: false },
  { id: "side", title: "Look to the side", instruction: "Look at something to one side of the phone, without turning the phone.", label: "To the side", expectLooking: false },
];

function evaluateLooking(measures: StepMeasures): LabOutcome {
  const bar = `at least ${LOOKING_BAR}% classified right`;
  const checks: LabCheck[] = [];
  const numbers: LabOutcome["numbers"] = {};
  for (const step of LOOKING_STEPS) {
    const face = settled(measures[step.id]?.face);
    if (!face) {
      checks.push(notCaptured(step.label, bar));
      numbers[`${step.id}RightPercent`] = null;
      numbers[`${step.id}Samples`] = 0;
      continue;
    }
    const looking = lookingPercent(face);
    const right = step.expectLooking ? looking : 100 - looking;
    numbers[`${step.id}RightPercent`] = round1(right);
    numbers[`${step.id}Samples`] = face.length;
    checks.push({
      label: step.label,
      value: `${pctText(right)} right (read as ${step.expectLooking ? "looking" : "not looking"})`,
      pass: right >= LOOKING_BAR,
      bar,
    });
  }
  const pass = verdict(checks);
  const failed = checks.filter((c) => c.pass === false).map((c) => c.label.toLowerCase());
  const summary =
    pass === true
      ? "The cut-offs read all four looks right."
      : pass === false
        ? `The cut-offs misread: ${failed.join(", ")}.`
        : "Not every look was captured, so the cut-offs can't be judged yet.";
  return { pass, checks, summary, numbers };
}

// ---- presence.glances ----------------------------------------------------

const SHORT_CUES = [4000, 8000, 12000, 16000].map((atMs) => ({ atMs, label: "Glance away for half a second" }));
const LONG_CUES = [{ atMs: 8000, label: "Look away now, for about 5 seconds" }];

function evaluateGlances(measures: StepMeasures): LabOutcome {
  const checks: LabCheck[] = [];
  const required: LabCheck[] = [];
  const numbers: LabOutcome["numbers"] = {};

  const shortBar = `at least ${GLANCE_ON_LENS_BAR}% on the lens, short glances forgiven`;
  const shortFace = settled(measures.short?.face);
  const shortGroups = shortFace ? groupLooks(shortFace) : null;
  if (!shortGroups || shortGroups.onLensPercentSpeaking === null) {
    const c = notCaptured("Short glances: on the lens", shortBar);
    checks.push(c);
    required.push(c);
    numbers.shortOnLensPercent = null;
    numbers.shortPlainOnLensPercent = null;
  } else {
    const c: LabCheck = {
      label: "Short glances: on the lens",
      value: `${pctText(shortGroups.onLensPercentSpeaking)} (${shortGroups.glancesForgiven} glances forgiven)`,
      pass: shortGroups.onLensPercentSpeaking >= GLANCE_ON_LENS_BAR,
      bar: shortBar,
    };
    checks.push(c);
    required.push(c);
    checks.push({ label: "Short glances: plain per-sample figure (today)", value: pctText(shortGroups.plainOnLensPercent), pass: null });
    const cueCount = (measures.short?.cues ?? SHORT_CUES).length;
    checks.push({ label: "Glances forgiven vs. cues given", value: `${shortGroups.glancesForgiven} of ${cueCount}`, pass: null });
    numbers.shortOnLensPercent = shortGroups.onLensPercentSpeaking;
    numbers.shortPlainOnLensPercent = shortGroups.plainOnLensPercent;
    numbers.shortGlancesForgiven = shortGroups.glancesForgiven;
    numbers.shortForgivenMs = shortGroups.forgivenMs;
    numbers.shortLongLookAwayEvents = shortGroups.longLookAwayEvents;
    numbers.shortCues = cueCount;
  }

  const longBar = "exactly one long look-away counted";
  const longFace = settled(measures.long?.face);
  const longGroups = longFace ? groupLooks(longFace) : null;
  if (!longGroups) {
    const c = notCaptured("Long look-away: counted", longBar);
    checks.push(c);
    required.push(c);
    numbers.longLongLookAwayEvents = null;
    numbers.longPlainOnLensPercent = null;
  } else {
    const c: LabCheck = {
      label: "Long look-away: counted",
      value: `${longGroups.longLookAwayEvents} long look-away${longGroups.longLookAwayEvents === 1 ? "" : "s"} (longest ${round1(longGroups.longestLookAwayMs / 1000)} s)`,
      pass: longGroups.longLookAwayEvents === 1,
      bar: longBar,
    };
    checks.push(c);
    required.push(c);
    checks.push({
      label: "Long look-away: on the lens, grouped vs plain per-sample",
      value: `${longGroups.onLensPercentSpeaking === null ? "n/a" : pctText(longGroups.onLensPercentSpeaking)} vs ${pctText(longGroups.plainOnLensPercent)}`,
      pass: null,
    });
    numbers.longLongLookAwayEvents = longGroups.longLookAwayEvents;
    numbers.longLongLookAways = longGroups.longLookAways;
    numbers.longLongestLookAwayMs = longGroups.longestLookAwayMs;
    numbers.longOnLensPercent = longGroups.onLensPercentSpeaking;
    numbers.longPlainOnLensPercent = longGroups.plainOnLensPercent;
    numbers.longGlancesForgiven = longGroups.glancesForgiven;
  }

  const pass = verdict(required);
  const summary =
    pass === true
      ? "Short glances were forgiven and the long look-away was counted."
      : pass === false
        ? "The glance rules missed: " + required.filter((c) => c.pass === false).map((c) => c.label.toLowerCase()).join("; ") + "."
        : "Not enough was captured to judge the glance rules.";
  return { pass, checks, summary, numbers };
}

// ---- presence.preview ----------------------------------------------------

function evaluatePreview(measures: StepMeasures): LabOutcome {
  const checks: LabCheck[] = [];
  const required: LabCheck[] = [];
  const numbers: LabOutcome["numbers"] = {};
  const lensBar = `at least ${LOOKING_BAR}% looking`;

  const lens = settled(measures.lens?.face);
  const preview = settled(measures.preview?.face);
  const lensPct = lens ? lookingPercent(lens) : null;
  const previewPct = preview ? lookingPercent(preview) : null;

  if (lensPct === null) {
    const c = notCaptured("At the lens: looking", lensBar);
    checks.push(c);
    required.push(c);
  } else {
    const c: LabCheck = { label: "At the lens: looking", value: pctText(lensPct), pass: lensPct >= LOOKING_BAR, bar: lensBar };
    checks.push(c);
    required.push(c);
  }
  if (previewPct === null) {
    const c = notCaptured("At your own preview: looking", "information only");
    checks.push(c);
    // The test is about telling the two apart; without the second step it isn't done.
    required.push({ ...c });
  } else {
    checks.push({ label: "At your own preview: looking", value: pctText(previewPct), pass: null });
  }

  let decision: string | null = null;
  let difference: number | null = null;
  if (lensPct !== null && previewPct !== null) {
    difference = round1(lensPct - previewPct);
    decision = difference >= PREVIEW_APART_POINTS ? "tells them apart" : "counts them the same, keep the generous cut-off";
    checks.push({
      label: "Lens vs your preview: difference in the looking share",
      value: `${difference} points, so the cut-offs ${decision}`,
      pass: null,
      bar: `information: ${PREVIEW_APART_POINTS}+ points apart means they can be told apart`,
    });
  }
  numbers.lensLookingPercent = lensPct === null ? null : round1(lensPct);
  numbers.previewLookingPercent = previewPct === null ? null : round1(previewPct);
  numbers.differencePoints = difference;
  numbers.decision = decision;

  const pass = verdict(required);
  const summary =
    pass === null
      ? "Not enough was captured to say."
      : pass === false
        ? `Looking at the lens read as looking only ${pctText(lensPct ?? 0)} of the time.`
        : `The cut-offs ${decision}: ${pctText(lensPct ?? 0)} looking at the lens, ${pctText(previewPct ?? 0)} at your own preview.`;
  return { pass, checks, summary, numbers };
}

// ---- presence.expression -------------------------------------------------

function evaluateExpression(measures: StepMeasures): LabOutcome {
  const checks: LabCheck[] = [];
  const required: LabCheck[] = [];
  const numbers: LabOutcome["numbers"] = {};
  const stillBar = `${STILL_MAX} or less (near zero)`;
  const animatedBar = "at least double the still face, and above zero";

  const stillFace = settled(measures.still?.face);
  const animatedFace = settled(measures.animated?.face);
  const still = stillFace ? computePresenceMetrics(stillFace) : null;
  const animated = animatedFace ? computePresenceMetrics(animatedFace) : null;
  const stillMove = stillFace ? faceMovement(stillFace, null) : null;
  const animatedMove = animatedFace ? faceMovement(animatedFace, null) : null;

  if (!still) {
    const c = notCaptured("Still face: expressiveness", stillBar);
    checks.push(c);
    required.push(c);
  } else {
    const c: LabCheck = { label: "Still face: expressiveness", value: String(still.expressiveness), pass: still.expressiveness <= STILL_MAX, bar: stillBar };
    checks.push(c);
    required.push(c);
  }
  if (!animated) {
    const c = notCaptured("Animated face: expressiveness", animatedBar);
    checks.push(c);
    required.push(c);
  } else if (still) {
    const c: LabCheck = {
      label: "Animated face: expressiveness",
      value: `${animated.expressiveness} (${still.expressiveness > 0 ? `${round1(animated.expressiveness / still.expressiveness)}x the still face` : "still face at zero"})`,
      pass: animated.expressiveness > 0 && animated.expressiveness >= 2 * still.expressiveness,
      bar: animatedBar,
    };
    checks.push(c);
    required.push(c);
  } else {
    checks.push({ label: "Animated face: expressiveness", value: String(animated.expressiveness), pass: null, bar: animatedBar });
    required.push({ label: "Animated face: expressiveness", value: String(animated.expressiveness), pass: null, bar: animatedBar });
  }
  if (stillMove && animatedMove) {
    checks.push({ label: "Motion index against your own range (candidate formula)", value: `still ${stillMove.motionIndex}, animated ${animatedMove.motionIndex}`, pass: null });
  }

  numbers.stillExpressiveness = still ? still.expressiveness : null;
  numbers.animatedExpressiveness = animated ? animated.expressiveness : null;
  numbers.expressivenessRatio = still && animated && still.expressiveness > 0 ? round1(animated.expressiveness / still.expressiveness) : null;
  numbers.stillMotionIndex = stillMove ? stillMove.motionIndex : null;
  numbers.animatedMotionIndex = animatedMove ? animatedMove.motionIndex : null;
  numbers.stillBrowLiftsPerMinute = stillMove ? stillMove.browLiftsPerMinute : null;
  numbers.stillSmilesPerMinute = stillMove ? stillMove.smilesPerMinute : null;
  numbers.animatedBrowLiftsPerMinute = animatedMove ? animatedMove.browLiftsPerMinute : null;
  numbers.animatedSmilesPerMinute = animatedMove ? animatedMove.smilesPerMinute : null;

  const pass = verdict(required);
  const summary =
    pass === true
      ? `Expression tells them apart: ${still?.expressiveness} still, ${animated?.expressiveness} animated.`
      : pass === false
        ? `Expression doesn't separate still from animated: ${still?.expressiveness ?? "?"} still, ${animated?.expressiveness ?? "?"} animated.`
        : "Not enough was captured to judge expression.";
  return { pass, checks, summary, numbers };
}

// ---- presence.face_events ------------------------------------------------

// Ten brow lifts and five smiles, in threes: lift, lift, smile.
const EVENT_CUES = Array.from({ length: 15 }, (_, i) => ({
  atMs: 4000 + i * 3500,
  label: i % 3 === 2 ? "Smile" : "Raise your eyebrows",
}));

function cueKind(label: string): FaceEventKind {
  return /smile/i.test(label) ? "smile" : "brow";
}

function evaluateFaceEvents(measures: StepMeasures): LabOutcome {
  const bar = `at least ${EVENT_SHARE_BAR}% of the cues counted`;
  const m = measures.events;
  const face = settled(m?.face);
  const movement = face ? faceMovement(face, null) : null;
  const cues = (m?.cues ?? EVENT_CUES.map((c) => ({ tMs: c.atMs, label: c.label }))).filter((c) => c.tMs >= SETTLE_MS);
  if (!face || !movement || cues.length === 0) {
    const c = notCaptured("Cues counted", bar);
    return { pass: null, checks: [c], summary: "Not enough was captured to count the face events.", numbers: { cues: cues.length, counted: null } };
  }

  // Each event answers at most one cue; each cue takes the nearest unused
  // event of its own kind within the window.
  const used = new Set<number>();
  const counted: Record<FaceEventKind, number> = { brow: 0, smile: 0 };
  const total: Record<FaceEventKind, number> = { brow: 0, smile: 0 };
  for (const cue of cues) {
    const kind = cueKind(cue.label);
    total[kind] += 1;
    let best = -1;
    let bestGap = Infinity;
    movement.events.forEach((e, i) => {
      const gap = Math.abs(e.tMs - cue.tMs);
      if (e.kind === kind && !used.has(i) && gap <= CUE_WINDOW_MS && gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best >= 0) {
      used.add(best);
      counted[kind] += 1;
    }
  }
  const hit = counted.brow + counted.smile;
  const percent = (hit / cues.length) * 100;
  const extra = movement.events.length - used.size;

  const checks: LabCheck[] = [
    { label: "Cues counted", value: `${hit} of ${cues.length} (${pctText(percent)})`, pass: percent >= EVENT_SHARE_BAR, bar },
    { label: "Brow lifts counted", value: `${counted.brow} of ${total.brow}`, pass: null },
    { label: "Smiles counted", value: `${counted.smile} of ${total.smile}`, pass: null },
    { label: "Events with no cue near them", value: String(extra), pass: null },
  ];
  const pass = percent >= EVENT_SHARE_BAR;
  return {
    pass,
    checks,
    summary: pass ? `${hit} of ${cues.length} face events were counted on cue.` : `Only ${hit} of ${cues.length} face events were counted on cue.`,
    numbers: {
      cues: cues.length,
      counted: hit,
      countedPercent: round1(percent),
      browCues: total.brow,
      browCounted: counted.brow,
      smileCues: total.smile,
      smileCounted: counted.smile,
      extraEvents: extra,
      browLiftsPerMinute: movement.browLiftsPerMinute,
      smilesPerMinute: movement.smilesPerMinute,
      motionIndex: movement.motionIndex,
    },
  };
}

// ---- The tests -----------------------------------------------------------

const faceStep = (s: Omit<LabStep, "capture">): LabStep => ({ ...s, capture: "face" });

const eventCueTimes = EVENT_CUES.map((c) => `${c.atMs / 1000}s ${cueKind(c.label) === "smile" ? "smile" : "brows"}`).join(", ");

export const PRESENCE_TESTS: LabTestEntry[] = [
  {
    def: {
      id: "presence.looking",
      group: "presence",
      title: "Looking",
      summary: "Does the eye contact rule tell the lens from your notes, the ceiling and the side?",
      minutes: 2,
      steps: LOOKING_STEPS.map((s) => faceStep({ id: s.id, title: s.title, instruction: s.instruction, seconds: 20 })),
      bars: [`${LOOKING_BAR}%+ right on each of the four looks (the lens read as looking, the other three as not looking)`, `The first ${SETTLE_MS / 1000} s of each step is skipped while your eyes settle`],
      onFail: "Tune cut-offs with these takes",
    },
    evaluate: evaluateLooking,
  },
  {
    def: {
      id: "presence.glances",
      group: "presence",
      title: "Glances",
      summary: "Are short glances forgiven and a long look-away counted?",
      minutes: 1,
      steps: [
        faceStep({
          id: "short",
          title: "Short glances",
          instruction: "Look at the lens. When a cue appears, glance away for about half a second and come straight back.",
          seconds: 20,
          cues: SHORT_CUES,
        }),
        faceStep({
          id: "long",
          title: "One long look-away",
          instruction: "Look at the lens. When the cue appears, look away for about 5 seconds, then come back.",
          seconds: 20,
          cues: LONG_CUES,
        }),
      ],
      bars: [`Short glances forgiven: on the lens ${GLANCE_ON_LENS_BAR}%+ in step one`, "The long look-away counted: exactly one in step two"],
      onFail: "Tune the 1.2s and 3s lines",
    },
    evaluate: evaluateGlances,
  },
  {
    def: {
      id: "presence.preview",
      group: "presence",
      title: "Your preview",
      summary: "Does looking at your own image on the screen read differently from looking at the lens?",
      minutes: 1,
      steps: [
        faceStep({ id: "lens", title: "Look at the lens", instruction: "Look straight at the camera lens.", seconds: 20 }),
        faceStep({ id: "preview", title: "Look at your own preview", instruction: "Look at your own face on the screen, as you would while talking to the phone.", seconds: 20 }),
      ],
      bars: [`The lens step is ${LOOKING_BAR}%+ looking`, "Whether the two can be told apart is shown for information; we decide what to do with it"],
      onFail: "Keep the generous cut-off",
    },
    evaluate: evaluatePreview,
  },
  {
    def: {
      id: "presence.expression",
      group: "presence",
      title: "Expression",
      summary: "Does the expression number separate a still face from an animated one?",
      minutes: 1,
      steps: [
        faceStep({ id: "still", title: "Still face", instruction: "Look at the lens with a relaxed, still face. No smiling, no eyebrow movement.", seconds: 20 }),
        faceStep({ id: "animated", title: "Animated face", instruction: "Look at the lens and talk about anything, with a lively face: smile, lift your eyebrows, react.", seconds: 20 }),
      ],
      bars: ["Animated is at least double the still face", `The still face is near zero (${STILL_MAX} or less)`],
      onFail: "Change the formula",
    },
    evaluate: evaluateExpression,
  },
  {
    def: {
      id: "presence.face_events",
      group: "presence",
      title: "Face events",
      summary: "Are brow lifts and smiles counted when you do them on cue?",
      minutes: 1,
      steps: [
        faceStep({
          id: "events",
          title: "Brow lifts and smiles on cue",
          instruction: `Look at the lens. On each cue, lift your eyebrows or smile, hold it for about a second, then relax. Ten brow lifts and five smiles. Cues at ${eventCueTimes}.`,
          seconds: 60,
          cues: EVENT_CUES,
        }),
      ],
      bars: [`${EVENT_SHARE_BAR}%+ of the 15 counted (an event of the right kind within ${CUE_WINDOW_MS / 1000} s of its cue)`],
      onFail: "Tune with your face check",
    },
    evaluate: evaluateFaceEvents,
  },
];
