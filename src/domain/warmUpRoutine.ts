// Short guided breathing/easy-onset routine shown before recording, per
// fluency-shaping research (diaphragmatic breathing, easy onset, light
// articulatory contact).
//
// Deliberately built as a function of an intensity level, not a fixed
// static array: Phase 5's adaptive curriculum engine will later drive step
// duration by curriculum level (harder levels get a longer, more thorough
// warm-up — see that phase's plan notes), so keeping `WarmUpIntensity` as
// the single knob avoids a second pass through this file. Until Phase 5
// lands, the Settings toggle always resolves to "medium".
export type WarmUpIntensity = "short" | "medium" | "long";

export interface WarmUpStep {
  label: string;
  instruction: string;
  // A short, separate "why this helps" line — kept out of `instruction`
  // itself (which used to nest jargon like "no hard glottal starts" inside
  // the instruction text) and given its own smaller/softer typographic
  // treatment in WarmUpOverlay so it reads as context, not another command.
  explain: string;
  seconds: number;
}

export const DEFAULT_WARM_UP_INTENSITY: WarmUpIntensity = "medium";

const SECONDS_PER_STEP: Record<WarmUpIntensity, number> = {
  short: 10,
  medium: 20, // today's effective default
  long: 30,
};

// Same 3 steps regardless of intensity — only each step's duration scales.
// Instructions are deliberately plain-language (no "diaphragmatic", no
// "glottal") — the technical reasoning lives in `explain` instead, styled
// distinctly in WarmUpOverlay so the two don't blur into one dense line.
const STEP_TEMPLATES: Array<{ label: string; instruction: string; explain: string }> = [
  {
    label: "Breathe",
    instruction: "Slow breaths — in through your nose, out through your mouth.",
    explain: "This calms your nervous system, so you start with steadier control over your voice.",
  },
  {
    label: "Easy onset",
    instruction: "Say a long, gentle \"haaa\" — start the sound soft, not sharp.",
    explain: "This eases tension in your throat before you speak, so your first words don't come out clipped or strained.",
  },
  {
    label: "Lip trill",
    instruction: "Loosen up with a relaxed lip trill (\"brrr\"), letting your pitch rise and fall.",
    explain: "This relaxes your lips and jaw so your speech flows more freely once you start.",
  },
];

export function getWarmUpSteps(intensity: WarmUpIntensity = DEFAULT_WARM_UP_INTENSITY): WarmUpStep[] {
  const seconds = SECONDS_PER_STEP[intensity];
  return STEP_TEMPLATES.map((step) => ({ ...step, seconds }));
}
