import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import type { AnalysisContext, AnalysisKind } from "../../../domain/analysis/types";
import type { Route } from "../../../domain/analysis/routing";
import { acceptJudgedReview, TAKE_REVIEW_SCHEMA_VERSION } from "../../../domain/analysis/judgedReview";
import { acceptModelMarks } from "../../../domain/cadence/autoMarkPrompt";
import { acceptReview, rewindReviewSchema } from "../../../domain/rewind/reviewPrompt";
import { acceptSummaryReview } from "../../../domain/summary/summaryReviewPrompt";
import { usageFromGemini } from "../../../domain/cloudUsage";
import { MAX_REVIEW_VIDEO_BYTES, MAX_REVIEW_WORDS, wordCount } from "../../cloud/inputGuards";
import { ensureAccount } from "../../account/accountStore";
import { getSessionById, updateSessionGeminiFile } from "../../db/sessionsRepo";
import { earlyUploadSettled } from "../../pipeline/earlyUpload";
import { resolveVideoUri, videoExists } from "../../storage/videoStorage";
import { tonoGenerate, type GenerateResponse, type TonoTask } from "../../tono/tonoApi";
import { resolveUploadForGrading } from "../../tono/upload";
import type { InputFor, OutputFor, TakeReviewInput, TakeReviewOutput } from "../kinds";
import { markUpInputs, rewindNotesInputs, summaryNotesInputs, takeReviewInputs } from "../inputs";
import { provenance, type AnalysisProvider, type ProviderOutcome } from "../provider";

// Tono AI: the judge of record, through Tono's server, which holds the key,
// writes the prompts, picks the model and counts the allowance. The phone
// sends a task and its structured inputs (services/analysis/inputs.ts) and
// checks every answer. A take review sends the transcript and the phone's
// measurements by default; with the Dev video setting (or no transcript) it
// sends the video too, still with the phone's transcript.

const NAME = "Tono AI";
// A drill's notes and a mark-up are waited on: give up sooner.
const QUICK_TIMEOUT_MS = 25_000;

const SCHEMA_VERSIONS: Record<TonoTask, number> = {
  take_review: TAKE_REVIEW_SCHEMA_VERSION,
  rewind_notes: 1,
  summary_notes: 1,
  mark_up: 1,
};

async function call(task: TonoTask, inputs: object, extra: { media?: { fileName: string; videoSeconds: number }; timeoutMs?: number } = {}): Promise<GenerateResponse> {
  // The behind-the-scenes account, made the first time it's needed.
  await ensureAccount();
  return tonoGenerate({ task, schemaVersion: SCHEMA_VERSIONS[task], inputs, ...(extra.media ? { media: extra.media } : {}), idempotencyKey: randomUUID() }, extra.timeoutMs);
}

const meta = (r: GenerateResponse, input: "text" | "video") =>
  provenance({ producer: "tono_ai", provider: NAME, model: r.model, promptVersion: r.promptVersion, judged: true, input });

// The video, uploaded (or an earlier upload reused) for the judge to watch.
async function mediaFor(take: TakeReviewInput): Promise<{ media: { fileName: string; videoSeconds: number }; videoBytes: number | null } | ProviderOutcome<never>> {
  const { session } = take;
  const videoUri = resolveVideoUri(session);
  if (session.videoDeletedAt || !videoExists(videoUri)) return { ok: false, reason: "no_input", message: "The video isn't on this phone any more, so it can't be watched." };
  const videoBytes = new File(videoUri).size ?? null;
  if ((videoBytes ?? 0) > MAX_REVIEW_VIDEO_BYTES) return { ok: false, reason: "too_long", message: "This video is too large to send." };
  // An upload started when the take was saved (earlyUpload.ts): wait for it.
  await earlyUploadSettled(session.id);
  const latest = (await getSessionById(session.id)) ?? session;
  const existing =
    latest.geminiFileName && latest.geminiFileUri && latest.geminiFileUploadedAt ? { name: latest.geminiFileName, uri: latest.geminiFileUri, uploadedAt: latest.geminiFileUploadedAt } : null;
  const { uploaded, reused } = await resolveUploadForGrading(videoUri, existing);
  if (!reused) await updateSessionGeminiFile(session.id, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });
  return { media: { fileName: uploaded.name, videoSeconds: Math.min(300, Math.max(1, Math.ceil(session.durationSeconds || 60))) }, videoBytes };
}

