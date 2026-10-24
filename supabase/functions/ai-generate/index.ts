import { describeAllowance, statusForDeny } from "../_shared/allowanceInfo.ts";
import { requireUser } from "../_shared/auth.ts";
import type { ServerConfig } from "../_shared/config.ts";
import { deleteFile, generate, GeminiError, getFile, type GenerateResult } from "../_shared/gemini.ts";
import { env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { db, finish, loadConfig, peekSnapshot, refund, reserve } from "../_shared/ledger.ts";
import { pickModel } from "../_shared/models.ts";
import { costUsd, estimateCostUsd, estimateTextTokens, estimateVideoInputTokens, tokensFromGeminiUsage } from "../_shared/pricing.ts";
import { TASKS, type BuiltRequest } from "../_shared/prompts/index.ts";
import { generateRequestSchema, parseTaskInputs } from "../_shared/request.ts";
import type { ModelRole } from "../_shared/types.ts";

// The one place Tono AI runs a model. The phone names a task and sends its
// structured inputs (never a prompt); the server writes the prompt and the
// answer's schema (_shared/prompts), decides the model, enforces the limits,
// calls Gemini with its own key, records the real cost and gives back the
// answer as JSON. The phone still validates every answer.

function estimateCost(config: ServerConfig, role: ModelRole, built: BuiltRequest, videoSeconds: number | null, models: string[]): number {
  const r = config.models[role];
  const inputTokens =
    estimateTextTokens(built.prompt.length + JSON.stringify(built.schema).length) + (videoSeconds ? estimateVideoInputTokens(videoSeconds, r.videoFps ?? 1) : 0);
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
    const task = TASKS[request.task];
    const inputs = parseTaskInputs(request);
    if (!inputs.ok) throw new HttpError(400, request.schemaVersion !== task.schemaVersion ? "unsupported_schema" : "bad_request", inputs.message);

    const media = request.media ?? null;
    const built = task.build(inputs.inputs as never, media ? "video" : "text");
    const role = task.role(!!media);
    const roleConfig = config.models[role];
    const choice = pickModel(role, user.id, config);
    const candidates = [choice.model, ...(choice.fallback ? [choice.fallback] : [])];
    const est = estimateCost(config, role, built, media?.videoSeconds ?? null, candidates);

    // A video needs to be one this person uploaded and Google has finished with.
    const key = env("GEMINI_API_KEY");
    let file: { name: string; mimeType: string } | undefined;
    if (media) {
      const owned = await db()`
        select id from public.uploads where file_name = ${media.fileName} and user_id = ${user.id}
      `;
      if (owned.length === 0) throw new HttpError(404, "file_not_found");
      const remote = await getFile(key, media.fileName).catch(() => null);
      if (!remote) throw new HttpError(404, "file_not_found");
      if (remote.state !== "ACTIVE") throw new HttpError(409, "file_not_ready");
      file = { name: media.fileName, mimeType: remote.mimeType ?? "video/mp4" };
    }

    const reservation = await reserve({
      userId: user.id,
      kind: task.count,
      idempotencyKey: request.idempotencyKey,
      config,
      choice,
      estCostUsd: est,
    });
    if (!reservation.ok) {
      const view = reservation.snapshot ? describeAllowance(config, reservation.snapshot, new Date(), (await peekSnapshot(user.id)).trialEndsAt) : undefined;
      throw new HttpError(statusForDeny(reservation.reason), reservation.reason, undefined, { allowance: view });
    }

    // Primary model first, then the fallback once if Google could not serve it
    // or sent back something that isn't JSON.
    let result: GenerateResult | null = null;
    let output: unknown = null;
    let usedModel = choice.model;
    let usedFallback = false;
    let failure = "";
    for (const [i, model] of candidates.entries()) {
      try {
        const attempt = await generate(key, {
          model,
          systemPrompt: built.prompt,
          schema: built.schema,
          file,
          maxOutputTokens: roleConfig.maxOutputTokens,
          thinkingBudget: roleConfig.thinkingBudget,
          videoFps: roleConfig.videoFps,
        });
        output = JSON.parse(attempt.text);
        result = attempt;
        usedModel = model;
        usedFallback = i > 0;
        break;
      } catch (e) {
        failure = e instanceof Error ? e.message : "unknown";
        console.warn(`generate failed on ${model}:`, failure);
        const retryable = e instanceof SyntaxError || (e instanceof GeminiError && e.retryable);
        if (!retryable) break;
      }
    }

    if (!result) {
      await refund(reservation.callId, failure);
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

    const after = await peekSnapshot(user.id);
    return json({
      output,
      model: usedModel,
      usedFallback,
      promptVersion: built.promptVersion,
      schemaVersion: built.schemaVersion,
      // Gemini's own token counts, for the app's usage record.
      usage: usage ?? null,
      allowance: describeAllowance(config, after.snapshot, new Date(), after.trialEndsAt),
    });
  }),
);
