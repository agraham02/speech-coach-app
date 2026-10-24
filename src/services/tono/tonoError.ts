import { denialMessage, isActionNeeded, type DenyReason, type TonoAllowance } from "../../domain/aiAllowance";

// Kept apart from tonoApi.ts so the pipeline's error wording can use it
// without loading the whole Supabase client.

// A refusal or failure from the server. `code` is what the server said
// (supabase/functions/_shared: quota_exhausted, signed_out, file_not_found, ...).
export class TonoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly allowance?: TonoAllowance,
  ) {
    super(message ?? code);
    this.name = "TonoApiError";
  }
}

const DENY_CODES: readonly string[] = ["quota_exhausted", "plus_required", "plus_cost_cap", "budget_paused", "rate_limited", "disabled"];

export function isDenyCode(code: string): code is DenyReason {
  return DENY_CODES.includes(code);
}

// True when retrying by itself would change nothing and the person has to act
// (wait for the refill, or start Tono Plus).
export function needsPersonToAct(error: TonoApiError): boolean {
  if (error.code === "signed_out") return true;
  return isDenyCode(error.code) && isActionNeeded(error.code);
}

// A failed Tono AI call, worded for the person who has to fix it.
export function describeTonoError(error: TonoApiError): string {
  if (error.code === "signed_out") return "Couldn't reach your Tono account. Check your connection and try again.";
  if (isDenyCode(error.code)) {
    const base = denialMessage(error.code, error.allowance ?? null);
    if (error.code === "quota_exhausted" || error.code === "plus_cost_cap" || error.code === "budget_paused") {
      return `${base} Your phone's measurements and tips are here as always.`;
    }
    return base;
  }
  switch (error.code) {
    case "in_flight":
      return "Tono AI is already on it. Give it a minute.";
    case "already_done":
      return "This one is already done.";
    case "file_not_found":
    case "file_not_ready":
      return "The uploaded video wasn't ready. Retry and Tono will upload it again.";
    case "upstream_failed":
    case "upstream_unavailable":
      return "Tono AI's servers had a temporary problem. This usually works on retry.";
    case "too_large":
    case "bad_request":
      return "This take couldn't be sent to Tono AI. It may be too long.";
    case "unsupported_schema":
      return "This version of Tono is out of date for Tono AI. Update the app to keep getting judged takes.";
  }
  if (error.status >= 500) return "Tono AI had a temporary problem. This usually works on retry.";
  return "Tono AI couldn't judge this. Try again.";
}
