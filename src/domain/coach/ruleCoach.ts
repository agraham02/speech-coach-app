import type { SkillId } from "../../theme/tokens";
import type { PauseAnalysis } from "../dsp/pauses";
import type { PresenceMetrics } from "../presenceMetrics";
import { FRAMEWORK_LABELS, findHedges, guessStructure, hasStrongEnding, type FrameworkId, type StructureGuess } from "./structureHeuristics";
import { ramblingMetrics } from "./ramblingMetrics";
import type { PromptTask } from "../promptTask";
import type { Provenance } from "../analysis/types";
import { rulesProvenance } from "../analysis/provenance";
import { eyeContactScore, fillerScore, hedgeCost, paceScore, pauseScore, pitchScore, PITCH_FLAT_ST, verdictFor, type Verdict } from "../scoring/bands";

// Deterministic on-device coaching from measured signals. Always available
// (no model, no network). A Tono AI review's coaching, when the take has one,
// replaces the words (domain/coach/cloudCoach.ts). The observations' verdicts
// come from the same bands as the measured score (domain/scoring/bands.ts),
// so a "good" pace here is a pace that scores well there.

export interface CoachInput {
  transcript: string | null;
  durationSeconds: number;
  wpmAvg: number | null;
  fillerRatePerMinute: number | null;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  // p10 to p90 pitch range in semitones (domain/scoring/bands.ts).
  pitchRangeSt: number | null;
  promptText?: string | null;
  // What the prompt asked for ("closing", "debate"), so the on-device model
  // doesn't mark a closing-only take down for lacking a beginning.
  task?: PromptTask | null;
  targetFramework?: FrameworkId | null;
}

export type { Verdict };

export interface Observation {
  skill: SkillId;
  label: string;
  value: string;
  verdict: Verdict;
}

export interface CoachOutput {
  // Who wrote the words: the rules, or a Tono AI review (cloudCoach.ts).
  provenance: Provenance;
  strength: string;
  tip: string;
  focusSkill: SkillId;
  structure: StructureGuess;
  hedges: string[];
  strongEnding: boolean | null;
  followUpQuestion: string | null;
  observations: Observation[];
}

interface Finding {
  skill: SkillId;
  severity: number; // higher = more worth fixing first
  tip: string;
}

interface Win {
  weight: number;
  text: string;
}

