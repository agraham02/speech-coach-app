// Phase 1 response schema — only transcription. The `structure`, `delivery`,
// `presence`, and `combined` blocks from plan.md §9 slot in here for Phase 3/4
// as additional top-level properties, so extending this later is additive.
export const PHASE1_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript_verbatim: {
      type: "string",
      description:
        "Verbatim transcript including filler words, false starts, and repetitions.",
    },
    transcript_clean: {
      type: "string",
      description:
        "Grammatically cleaned transcript, ready to paste into a journal.",
    },
    duration_seconds: {
      type: "number",
      description: "Duration of the spoken response, in seconds.",
    },
  },
  required: ["transcript_verbatim", "transcript_clean", "duration_seconds"],
} as const;

export function buildSystemPrompt(promptText: string): string {
  return `You are transcribing a personal daily speaking-practice video clip.

The speaker was responding to this prompt: "${promptText}"

Produce two transcripts of what they said:
1. transcript_verbatim: word-for-word, including filler words (um, uh, like), false starts, and repetitions.
2. transcript_clean: the same content rewritten as grammatically clean prose, with fillers and false starts removed, suitable for pasting directly into a personal journal. Preserve the speaker's meaning, tone, and word choice as much as possible — do not summarize or add content that wasn't said.

Also report duration_seconds: the approximate duration of the spoken response in seconds.

Respond only with JSON matching the provided schema.`;
}