async function takeReview(input: TakeReviewInput, route: Route): Promise<ProviderOutcome<TakeReviewOutput>> {
  const transcript = input.session.transcriptVerbatim?.trim() ? input.session.transcriptVerbatim : null;
  if (transcript && wordCount(transcript) > MAX_REVIEW_WORDS) {
    return { ok: false, reason: "too_long", message: `This take is too long to judge (over ${MAX_REVIEW_WORDS.toLocaleString()} words).` };
  }
  const watch = route.tonoInput === "video";
  let media: { fileName: string; videoSeconds: number } | undefined;
  let videoBytes: number | null = null;
  if (watch) {
    const prepared = await mediaFor(input);
    if ("ok" in prepared) return prepared;
    media = prepared.media;
    videoBytes = prepared.videoBytes;
  } else if (!transcript) {
    return { ok: false, reason: "no_input", message: "This take has no transcript yet." };
  }

  const started = Date.now();
  const response = await call("take_review", takeReviewInputs(input), { media });
  const kind = input.context.kind === "script" ? "script" : "impromptu";
  const review = acceptJudgedReview(response.output, { kind, transcript });
  if (!review) return { ok: false, reason: "error", message: "Tono AI's judgement came back incomplete. Try again." };
  return {
    ok: true,
    value: {
      review,
      heardAudio: !!review.transcriptVerbatim,
      usage: usageFromGemini(response.usage as Parameters<typeof usageFromGemini>[0]),
      elapsedMs: Date.now() - started,
      videoBytes,
    },
    provenance: meta(response, watch ? "video" : "text"),
  };
}

export const tonoAiProvider: AnalysisProvider = {
  id: "tono_ai",
  supports: (kind: AnalysisKind) => kind === "take_review" || kind === "rewind_notes" || kind === "summary_notes" || kind === "mark_up",
  async run<K extends AnalysisKind>(kind: K, input: InputFor<K>, _ctx: AnalysisContext, route: Route): Promise<ProviderOutcome<OutputFor<K>>> {
    type Out = ProviderOutcome<OutputFor<K>>;
    switch (kind) {
      case "take_review":
        return (await takeReview(input as InputFor<"take_review">, route)) as Out;

      case "rewind_notes": {
        const notes = input as InputFor<"rewind_notes">;
        if (wordCount(notes.transcript) > MAX_REVIEW_WORDS) return { ok: false, reason: "too_long", message: "That take is too long to send." };
        const response = await call("rewind_notes", rewindNotesInputs(notes));
        const parsed = rewindReviewSchema.safeParse(response.output);
        const accepted = parsed.success ? acceptReview(parsed.data) : null;
        if (!accepted) return { ok: false, reason: "error", message: "Tono AI didn't send back usable notes. Try again." };
        return { ok: true, value: accepted as OutputFor<K>, provenance: meta(response, "text") };
      }

      case "summary_notes": {
        const summary = input as InputFor<"summary_notes">;
        const response = await call("summary_notes", summaryNotesInputs(summary), { timeoutMs: QUICK_TIMEOUT_MS });
        const accepted = acceptSummaryReview(summary.setup, response.output, summary.transcripts);
        if (!accepted) return { ok: false, reason: "error", message: "Tono AI's notes weren't usable." };
        return { ok: true, value: accepted as OutputFor<K>, provenance: meta(response, "text") };
      }

      case "mark_up": {
        const { text: source } = input as InputFor<"mark_up">;
        const response = await call("mark_up", markUpInputs({ text: source }), { timeoutMs: QUICK_TIMEOUT_MS });
        const marked = (response.output as { marked?: unknown } | null)?.marked;
        // The words must come back exactly as given, or it isn't used.
        const accepted = typeof marked === "string" ? acceptModelMarks(source, marked) : null;
        if (!accepted) return { ok: false, reason: "error", message: "Tono AI changed the words or marked nothing." };
        return { ok: true, value: accepted as OutputFor<K>, provenance: meta(response, "text") };
      }
    }
    return { ok: false, reason: "unsupported" };
  },
};
