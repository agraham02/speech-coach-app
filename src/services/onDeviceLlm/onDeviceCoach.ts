import type { CoachInput, CoachOutput } from "../../domain/coach/ruleCoach";

// Phase 2B plugs the Apple on-device model in here. Until then (and on any
// device without Apple Intelligence) the rule-based coach is used as-is.
export async function coachWithOnDeviceModel(_input: CoachInput, _rules: CoachOutput): Promise<CoachOutput | null> {
  return null;
}
