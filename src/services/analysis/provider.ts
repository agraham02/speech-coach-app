import type { AnalysisContext, AnalysisKind, Producer, Provenance, Unavailable } from "../../domain/analysis/types";
import type { Route } from "../../domain/analysis/routing";
import { describeCloudError } from "../cloud/cloudErrors";
import { TonoApiError } from "../tono/tonoError";
import { TimeoutError } from "../../utils/fetchWithTimeout";
import type { InputFor, OutputFor } from "./kinds";

// What every provider implements. A provider turns a typed input into the
// typed result for its kind, or says plainly why it couldn't. It may throw:
// the service turns a thrown error into a reason and moves on to the next.

export type ProviderOutcome<T> = { ok: true; value: T; provenance: Provenance } | { ok: false; reason: Unavailable; message?: string };

export interface AnalysisProvider {
  id: Producer;
  supports(kind: AnalysisKind): boolean;
  run<K extends AnalysisKind>(kind: K, input: InputFor<K>, ctx: AnalysisContext, route: Route): Promise<ProviderOutcome<OutputFor<K>>>;
}

export function provenance(p: Omit<Provenance, "at">): Provenance {
  return { ...p, at: new Date().toISOString() };
}

const DENY_REASONS: Record<string, Unavailable> = {
  quota_exhausted: "quota",
  rate_limited: "quota",
  plus_required: "not_entitled",
  plus_cost_cap: "cost_cap",
  budget_paused: "budget_paused",
  disabled: "kill_switch",
  signed_out: "signed_out",
};

// A thrown error as a reason and a sentence for the person.
export function classifyError(error: unknown): { reason: Unavailable; message: string } {
  const message = describeCloudError(error);
  if (error instanceof TonoApiError) return { reason: DENY_REASONS[error.code] ?? "error", message };
  // fetch rejects with a TypeError when there's no connection.
  if (error instanceof TypeError || error instanceof TimeoutError) return { reason: "offline", message };
  return { reason: "error", message };
}
