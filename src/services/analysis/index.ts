import type { AnalysisKind, AnalysisResult, ShowLevel } from "../../domain/analysis/types";
import { whatCanShow } from "../../domain/analysis/routing";
import { analysisContext, type ContextArgs } from "../cloud/routing";
import type { InputFor, OutputFor } from "./kinds";
import { ownKeyProvider } from "./providers/ownKey";
import { rulesProvider } from "./providers/rules";
import { tonoAiProvider } from "./providers/tonoAi";
import { createAnalysisService, type RequestOptions } from "./service";

// The app's AnalysisService, with its providers. Steps and screens call
// requestAnalysis; they get one result shape back and label it from its
// provenance (domain/analysis/provenance.ts).

export const analysis = createAnalysisService({ providers: [tonoAiProvider, ownKeyProvider, rulesProvider] });

export async function requestAnalysis<K extends AnalysisKind>(
  kind: K,
  input: InputFor<K>,
  args: ContextArgs & RequestOptions,
): Promise<AnalysisResult<OutputFor<K>>> {
  const ctx = await analysisContext({ ...args, kind, refresh: args.refresh ?? true });
  return analysis.request(kind, input, ctx, { takeId: args.takeId });
}

// Whether a judge would take this on now (for a switch's default or a
// button's label). No server call.
export async function showLevelFor(kind: AnalysisKind, args: ContextArgs): Promise<ShowLevel> {
  return whatCanShow(kind, await analysisContext(args));
}

export type { InputFor, OutputFor } from "./kinds";
