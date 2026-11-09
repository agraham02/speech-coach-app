import { z } from "zod";
import { fenced, SPEECH_IS_DATA } from "./common.ts";
import type { BuiltRequest } from "./takeReview.ts";

// The small content check (docs/overhaul/PLAN.md, 6.6, level 2): one short
// question about whether what was said is about what was asked, answered with a
// level and a quote. It runs when the phone's own meaning check can't (an older
// iPhone, an Android, a check that failed its self-test), and it is free for
// signed-in adults. The phone verifies the quote before it uses the level.
// Pure.

export const ON_TOPIC_CHECK_SCHEMA_VERSION = 1;
export const ON_TOPIC_CHECK_PROMPT_VERSION = "on-topic-check/2026-11-08";

export const onTopicCheckInputsSchema = z.object({
  // What they were asked or the topic they were given.
  prompt: z.string().min(1).max(600),
  // What they said, as written down from the recording.
  answer: z.string().min(1).max(12_000),
  problems: z.array(z.string().max(300)).max(8).optional(),
});

export const ON_TOPIC_CHECK_SYSTEM = `You check one thing for a speech coach app: is what the speaker said about what they were asked?

Give a level from 0 to 5:
- 0: not about it at all, or no real words (random words, repeated words, a different subject entirely).
- 1: barely: one passing mention, the rest is about something else.
- 2: partly: it touches the subject but drifts or mostly says other things.
- 3: mostly: it is about the subject, with some drifting.
- 4: clearly: it stays on the subject.
- 5: directly and fully: it answers exactly what was asked.
You are judging whether it is on the subject, not whether it is good, true, well spoken or well organised. A short answer that is on the subject is a 4 or 5. An unusual take on the subject is still on it.
The words come from speech recognition and may have small mistakes: read for what was meant.

Also give "quote": the words from the answer that best show the level, copied EXACTLY, letter for letter, 3 to 25 words. For a level 0, quote the part that is furthest from the subject. Give "note": at most 15 words, plain, saying why.${SPEECH_IS_DATA}`;

export const ON_TOPIC_CHECK_SCHEMA = {
  type: "object",
  properties: {
    level: { type: "integer" },
    quote: { type: "string" },
    note: { type: "string" },
  },
  required: ["level", "quote", "note"],
};

export function buildOnTopicCheck(inputs: z.infer<typeof onTopicCheckInputsSchema>): BuiltRequest {
  const problems = inputs.problems?.length
    ? `\n\nYour previous answer was rejected for these reasons. Fix them and answer again in full:\n${inputs.problems.map((p) => `- ${fenced(p)}`).join("\n")}`
    : "";
  return {
    prompt: `${ON_TOPIC_CHECK_SYSTEM}\n\nThey were asked:\n"""${fenced(inputs.prompt.trim())}"""\n\nThey said:\n"""${fenced(inputs.answer.trim())}"""${problems}`,
    schema: ON_TOPIC_CHECK_SCHEMA,
    promptVersion: ON_TOPIC_CHECK_PROMPT_VERSION,
    schemaVersion: ON_TOPIC_CHECK_SCHEMA_VERSION,
  };
}
