import { describeAllowance, statusForDeny } from "../_shared/allowanceInfo.ts";
import { requireUser } from "../_shared/auth.ts";
import { priceAt, type ServerConfig } from "../_shared/config.ts";
import {
  AUDIO_TOKENS_PER_SECOND,
  conversationCharge,
  PARTNER_MOODS,
  pcmSeconds,
  speakableText,
  speechSecondsFor,
  TTS_SAMPLE_RATE,
  TTS_VOICE_NAMES,
  type PartnerMood,
} from "../_shared/conversation.ts";
import { generate, GeminiError, speak } from "../_shared/gemini.ts";
import { env, handler, HttpError, readJson } from "../_shared/http.ts";
import { finish, loadConfig, peekSnapshot, refund, reserve, type ReserveResult } from "../_shared/ledger.ts";
import { pickModel } from "../_shared/models.ts";
import { costUsd, estimateCostUsd, estimateTextTokens, tokensFromGeminiUsage } from "../_shared/pricing.ts";
import { acceptPartnerLine } from "../_shared/prompts/conversation.ts";
import { TASKS } from "../_shared/prompts/index.ts";
import { converseRequestSchema } from "../_shared/request.ts";
import { bytesToBase64, PcmChunker } from "../_shared/tts.ts";

// The live conversation partner (docs/decisions/conversation-voice.md). One
// request per partner turn, so the phone waits on one round trip:
//
//   op "turn":  writes the partner's next line from the conversation so far
//               (the conversation model, thinking off), then speaks it.
//   op "speak": speaks a line the app already has (the scripted opener, the
//               Dev voice lab).
//
// The answer streams as newline-delimited JSON, so the phone can show the
// words and start playing before the whole line is spoken:
//   {"type":"line", ...}      the words (turn: as soon as they're written)
//   {"type":"audio","pcm"}    base64 16-bit PCM, 24 kHz mono, about 0.2 s each
//   {"type":"done", ...}      timings, the allowance, and whether there was a voice
//   {"type":"error","code"}   something failed after the stream started
//
// Minutes are metered here, from the time between a conversation's calls
// (_shared/conversation.ts); the phone never reports them. Each turn is two
// ledger rows (the line and its voice), so every model's cost is on record.

// About 0.2 s of audio per event: small enough that the first one comes
// quickly, big enough that a line is a handful of events.
const CHUNK_BYTES = Math.round(TTS_SAMPLE_RATE * 2 * 0.2);

function denied(config: ServerConfig, reservation: Extract<ReserveResult, { ok: false }>, userId: string): Promise<never> {
  return (async () => {
    const view = reservation.snapshot ? describeAllowance(config, reservation.snapshot, new Date(), (await peekSnapshot(userId)).trialEndsAt) : undefined;
    throw new HttpError(statusForDeny(reservation.reason), reservation.reason, undefined, { allowance: view });
  })();
}

