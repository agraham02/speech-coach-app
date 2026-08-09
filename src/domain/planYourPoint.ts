// The PREP framework (Point -> Reason -> Example -> Point), captured before
// recording starts, per the "Plan your point" pre-recording step. All three
// fields are optional in practice — an empty PlanText just means the user
// skipped planning, not an error state.
export interface PlanText {
  point: string;
  reason: string;
  example: string;
}

export function hasAnyPlanText(plan: PlanText): boolean {
  return plan.point.trim().length > 0 || plan.reason.trim().length > 0 || plan.example.trim().length > 0;
}

// Converts to the shape persisted on the sessions row: if the plan is
// entirely blank (or absent), all three columns are null (not empty
// strings) so "no plan" reads unambiguously; otherwise each field is trimmed
// individually (a partially-filled plan can still have some null fields).
export function planTextToNullableFields(planText?: PlanText): {
  point: string | null;
  reason: string | null;
  example: string | null;
} {
  if (!planText || !hasAnyPlanText(planText)) {
    return { point: null, reason: null, example: null };
  }
  return {
    point: planText.point.trim() || null,
    reason: planText.reason.trim() || null,
    example: planText.example.trim() || null,
  };
}
