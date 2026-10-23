import { describeAllowance, statusForDeny } from "../_shared/allowanceInfo.ts";
import { requireUser } from "../_shared/auth.ts";
import type { ServerConfig } from "../_shared/config.ts";
import { deleteFile, generate, GeminiError, getFile, type GenerateResult } from "../_shared/gemini.ts";
import { env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { db, finish, loadConfig, peekSnapshot, refund, reserve } from "../_shared/ledger.ts";
import { pickModel } from "../_shared/models.ts";
import { costUsd, estimateCostUsd, estimateTextTokens, estimateVideoInputTokens, tokensFromGeminiUsage } from "../_shared/pricing.ts";
import { generateRequestSchema, type GenerateRequest } from "../_shared/request.ts";
import { roleForKind } from "../_shared/types.ts";

// The one place Tono AI runs a model. The phone sends a prompt, a JSON schema
// and (for a review) the name of its uploaded video; the server decides the
// model, enforces the limits, calls Gemini with its own key, records the real
// cost and gives back Gemini's raw answer. The phone still parses and validates
// the answer, exactly as it does for an own-key call.

function estimateCost(config: ServerConfig, req: GenerateRequest, models: string[]): number {
  const role = roleForKind(req.kind);
  const r = config.models[role];
  const inputTokens =
    estimateTextTokens(req.systemPrompt.length + JSON.stringify(req.schema).length) +
    (req.kind === "review" ? estimateVideoInputTokens(req.videoSeconds ?? config.limits.maxVideoSeconds, r.videoFps ?? 1) : 0);
  return Math.max(...models.map((m) => estimateCostUsd({ inputTokens, maxOutputTokens: r.maxOutputTokens, price: config.prices[m] })));
}

Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);
    const config = await loadConfig();

    const parsed = generateRequestSchema(config.limits).safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", parsed.error.issues[0]?.message);
    const request = parsed.data;

    const role = roleForKind(request.kind);
    const roleConfig = config.models[role];
    const choice = pickModel(role, user.id, config);
    const candidates = [choice.model, ...(choice.fallback ? [choice.fallback] : [])];
    const est = estimateCost(config, request, candidates);

    // A review needs a video this person uploaded and Google has finished with.
    const key = env("GEMINI_API_KEY");
    let file: { name: string; mimeType: string } | undefined;
    if (request.kind === "review") {
      const owned = await db()`
        select id from public.uploads where file_name = ${request.fileName!} and user_id = ${user.id}
      `;
      if (owned.length === 0) throw new HttpError(404, "file_not_found");
      const remote = await getFile(key, request.fileName!).catch(() => null);
      if (!remote) throw new HttpError(404, "file_not_found");
      if (remote.state !== "ACTIVE") throw new HttpError(409, "file_not_ready");
      file = { name: request.fileName!, mimeType: remote.mimeType ?? "video/mp4" };
    }

    const reservation = await reserve({
      userId: user.id,
      kind: request.kind,
      idempotencyKey: request.idempotencyKey,
      config,
      choice,
      estCostUsd: est,
    });
    if (!reservation.ok) {
      const allowance = reservation.snapshot ? describeAllowance(config, reservation.snapshot, new Date()) : undefined;
      throw new HttpError(statusForDeny(reservation.reason), reservation.reason, undefined, { allowance });
    }

    // Primary model first, then the fallback once if Google could not serve it.
    let result: GenerateResult | null = null;
    let usedModel = choice.model;
    let usedFallback = false;
    let failure = "";
    for (const [i, model] of candidates.entries()) {
      try {
        result = await generate(key, {
          model,
          systemPrompt: request.systemPrompt,
          schema: request.schema,
          file,
          maxOutputTokens: roleConfig.maxOutputTokens,
          thinkingBudget: roleConfig.thinkingBudget,
          videoFps: roleConfig.videoFps,
        });
        usedModel = model;
        usedFallback = i > 0;
        break;
      } catch (e) {
        failure = e instanceof Error ? e.message : "unknown";
        console.warn(`generate failed on ${model}:`, failure);
        if (!(e instanceof GeminiError) || !e.retryable) break;
      }
    }

    if (!result) {
      await refund(reservation.callId, user.id, failure);
      throw new HttpError(502, "upstream_failed");
    }

    const usage = (result.body.usageMetadata ?? null) as Parameters<typeof tokensFromGeminiUsage>[0];
    const tokens = tokensFromGeminiUsage(usage);
    const price = config.prices[usedModel];
    // If Google sent no usage numbers, bill the reserved estimate rather than zero.
    const cost = tokens ? costUsd(tokens, price) : est;
    await finish(reservation.callId, { model: usedModel, usedFallback, tokens, costUsd: cost });

    // The video has done its job; do not keep it. (A failed review keeps it so
    // a retry can reuse the upload.)
    if (file) {
      await deleteFile(key, file.name);
      await db()`delete from public.uploads where file_name = ${file.name} and user_id = ${user.id}`;
    }

    const snapshot = await peekSnapshot(user.id);
    return json({
      gemini: result.body,
      model: usedModel,
      usedFallback,
      allowance: describeAllowance(config, snapshot, new Date()),
    });
  }),
);