function voiceEstimate(config: ServerConfig, model: string, line: string, now: Date): number {
  const price = priceAt(config.prices[model], now);
  // Twice the expected audio, capped at the role's ceiling.
  const audioTokens = Math.min(config.models.tts.maxOutputTokens, Math.ceil(speechSecondsFor(line) * AUDIO_TOKENS_PER_SECOND * 2) + 50);
  return estimateCostUsd({ inputTokens: estimateTextTokens(line.length + 80), maxOutputTokens: audioTokens, price });
}

Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);
    const config = await loadConfig();
    const parsed = converseRequestSchema(config.limits, TTS_VOICE_NAMES).safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", parsed.error.issues[0]?.message);
    const request = parsed.data;
    const key = env("GEMINI_API_KEY");
    const started = Date.now();
    const limits = { maxTurnSeconds: config.limits.conversationMaxTurnSeconds, maxMinutes: config.limits.conversationMaxMinutes };

    // ---- the line ----
    let line: string;
    let mood: PartnerMood = "warm";
    let ended = false;
    let safety: "ok" | "redirect" | "crisis" = "ok";
    let lineMeta: { model: string; promptVersion: string; llmMs: number } | null = null;

    if (request.op === "turn") {
      const task = TASKS.conversation_turn;
      if (request.schemaVersion !== task.schemaVersion) throw new HttpError(400, "unsupported_schema");
      const inputs = task.inputs.safeParse(request.inputs);
      if (!inputs.success) throw new HttpError(400, "bad_request", inputs.error.issues[0]?.message);
      const built = task.build(inputs.data as never, "text");
      const role = config.models.conversation;
      const choice = pickModel("conversation", user.id, config);
      const candidates = [choice.model, ...(choice.fallback ? [choice.fallback] : [])];
      const inputTokens = estimateTextTokens(built.prompt.length + JSON.stringify(built.schema).length);
      const now = new Date();
      const est = Math.max(...candidates.map((m) => estimateCostUsd({ inputTokens, maxOutputTokens: role.maxOutputTokens, price: priceAt(config.prices[m], now) })));
      const reservation = await reserve({
        userId: user.id,
        kind: "conversation",
        idempotencyKey: request.idempotencyKey,
        config,
        choice,
        estCostUsd: est,
        conversation: { id: request.conversationId, charge: (span) => conversationCharge({ span, now: new Date(), ...limits }) },
      });
      if (!reservation.ok) return denied(config, reservation, user.id);

      let accepted: ReturnType<typeof acceptPartnerLine> = null;
      let usedModel = choice.model;
      let usage: Parameters<typeof tokensFromGeminiUsage>[0] = null;
      let failure = "";
      for (const [i, model] of candidates.entries()) {
        try {
          const attempt = await generate(key, {
            model,
            systemPrompt: built.prompt,
            schema: built.schema,
            maxOutputTokens: role.maxOutputTokens,
            thinkingBudget: role.thinkingBudget,
          });
          accepted = acceptPartnerLine(JSON.parse(attempt.text));
          usage = (attempt.body.usageMetadata ?? null) as typeof usage;
          usedModel = model;
          if (accepted) break;
          failure = "unusable line";
        } catch (e) {
          failure = e instanceof Error ? e.message : "unknown";
          const retryable = e instanceof SyntaxError || (e instanceof GeminiError && e.retryable);
          if (!retryable || i === candidates.length - 1) break;
        }
      }
      if (!accepted) {
        await refund(reservation.callId, failure);
        throw new HttpError(502, "upstream_failed");
      }
      const tokens = tokensFromGeminiUsage(usage);
      await finish(reservation.callId, {
        model: usedModel,
        usedFallback: usedModel !== choice.model,
        tokens,
        costUsd: tokens ? costUsd(tokens, priceAt(config.prices[usedModel], new Date())) : est,
      });
      ({ line, ended, safety } = accepted);
      mood = (accepted.mood in PARTNER_MOODS ? accepted.mood : "warm") as PartnerMood;
      lineMeta = { model: usedModel, promptVersion: built.promptVersion, llmMs: Date.now() - started };
    } else {
      line = speakableText(request.text);
      if (!line) throw new HttpError(400, "bad_request", "Nothing to say");
      if (request.mood && request.mood in PARTNER_MOODS) mood = request.mood as PartnerMood;
    }

    // ---- the voice ----
    const spoken = speakableText(line);
    const ttsChoice = pickModel("tts", user.id, config);
    const ttsModels = [ttsChoice.model, ...(ttsChoice.fallback ? [ttsChoice.fallback] : [])];
    const now = new Date();
    const ttsEst = Math.max(...ttsModels.map((m) => voiceEstimate(config, m, spoken, now)));
    const voiceReservation = await reserve({
      userId: user.id,
      kind: "conversation",
      idempotencyKey: request.op === "turn" ? `${request.idempotencyKey}-v` : request.idempotencyKey,
      config,
      choice: ttsChoice,
      estCostUsd: ttsEst,
      conversation: {
        id: request.conversationId,
        // A turn's time was charged with its line. A line spoken on its own
        // (the opener) is charged here.
        charge: (span) => (request.op === "turn" ? 0 : conversationCharge({ span, now: new Date(), firstLine: spoken, ...limits })),
      },
      // A line already written gets its voice even if that used the last minute.
      finishing: request.op === "turn",
    });
    if (!voiceReservation.ok && request.op === "speak") return denied(config, voiceReservation, user.id);

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          await streamVoice(send);
        } catch (e) {
          console.error("converse stream failed", e instanceof Error ? e.message : e);
          send({ type: "error", code: "internal" });
        }
        controller.close();
      },
    });

    async function streamVoice(send: (event: Record<string, unknown>) => void): Promise<void> {
      send({ type: "line", line, mood, ended, safety, ...(lineMeta ? { model: lineMeta.model, promptVersion: lineMeta.promptVersion } : {}) });

      let voice: { model: string; bytes: number; firstAudioMs: number | null; streamed: boolean } | null = null;
      let noVoice: string | null = voiceReservation.ok ? null : voiceReservation.reason;
      const ttsStarted = Date.now();
      if (voiceReservation.ok) {
        let failure = "";
        for (const [i, model] of ttsModels.entries()) {
          const chunker = new PcmChunker(CHUNK_BYTES);
          let sent = 0;
          try {
            const result = await speak(key, { model, text: spoken, voice: request.voice, style: PARTNER_MOODS[mood] }, (pcm) => {
              for (const chunk of chunker.push(pcm)) {
                sent += chunk.length;
                send({ type: "audio", pcm: bytesToBase64(chunk) });
              }
            });
            const rest = chunker.end();
            if (rest) send({ type: "audio", pcm: bytesToBase64(rest) });
            const audioTokens = Math.ceil(pcmSeconds(result.bytes) * AUDIO_TOKENS_PER_SECOND);
            const tokens = {
              inputText: result.usage?.inputTokens ?? estimateTextTokens(spoken.length),
              inputVideo: 0,
              inputAudio: 0,
              output: result.usage?.outputTokens ?? audioTokens,
              thinking: 0,
            };
            await finish(voiceReservation.callId, { model, usedFallback: i > 0, tokens, costUsd: costUsd(tokens, priceAt(config.prices[model], new Date())) });
            voice = { model, bytes: result.bytes, firstAudioMs: result.firstAudioMs, streamed: result.streamed };
            break;
          } catch (e) {
            failure = e instanceof Error ? e.message : "unknown";
            console.warn(`speak failed on ${model}:`, failure);
            // Once audio has gone out, a second voice would talk over it.
            const retryable = sent === 0 && e instanceof GeminiError && e.retryable;
            if (!retryable || i === ttsModels.length - 1) break;
          }
        }
        if (!voice) {
          await refund(voiceReservation.callId, failure);
          noVoice = "voice_failed";
        }
      }

      const after = await peekSnapshot(user.id).catch(() => null);
      send({
        type: "done",
        voice: voice ? { model: voice.model, seconds: Math.round(pcmSeconds(voice.bytes) * 100) / 100, streamed: voice.streamed } : null,
        noVoice,
        sampleRate: TTS_SAMPLE_RATE,
        timing: {
          llmMs: lineMeta?.llmMs ?? null,
          ttsFirstAudioMs: voice?.firstAudioMs ?? null,
          ttsMs: voice ? Date.now() - ttsStarted : null,
          totalMs: Date.now() - started,
        },
        allowance: after ? describeAllowance(config, after.snapshot, new Date(), after.trialEndsAt) : null,
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }),
);