const FOLLOW_UPS = [
  "Why does that matter to you personally?",
  "Can you give one specific example?",
  "What would you do differently next time?",
  "What's the strongest argument against your view?",
  "How would you explain that to a 10-year-old?",
  "What's the one thing you want the listener to remember?",
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ruleCoach(input: CoachInput): CoachOutput {
  const transcript = input.transcript?.trim() || null;
  const structure = transcript ? guessStructure(transcript, input.targetFramework) : { framework: "None" as FrameworkId, beatsFound: 0, pointUpFront: false };
  const hedges = transcript ? findHedges(transcript) : [];
  const strongEnding = transcript ? hasStrongEnding(transcript) : null;
  const findings: Finding[] = [];
  const wins: Win[] = [];
  const observations: Observation[] = [];

  // --- Cadence: pace, pauses, melody ---
  if (input.wpmAvg != null) {
    const wpm = input.wpmAvg;
    const verdict = verdictFor(paceScore(wpm));
    observations.push({ skill: "cadence", label: "Pace", value: `${wpm} wpm`, verdict });
    if (wpm > 175) findings.push({ skill: "cadence", severity: 6 + (wpm - 175) / 10, tip: `You averaged ${wpm} words a minute — aim for 140–160. Land each full stop with a beat of silence and the pace drops on its own.` });
    else if (wpm < 110) findings.push({ skill: "cadence", severity: 4 + (110 - wpm) / 10, tip: `At ${wpm} words a minute it can sound hesitant. Decide your next sentence while you finish the current one, then keep moving.` });
    else wins.push({ weight: 3, text: `Comfortable pace (${wpm} wpm).` });
  }
  if (input.pauses) {
    const p = input.pauses;
    if (p.boundaryPauseRate != null) {
      const rate = Math.round(p.boundaryPauseRate * 100);
      observations.push({ skill: "cadence", label: "Pauses at full stops", value: `${rate}%`, verdict: verdictFor(pauseScore(p.boundaryPauseRate)) });
      if (rate < 35) findings.push({ skill: "cadence", severity: 5, tip: "Pause at the end of each sentence — a half-second of silence makes you sound certain and gives the listener time to absorb it." });
      else if (rate >= 60) wins.push({ weight: 4, text: "You let your sentences land with real pauses." });
    }
    if (p.hesitations >= 2) {
      findings.push({ skill: "impromptu", severity: 4 + p.hesitations, tip: `You stalled mid-sentence ${p.hesitations} times. Commit to short sentences — finish the thought, then pause between thoughts, not inside them.` });
    }
    if (p.speechStartMs != null && p.speechStartMs > 5000) {
      findings.push({ skill: "impromptu", severity: 3, tip: `It took ${Math.round(p.speechStartMs / 1000)} s to start. Open with your point in one sentence, even before you know the rest.` });
    }
  }
  if (input.pitchRangeSt != null) {
    const range = Math.round(input.pitchRangeSt * 10) / 10;
    const verdict = verdictFor(pitchScore(range));
    observations.push({ skill: "cadence", label: "Pitch range", value: `${range} semitones`, verdict });
    if (range < PITCH_FLAT_ST) findings.push({ skill: "cadence", severity: 4.5, tip: "Your pitch stayed flat. Pick one key word per sentence and lift your voice on it." });
    else if (verdict === "good") wins.push({ weight: 3, text: "Lively, varied voice." });
  }

  // --- Impromptu: fillers, structure ---
  if (input.fillerRatePerMinute != null) {
    const rate = input.fillerRatePerMinute;
    observations.push({ skill: "impromptu", label: "Fillers", value: `${rate}/min`, verdict: verdictFor(fillerScore(rate)) });
    if (rate > 6) findings.push({ skill: "impromptu", severity: 5 + rate / 3, tip: `About ${rate} filler words a minute. When you feel an "um" coming, close your mouth and pause instead — silence sounds confident.` });
    else if (rate <= 3) wins.push({ weight: 3, text: "Very few filler words." });
  }
  if (transcript) {
    // A prompt for only an opening or a closing isn't a whole answer, so the
    // answer frameworks (PREP and the rest) don't apply to it: no verdict.
    const partOfATalk = input.task === "opening" || input.task === "closing";
    if (!partOfATalk) {
      observations.push({
        skill: "impromptu",
        label: "Structure",
        value: FRAMEWORK_LABELS[structure.framework],
        verdict: structure.framework !== "None" ? "good" : "work",
      });
      if (input.targetFramework && input.targetFramework !== "None" && structure.framework !== input.targetFramework) {
        findings.push({ skill: "impromptu", severity: 5.5, tip: `This rep was for ${FRAMEWORK_LABELS[input.targetFramework]} — hit each beat out loud, even if it feels mechanical at first.` });
      } else if (structure.framework === "None") {
        findings.push({ skill: "impromptu", severity: 4, tip: "Give your answer a shape: state your point, give a reason, an example, then repeat the point (PREP)." });
      } else {
        wins.push({ weight: 4, text: `Clear structure (${FRAMEWORK_LABELS[structure.framework]}).` });
      }
    }
    // Rambling cues become tips only, not observations, so they don't
    // change how a rep moves mastery.
    const rambling = ramblingMetrics({ transcript, durationSeconds: input.durationSeconds });
    // A throat-clearing opener ("That's a good question. Let me think.")
    // can look like a short first sentence, so the praise also needs no
    // warm-up sentences — otherwise it contradicts the tip below.
    if (structure.pointUpFront && rambling.sentencesBeforePoint === 0) wins.push({ weight: 2, text: "You led with your point." });
    if (rambling.sentencesBeforePoint >= 2) {
      findings.push({ skill: "impromptu", severity: 4.5, tip: `Your answer started after ${rambling.sentencesBeforePoint} warm-up sentences. Lead with the point — the context can come after.` });
    }
    if (rambling.tangentMarkers >= 2) {
      findings.push({ skill: "impromptu", severity: 3 + rambling.tangentMarkers / 2, tip: `You took ${rambling.tangentMarkers} detours ("by the way", "anyway"…). Skip the side trip and get back to your point in one sentence.` });
    }
    if (rambling.restarts >= 2) {
      findings.push({ skill: "impromptu", severity: 3, tip: "You restarted your thought a few times. Go with the plain version and keep moving — it's clearer than the perfect one." });
    }
  }

  // --- Confidence: presence, hedges, ending ---
  if (input.presence && input.presence.presentPercent < 40) {
    // Mostly out of frame: facing-the-lens numbers would be meaningless.
    const pr = input.presence;
    observations.push({ skill: "confidence", label: "Face in frame", value: `${pr.presentPercent}%`, verdict: "work" });
    findings.push({ skill: "confidence", severity: 4, tip: "Your face was out of frame for most of the take. Prop the phone at eye level, arm's length away, so your expression is part of the message." });
  } else if (input.presence) {
    const pr = input.presence;
    if (pr.eyeContactSource === "gaze") {
      // Head and eyes (MediaPipe gaze).
      observations.push({ skill: "confidence", label: "Eye contact", value: `${pr.eyeContactPercent}%`, verdict: verdictFor(eyeContactScore(pr.eyeContactPercent, "gaze")) });
      if (pr.eyeContactPercent < 50) findings.push({ skill: "confidence", severity: 5, tip: `You looked at the lens ${pr.eyeContactPercent}% of the time. Treat the lens as one person's eyes and finish each sentence there.` });
      else if (pr.eyeContactPercent >= 70) wins.push({ weight: 4, text: `Strong eye contact (${pr.eyeContactPercent}%).` });
      if ((pr.lookingDownPercent ?? 0) >= 25) {
        findings.push({ skill: "confidence", severity: 4.5, tip: `Your eyes dropped below the lens ${pr.lookingDownPercent}% of the time. When you need to think, look up or to the side — looking down reads as unsure.` });
      }
    } else {
      // Older takes: head direction only — the face detector then couldn't
      // see where the eyes pointed, so this is never called "eye contact".
      observations.push({ skill: "confidence", label: "Facing the lens", value: `${pr.eyeContactPercent}%`, verdict: verdictFor(eyeContactScore(pr.eyeContactPercent, "head")) });
      if (pr.eyeContactPercent < 55) findings.push({ skill: "confidence", severity: 5, tip: `Your face was turned toward the lens only ${pr.eyeContactPercent}% of the time. Treat the lens as one person's eyes and finish each sentence there.` });
      else if (pr.eyeContactPercent >= 75) wins.push({ weight: 4, text: `You kept facing the lens (${pr.eyeContactPercent}%).` });
    }
    if (pr.presentPercent >= 50 && pr.expressiveness < 12) findings.push({ skill: "confidence", severity: 3, tip: "Your face stayed still. Let your expression match the words — a flat face makes the voice sound flat too." });
    if (pr.tiltedPercent != null && pr.headTiltDeg != null) {
      // No verdict dot: head level is shown, not scored (it read level on
      // every take with the phone on a stand). A clear tilt still gets a tip.
      if (pr.tiltedPercent > 50) findings.push({ skill: "confidence", severity: 2.5, tip: `Your head was tilted (about ${Math.round(pr.headTiltDeg)}°) for most of the take. Keep it level when you make a point — a tilt makes a statement sound like a question.` });
    }
    if (pr.presentPercent >= 50 && pr.eyeContactSource === "gaze") {
      if (pr.smilePercent === 0) findings.push({ skill: "confidence", severity: 2, tip: "You didn't smile once. A brief, real smile as you start and as you finish makes you look at ease." });
      if ((pr.tensePercent ?? 0) >= 40) findings.push({ skill: "confidence", severity: 3, tip: "Your brow or lips looked tense for much of the take. Drop your shoulders, unclench your jaw and let your forehead relax before you start." });
      if ((pr.browRaisesPerMinute ?? 0) >= 4) wins.push({ weight: 2, text: "Your eyebrows lifted to underline key points." });
    }
  }
  if (hedgeCost(hedges.length) > 0) {
    findings.push({ skill: "confidence", severity: 3 + hedges.length / 2, tip: `You hedged ${hedges.length} times ("${hedges[0]}"…). Say it as a statement — you can add nuance without softening every sentence.` });
  }
  if (strongEnding === false) {
    findings.push({ skill: "confidence", severity: 3.5, tip: 'You trailed off at the end. Finish with your point restated, then stop — no "so yeah".' });
  } else if (strongEnding) {
    wins.push({ weight: 2, text: "You ended on a clear statement." });
  }

  findings.sort((a, b) => b.severity - a.severity);
  wins.sort((a, b) => b.weight - a.weight);
  const top = findings[0];
  return {
    provenance: rulesProvenance(),
    strength: wins[0]?.text ?? "You showed up and did the rep — that's the habit that builds the skill.",
    tip: top?.tip ?? "Solid rep. Next time, try it with less prep time or a harder prompt.",
    focusSkill: top?.skill ?? "impromptu",
    structure,
    hedges,
    strongEnding,
    followUpQuestion: transcript ? FOLLOW_UPS[hash(transcript) % FOLLOW_UPS.length] : null,
    observations,
  };
}
