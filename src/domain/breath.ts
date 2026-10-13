// How big the breathing aura is at the end of each phase of a breathing
// warm-up, as a fraction of its full size. Pure.

// Empty lungs: still clearly larger than the countdown ring in front of it.
export const BREATH_MIN_SCALE = 0.62;

export type BreathPhase = "in" | "hold" | "out";

// Where the aura should be when a phase ends: full on a breath in (less for a
// first, part-filling breath), empty on a breath out. A hold, or a step with
// no phase, returns null — the aura stays where it is.
export function breathTarget(phase: BreathPhase | undefined, fill = 1): number | null {
  if (phase === "in") return BREATH_MIN_SCALE + (1 - BREATH_MIN_SCALE) * Math.max(0, Math.min(1, fill));
  if (phase === "out") return BREATH_MIN_SCALE;
  return null;
}
