import type { AnalysisContext, AnalysisKind } from "../../../domain/analysis/types";
import type { Route } from "../../../domain/analysis/routing";
import { acceptModelMarks } from "../../../domain/cadence/autoMarkPrompt";
import { acceptReview, rewindReviewSchema } from "../../../domain/rewind/reviewPrompt";
import { acceptSummaryReview } from "../../../domain/summary/summaryReviewPrompt";
import type { TokenUsage } from "../../../domain/cloudUsage";
import { generateContent, type HostedResult } from "../../gemini/geminiClient";
import { MAX_REVIEW_WORDS, wordCount } from "../../cloud/inputGuards";
import { parseMeasuredReview } from "../../cloud/measuredReview";
import { withDeadline } from "../../../utils/fetchWithTimeout";
import { PROMPT_VERSIONS, type InputFor, type OutputFor, type TakeReviewInput, type TakeReviewOutput } from "../kinds";
import { markUpRequest, rewindNotesRequest, summaryNotesRequest, takeReviewTextRequest, type TextRequest } from "../prompts";
import { provenance, type AnalysisProvider, type ProviderOutcome } from "../provider";
import { reviewFromVideo } from "./videoReview";

// Tono AI: the judge of record, through Tono's server (which holds the key,
// picks the model and counts the allowance). A take review sends the
// transcript and the phone's measurements by default, or the video when
// that's the setting or there's no transcript (domain/analysis/routing.ts).

const NAME = "Tono AI";
const TEXT_TIMEOUT_MS = 70_000;
// A drill's notes and a mark-up are waited on: give up sooner.
const QUICK_TIMEOUT_MS = 25_000;

async function hostedText(request: TextRequest, onUsage?: (u: TokenUsage) => void, timeoutMs = TEXT_TIMEOUT_MS): Promise<{ text: string; model?: string }> {
  const seen: { model?: string } = {};
  const text = await withDeadline(
    generateContent({
      systemPrompt: `${request.system}\n\n${request.user}`,
      responseSchema: request.schema,
      transport: "hosted",
      kind: "text",
      onUsage,
      onHosted: (r: HostedResult) => {
        seen.model = r.model;
      },
    }),
    timeoutMs,
    "Tono AI",
  );
  return { text, model: seen.model };
}

async function takeReview(input: TakeReviewInput, route: Route): Promise<ProviderOutcome<TakeReviewOutput>> {
  if (route.tonoInput === "video") {
    const out = await reviewFromVideo(input, "hosted");
    const { model, ...value } = out;
    return { ok: true, value: { ...value, providerId: "tono" }, provenance: provenance({ producer: "tono_ai", provider: NAME, model, promptVersion: PROMPT_VERSIONS.take_review_video, judged: true, input: "video" }) };
  }
  const transcript = input.session.transcriptVerbatim ?? "";
  if (!transcript.trim()) return { ok: false, reason: "no_input", message: "This take has no transcript yet." };
  if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, reason: "too_long", message: `This take is too long for a review (over ${MAX_REVIEW_WORDS.toLocaleString()} words).` };
  const started = Date.now();
  const seen: { usage?: TokenUsage } = {};
  const { text, model } = await hostedText(takeReviewTextRequest(input, true), (u) => {
    seen.usage = u;
  });
  const analysis = parseMeasuredReview(text, input.session, NAME);
  return {
    ok: true,
    value: { analysis, quickCoach: analysis.quick_coach ?? null, heardAudio: false, usage: seen.usage ?? null, elapsedMs: Date.now() - started, videoBytes: null, providerId: "tono" },
    provenance: provenance({ producer: "tono_ai", provider: NAME, model, promptVersion: PROMPT_VERSIONS.take_review_text, judged: true, input: "text" }),
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
        const { transcript } = input as InputFor<"rewind_notes">;
        if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, reason: "too_long", message: "That take is too long to send." };
        const { text, model } = await hostedText(rewindNotesRequest({ transcript }));
        const parsed = rewindReviewSchema.safeParse(JSON.parse(text));
        const accepted = parsed.success ? acceptReview(parsed.data) : null;
        if (!accepted) return { ok: false, reason: "error", message: "Tono AI didn't send back usable notes. Try again." };
        return { ok: true, value: accepted as OutputFor<K>, provenance: provenance({ producer: "tono_ai", provider: NAME, model, promptVersion: PROMPT_VERSIONS.rewind_notes, judged: true, input: "text" }) };
      }

      case "summary_notes": {
        const summary = input as InputFor<"summary_notes">;
        const { text, model } = await hostedText(summaryNotesRequest(summary), undefined, QUICK_TIMEOUT_MS);
        const accepted = acceptSummaryReview(summary.setup, JSON.parse(text), summary.transcripts);
        if (!accepted) return { ok: false, reason: "error", message: "Tono AI's notes weren't usable." };
        return { ok: true, value: accepted as OutputFor<K>, provenance: provenance({ producer: "tono_ai", provider: NAME, model, promptVersion: PROMPT_VERSIONS.summary_notes, judged: true, input: "text" }) };
      }

      case "mark_up": {
        const { text: source } = input as InputFor<"mark_up">;
        const { text, model } = await hostedText(markUpRequest({ text: source }), undefined, QUICK_TIMEOUT_MS);
        const marked = (JSON.parse(text) as { marked?: unknown }).marked;
        // The words must come back exactly as given, or it isn't used.
        const accepted = typeof marked === "string" ? acceptModelMarks(source, marked) : null;
        if (!accepted) return { ok: false, reason: "error", message: "Tono AI changed the words or marked nothing." };
        return { ok: true, value: accepted as OutputFor<K>, provenance: provenance({ producer: "tono_ai", provider: NAME, model, promptVersion: PROMPT_VERSIONS.mark_up, judged: true, input: "text" }) };
      }
    }
    return { ok: false, reason: "unsupported" };
  },
};
