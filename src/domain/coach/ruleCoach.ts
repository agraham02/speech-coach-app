import type { SkillId } from "../../theme/tokens";
import type { PauseAnalysis } from "../dsp/pauses";
import type { PresenceMetrics } from "../presenceMetrics";
import { FRAMEWORK_LABELS, findHedges, guessStructure, hasStrongEnding, type FrameworkId, type StructureGuess } from "./structureHeuristics";

// Deterministic on-device coaching from measured signals. Always available
// (no model, no network); the Apple on-device model, when present, writes
// the friendlier prose on top of the same measurements.

export interface CoachInput {
  transcript: string | null;
  durationSeconds: number;
  wpmAvg: number | null;
  fillerRatePerMinute: number | null;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  pitchRangeHz: number | null;
  promptText?: string | null;
  targetFramework?: FrameworkId | null;
}

export type Verdict = "good" | "ok" | "work";

export interface Observation {
  skill: SkillId;
  label: string;
  value: string;
  verdict: Verdict;
}

export interface CoachOutput {
  source: "rules" | "apple";
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
  const structure = transcript ? guessStructure(transcript) : { framework: "None" as FrameworkId, beatsFound: 0, pointUpFront: false };
  const hedges = transcript ? findHedges(transcript) : [];
  const strongEnding = transcript ? hasStrongEnding(transcript) : null;
  const findings: Finding[] = [];
  const wins: Win[] = [];
  const observations: Observation[] = [];

  // --- Cadence: pace, pauses, melody ---
  if (input.wpmAvg != null) {
    const wpm = input.wpmAvg;
    const verdict: Verdict = wpm >= 125 && wpm <= 165 ? "good" : wpm >= 105 && wpm <= 185 ? "ok" : "work";
    observations.push({ skill: "cadence", label: "Pace", value: `${wpm} wpm`, verdict });
    if (wpm > 175) findings.push({ skill: "cadence", severity: 6 + (wpm - 175) / 10, tip: `You averaged ${wpm} words a minute — aim for 140–160. Land each full stop with a beat of silence and the pace drops on its own.` });
    else if (wpm < 110) findings.push({ skill: "cadence", severity: 4 + (110 - wpm) / 10, tip: `At ${wpm} words a minute it can sound hesitant. Decide your next sentence while you finish the current one, then keep moving.` });
    else wins.push({ weight: 3, text: `Comfortable pace (${wpm} wpm).` });
  }
  if (input.pauses) {
    const p = input.pauses;
    if (p.boundaryPauseRate != null) {
      const rate = Math.round(p.boundaryPauseRate * 100);
      observations.push({ skill: "cadence", label: "Pauses at full stops", value: `${rate}%`, verdict: rate >= 60 ? "good" : rate >= 35 ? "ok" : "work" });
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
  if (input.pitchRangeHz != null) {
    const range = input.pitchRangeHz;
    observations.push({ skill: "cadence", label: "Pitch range", value: `${range} Hz`, verdict: range >= 110 ? "good" : range >= 60 ? "ok" : "work" });
    if (range < 60) findings.push({ skill: "cadence", severity: 4.5, tip: "Your pitch stayed flat. Pick one key word per sentence and lift your voice on it." });
    else if (range >= 110) wins.push({ weight: 3, text: "Lively, varied voice." });
  }

  // --- Impromptu: fillers, structure ---
  if (input.fillerRatePerMinute != null) {
    const rate = input.fillerRatePerMinute;
    observations.push({ skill: "impromptu", label: "Fillers", value: `${rate}/min`, verdict: rate <= 3 ? "good" : rate <= 6 ? "ok" : "work" });
    if (rate > 6) findings.push({ skill: "impromptu", severity: 5 + rate / 3, tip: `About ${rate} filler words a minute. When you feel an "um" coming, close your mouth and pause instead — silence sounds confident.` });
    else if (rate <= 3) wins.push({ weight: 3, text: "Very few filler words." });
  }
  if (transcript) {
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
    if (structure.pointUpFront) wins.push({ weight: 2, text: "You led with your point." });
  }

  // --- Confidence: presence, hedges, ending ---
  if (input.presence && input.presence.presentPercent < 40) {
    // Mostly out of frame: eye-contact numbers would be meaningless.
    const pr = input.presence;
    observations.push({ skill: "confidence", label: "Face in frame", value: `${pr.presentPercent}%`, verdict: "work" });
    findings.push({ skill: "confidence", severity: 4, tip: "Your face was out of frame for most of the take. Prop the phone at eye level, arm's length away, so your expression is part of the message." });
  } else if (input.presence) {
    const pr = input.presence;
    observations.push({ skill: "confidence", label: "Eye contact", value: `${pr.eyeContactPercent}%`, verdict: pr.eyeContactPercent >= 75 ? "good" : pr.eyeContactPercent >= 55 ? "ok" : "work" });
    if (pr.eyeContactPercent < 55) findings.push({ skill: "confidence", severity: 5, tip: `You looked at the lens ${pr.eyeContactPercent}% of the time. Treat the lens as one person's eyes and finish each sentence there.` });
    else if (pr.eyeContactPercent >= 75) wins.push({ weight: 4, text: `Strong eye contact (${pr.eyeContactPercent}%).` });
    if (pr.presentPercent >= 50 && pr.expressiveness < 12) findings.push({ skill: "confidence", severity: 3, tip: "Your face stayed still. Let your expression match the words — a flat face makes the voice sound flat too." });
  }
  if (hedges.length >= 3) {
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
    source: "rules",
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
