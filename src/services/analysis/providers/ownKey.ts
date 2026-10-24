import type { AnalysisContext, AnalysisKind } from "../../../domain/analysis/types";
import type { Route } from "../../../domain/analysis/routing";
import { acceptReview, rewindReviewSchema } from "../../../domain/rewind/reviewPrompt";
import { acceptSummaryReview } from "../../../domain/summary/summaryReviewPrompt";
import type { TokenUsage } from "../../../domain/cloudUsage";
import { generateContent } from "../../gemini/geminiClient";
import { callTextProvider, type TextProviderId } from "../../cloud/textProviders";
import { toStrictSchema } from "../../cloud/jsonSchema";
import { DAILY_REVIEW_LIMIT, MAX_REVIEW_WORDS, reviewsLeft, wordCount } from "../../cloud/inputGuards";
import { measuredReview } from "../../cloud/measuredReview";
import { modelFor, PROVIDERS, type KeyProviderId } from "../../cloud/providers";
import { getCloudCallsToday, noteCloudCall } from "../../prefs/prefsStore";
import { todayISODate } from "../../../utils/dateUtils";
import { withDeadline } from "../../../utils/fetchWithTimeout";
import { PROMPT_VERSIONS, type InputFor, type OutputFor } from "../kinds";
import { rewindNotesRequest, summaryNotesRequest, type TextRequest } from "../prompts";
import { provenance, type AnalysisProvider, type ProviderOutcome } from "../provider";
import { reviewFromVideo } from "./videoReview";

// The person's own key (Gemini, OpenAI, Claude, OpenRouter), called straight
// from the phone. Kept working behind the interface until session 08 removes
// bring-your-own-key. A call is paid for with their own key, so a stuck retry
// is capped at a daily count here.

const TIMEOUT_MS = 25_000;

async function directText(id: KeyProviderId, request: TextRequest, schemaName: string, onUsage?: (u: TokenUsage) => void): Promise<string> {
  if (id === "gemini") {
    return withDeadline(generateContent({ systemPrompt: `${request.system}\n\n${request.user}`, responseSchema: request.schema, onUsage }), TIMEOUT_MS, `${PROVIDERS[id].name} notes`);
  }
  return withDeadline(
    callTextProvider({ provider: id as TextProviderId, model: modelFor(id), system: request.system, user: request.user, schemaName, schema: toStrictSchema(request.schema), onUsage }),
    TIMEOUT_MS,
    `${PROVIDERS[id].name} notes`,
  );
}

export const ownKeyProvider: AnalysisProvider = {
  id: "own_key",
  supports: (kind: AnalysisKind) => kind === "take_review" || kind === "rewind_notes" || kind === "summary_notes",
  async run<K extends AnalysisKind>(kind: K, input: InputFor<K>, ctx: AnalysisContext, _route: Route): Promise<ProviderOutcome<OutputFor<K>>> {
    type Out = ProviderOutcome<OutputFor<K>>;
    const id = ctx.ownKey;
    if (!id) return { ok: false, reason: "unsupported" };
    const name = PROVIDERS[id].name;
    const today = todayISODate();
    if (reviewsLeft(getCloudCallsToday(today)) <= 0) {
      return { ok: false, reason: "quota", message: `That's ${DAILY_REVIEW_LIMIT} reviews today — the daily limit that keeps a stuck retry from running up your bill. It resets tomorrow.` };
    }
    const meta = (promptVersion: string, input: "text" | "video") => provenance({ producer: "own_key", provider: name, model: modelFor(id), promptVersion, judged: true, input });

    switch (kind) {
      case "take_review": {
        const take = input as InputFor<"take_review">;
        noteCloudCall(today);
        if (id === "gemini") {
          const { model: _ignored, ...value } = await reviewFromVideo(take, "direct");
          return { ok: true, value: { ...value, providerId: id }, provenance: meta(PROMPT_VERSIONS.take_review_video, "video") } as Out;
        }
        const transcript = take.session.transcriptVerbatim ?? "";
        if (!transcript.trim()) return { ok: false, reason: "no_input", message: `${name} reviews the on-device transcript, and this take doesn't have one yet.` };
        if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, reason: "too_long", message: `This take is too long for a deep review (over ${MAX_REVIEW_WORDS.toLocaleString()} words).` };
        const started = Date.now();
        const seen: { usage?: TokenUsage } = {};
        const analysis = await measuredReview(take, id as TextProviderId, (u) => {
          seen.usage = u;
        });
        return {
          ok: true,
          value: { analysis, quickCoach: null, heardAudio: false, usage: seen.usage ?? null, elapsedMs: Date.now() - started, videoBytes: null, providerId: id },
          provenance: meta(PROMPT_VERSIONS.take_review_text, "text"),
        } as Out;
      }

      case "rewind_notes": {
        const { transcript } = input as InputFor<"rewind_notes">;
        if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, reason: "too_long", message: "That take is too long to send." };
        noteCloudCall(today);
        const raw = await directText(id, rewindNotesRequest({ transcript }), "rewind_review");
        const parsed = rewindReviewSchema.safeParse(JSON.parse(raw));
        const accepted = parsed.success ? acceptReview(parsed.data) : null;
        if (!accepted) return { ok: false, reason: "error", message: `${name} didn't send back usable notes. Try again.` };
        return { ok: true, value: accepted as OutputFor<K>, provenance: meta(PROMPT_VERSIONS.rewind_notes, "text") };
      }

      case "summary_notes": {
        const summary = input as InputFor<"summary_notes">;
        noteCloudCall(today);
        const raw = await directText(id, summaryNotesRequest(summary), "summary_review");
        const accepted = acceptSummaryReview(summary.setup, JSON.parse(raw), summary.transcripts);
        if (!accepted) return { ok: false, reason: "error", message: `${name}'s notes weren't usable.` };
        return { ok: true, value: accepted as OutputFor<K>, provenance: meta(PROMPT_VERSIONS.summary_notes, "text") };
      }
    }
    return { ok: false, reason: "unsupported" };
  },
};
