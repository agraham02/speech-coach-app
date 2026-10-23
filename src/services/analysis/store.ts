import type { AnalysisKind, AnalysisResult, Provenance, Unavailable } from "../../domain/analysis/types";
import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { logger } from "../../utils/logger";

// What happened to each kind of analysis on a take, with its provenance, so a
// judged result survives a relaunch and a model change can be traced. The
// values themselves stay where their readers look (the scores row, the coach
// artifact); this keeps the envelope. Watchers hear every change.

export interface StoredAnalysis {
  status: "done" | "pending" | "unavailable";
  provenance?: Provenance;
  reason?: Unavailable;
  message?: string;
  // An unavailable result that still showed something (the rules' version).
  fallback?: Provenance;
  at: string;
}

export type TakeAnalyses = Partial<Record<AnalysisKind, StoredAnalysis>>;

type Listener = (kind: AnalysisKind, record: StoredAnalysis) => void;
const listeners = new Map<string, Set<Listener>>();

export function envelopeOf(result: AnalysisResult<unknown>): StoredAnalysis {
  const at = new Date().toISOString();
  if (result.status === "done") return { status: "done", provenance: result.provenance, at };
  if (result.status === "pending") return { status: "pending", at };
  return {
    status: "unavailable",
    reason: result.reason,
    ...(result.message ? { message: result.message } : {}),
    ...(result.fallback ? { fallback: result.fallback.provenance } : {}),
    at,
  };
}

export async function getTakeAnalyses(takeId: string): Promise<TakeAnalyses> {
  return (await getArtifact<TakeAnalyses>(takeId, "analysis")) ?? {};
}

export async function recordAnalysis(takeId: string, kind: AnalysisKind, record: StoredAnalysis): Promise<void> {
  try {
    const current = await getTakeAnalyses(takeId);
    await putArtifact(takeId, "analysis", { ...current, [kind]: record });
  } catch (error) {
    logger.warn(`[analysis] couldn't record ${kind} for ${takeId} — ${(error as Error).message}`);
  }
  for (const listener of listeners.get(takeId) ?? []) listener(kind, record);
}

// Hears every change to a take's analyses (pending → done, across the app).
// Returns the unsubscribe.
export function watchTake(takeId: string, listener: Listener): () => void {
  const set = listeners.get(takeId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(takeId, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(takeId);
  };
}
