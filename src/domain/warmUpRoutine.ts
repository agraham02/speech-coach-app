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
  seconds: number;
}

export const DEFAULT_WARM_UP_INTENSITY: WarmUpIntensity = "medium";

const SECONDS_PER_STEP: Record<WarmUpIntensity, number> = {
  short: 10,
  medium: 20, // today's effective default
  long: 30,
};

// Same 3 steps regardless of intensity — only each step's duration scales.
const STEP_TEMPLATES: Array<{ label: string; instruction: string }> = [
  { label: "Breathe", instruction: "Slow diaphragmatic breaths — in through the nose, out through the mouth." },
  { label: "Easy onset", instruction: "Gently glide into a few long \"haaa\" sounds — no hard glottal starts." },
  { label: "Lip trill", instruction: "Loosen up with a relaxed lip trill (\"brrr\"), letting pitch rise and fall." },
];

export function getWarmUpSteps(intensity: WarmUpIntensity = DEFAULT_WARM_UP_INTENSITY): WarmUpStep[] {
  const seconds = SECONDS_PER_STEP[intensity];
  return STEP_TEMPLATES.map((step) => ({ ...step, seconds }));
}
