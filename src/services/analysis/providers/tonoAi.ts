import type { AnalysisContext, AnalysisKind } from "../../../domain/analysis/types";
import type { Route } from "../../../domain/analysis/routing";
import { acceptModelMarks } from "../../../domain/cadence/autoMarkPrompt";
import { acceptBridgeChain, acceptWordChain, chainPairs } from "../../../domain/drills/chainJudging";
import { checkRewindReview } from "../../../domain/rewind/reviewPrompt";
import { acceptSummaryReview } from "../../../domain/summary/summaryReviewPrompt";
import type { TokenUsage } from "../../../domain/cloudUsage";
import { generateContent, type HostedResult } from "../../gemini/geminiClient";
import { MAX_REVIEW_WORDS, wordCount } from "../../cloud/inputGuards";
import { parseMeasuredReview } from "../../cloud/measuredReview";
import { withDeadline } from "../../../utils/fetchWithTimeout";
import { PROMPT_VERSIONS, type InputFor, type OutputFor, type TakeReviewInput, type TakeReviewOutput } from "../kinds";
import { bridgeChainRequest, markUpRequest, rewindNotesRequest, summaryNotesRequest, takeReviewTextRequest, wordChainRequest, type TextRequest } from "../prompts";
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
// A chain attempt is judged while the person waits on the result screen.
const CHAIN_TIMEOUT_MS = 15_000;

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

type Checked<T> = { ok: true; value: T } | { ok: false; problems: string[] };

// Asks, checks the answer against what was really said, and asks once more
// (telling the judge what was wrong) when it doesn't hold up. Null when the
// second answer is no better: nothing unchecked is ever shown. The last try is
// the check's "final" one, which settles what it can instead of failing.
async function askChecked<T>(
  build: (problems: string[]) => TextRequest,
  check: (raw: unknown, final: boolean) => Checked<T>,
  timeoutMs: number,
): Promise<{ value: T; model?: string } | null> {
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, model } = await hostedText(build(problems), undefined, timeoutMs);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      problems = ["The answer was not valid JSON."];
      continue;
    }
    const checked = check(raw, attempt === 1);
    if (checked.ok) return { value: checked.value, model };
    problems = checked.problems;
  }
  return null;
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
  supports: (kind: AnalysisKind) => kind === "take_review" || kind === "rewind_notes" || kind === "word_chain" || kind === "bridge_chain" || kind === "summary_notes" || kind === "mark_up",
  async run<K extends AnalysisKind>(kind: K, input: InputFor<K>, _ctx: AnalysisContext, route: Route): Promise<ProviderOutcome<OutputFor<K>>> {
    type Out = ProviderOutcome<OutputFor<K>>;
    switch (kind) {
      case "take_review":
        return (await takeReview(input as InputFor<"take_review">, route)) as Out;

      case "rewind_notes": {
        const { transcript } = input as InputFor<"rewind_notes">;
        if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, reason: "too_long", message: "That take is too long to send." };
        const answer = await askChecked(
          (problems) => rewindNotesRequest({ transcript }, problems),
          (raw, final) => {
            const checked = checkRewindReview(raw, transcript, { final });
            return checked.ok ? { ok: true, value: checked.review } : checked;
          },
          TEXT_TIMEOUT_MS,
        );
        if (!answer) return { ok: false, reason: "error", message: "Tono AI's notes didn't check out against what you said. Try again." };
        return { ok: true, value: answer.value as OutputFor<K>, provenance: provenance({ producer: "tono_ai", provider: NAME, model: answer.model, promptVersion: PROMPT_VERSIONS.rewind_notes, judged: true, input: "text" }) };
      }

      case "word_chain": {
        const chain = input as InputFor<"word_chain">;
        const pairs = chainPairs(chain.segments);
        if (!pairs.length) return { ok: false, reason: "no_input", message: "There were no words to check." };
        const answer = await askChecked(
          (problems) => wordChainRequest(chain, problems),
          (raw) => acceptWordChain(raw, pairs),
          CHAIN_TIMEOUT_MS,
        );
        if (!answer) return { ok: false, reason: "error", message: "Tono AI's check of your links wasn't usable." };
        return { ok: true, value: answer.value as OutputFor<K>, provenance: provenance({ producer: "tono_ai", provider: NAME, model: answer.model, promptVersion: PROMPT_VERSIONS.word_chain, judged: true, input: "text" }) };
      }

      case "bridge_chain": {
        const chain = input as InputFor<"bridge_chain">;
        if (!chain.segments.length) return { ok: false, reason: "no_input", message: "There were no words to check." };
        const answer = await askChecked(
          (problems) => bridgeChainRequest(chain, problems),
          (raw) => acceptBridgeChain(raw, chain.segments),
          CHAIN_TIMEOUT_MS,
        );
        if (!answer) return { ok: false, reason: "error", message: "Tono AI's check of your reasons wasn't usable." };
        return { ok: true, value: answer.value as OutputFor<K>, provenance: provenance({ producer: "tono_ai", provider: NAME, model: answer.model, promptVersion: PROMPT_VERSIONS.bridge_chain, judged: true, input: "text" }) };
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
