import { routeAnalysis, whatCanShow } from "../../domain/analysis/routing";
import type { AnalysisContext, AnalysisKind, AnalysisResult, Producer, ShowLevel, Unavailable } from "../../domain/analysis/types";
import { logger } from "../../utils/logger";
import type { InputFor, OutputFor } from "./kinds";
import { classifyError, type AnalysisProvider } from "./provider";
import { envelopeOf, recordAnalysis, watchTake, type StoredAnalysis } from "./store";

// The AnalysisService: one door for every kind of analysis. A caller asks for
// a kind with its typed input; the service routes it (domain/analysis/
// routing.ts), runs the providers in order until one answers, records the
// outcome on the take with its provenance, and returns one result shape. The
// caller never learns which model or prompt was used except through the
// provenance, which is what the UI labels from.
//
// Degrading: a judged producer that fails hands over to the next one; if
// only the rules answer after a judged producer was meant to, the result is
// "unavailable" with the rules' version as its fallback, so the screen can
// say what happened and still show something.

export interface RequestOptions {
  // The take this belongs to; its outcome is recorded there.
  takeId?: string;
}

export interface AnalysisService {
  request<K extends AnalysisKind>(kind: K, input: InputFor<K>, ctx: AnalysisContext, opts?: RequestOptions): Promise<AnalysisResult<OutputFor<K>>>;
  // Hears a take's analyses change (pending → done), across screens.
  observe(takeId: string, cb: (kind: AnalysisKind, record: StoredAnalysis) => void): () => void;
  whatCanShow(kind: AnalysisKind, ctx: AnalysisContext): ShowLevel;
}

export interface ServiceDeps {
  providers: AnalysisProvider[];
  record?: (takeId: string, kind: AnalysisKind, record: StoredAnalysis) => Promise<void>;
  watch?: typeof watchTake;
}

const JUDGES: Producer[] = ["tono_ai"];

export function createAnalysisService(deps: ServiceDeps): AnalysisService {
  const record = deps.record ?? recordAnalysis;
  const byId = new Map(deps.providers.map((p) => [p.id, p]));

  async function request<K extends AnalysisKind>(kind: K, input: InputFor<K>, ctx: AnalysisContext, opts: RequestOptions = {}): Promise<AnalysisResult<OutputFor<K>>> {
    const route = routeAnalysis(kind, ctx);
    if (opts.takeId && route.producers.some((p) => JUDGES.includes(p))) await record(opts.takeId, kind, envelopeOf({ status: "pending" }));

    let firstFailure: { reason: Unavailable; message?: string } | null = route.blocked ? { reason: route.blocked } : null;
    let judgedTried = false;
    let judgedFailed = false;
    let result: AnalysisResult<OutputFor<K>> | null = null;

    for (const id of route.producers) {
      const provider = byId.get(id);
      if (!provider || !provider.supports(kind)) continue;
      if (JUDGES.includes(id)) judgedTried = true;
      let outcome;
      try {
        outcome = await provider.run(kind, input, ctx, route);
      } catch (error) {
        const { reason, message } = classifyError(error);
        logger.warn(`[analysis] ${kind} from ${id} failed (${reason}) — ${(error as Error)?.message ?? error}`);
        outcome = { ok: false as const, reason, message };
      }
      if (outcome.ok) {
        // The rules answering after a judge failed is a fallback, not the
        // result that was asked for.
        result =
          judgedTried && !JUDGES.includes(id) && firstFailure
            ? { status: "unavailable", reason: firstFailure.reason, message: firstFailure.message, fallback: { value: outcome.value, provenance: outcome.provenance } }
            : { status: "done", value: outcome.value, provenance: outcome.provenance };
        break;
      }
      // The first judge's failure is the one worth telling.
      if (!judgedFailed) {
        firstFailure = { reason: outcome.reason, message: outcome.message };
        judgedFailed = true;
      }
    }

    if (!result) result = { status: "unavailable", reason: firstFailure?.reason ?? "unsupported", ...(firstFailure?.message ? { message: firstFailure.message } : {}) };
    if (opts.takeId && (judgedTried || result.status === "done")) await record(opts.takeId, kind, envelopeOf(result));
    return result;
  }

  return {
    request,
    observe: (takeId, cb) => (deps.watch ?? watchTake)(takeId, cb),
    whatCanShow,
  };
}
