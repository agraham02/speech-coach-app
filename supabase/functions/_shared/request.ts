import { z } from "zod";
import type { Limits } from "./config.ts";

// What the phone may ask for. The phone builds the prompt, so the server
// bounds everything: size, shape, and which kind may carry a video.

const idempotencyKey = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
// A Gemini file name as the Files API returns it, e.g. "files/abc123xyz".
const fileName = z.string().regex(/^files\/[a-z0-9-]{1,40}$/);

export function generateRequestSchema(limits: Limits) {
  return z
    .object({
      kind: z.enum(["review", "text", "insight"]),
      systemPrompt: z.string().min(1).max(limits.maxPromptChars),
      // The JSON schema the answer must follow.
      schema: z.record(z.string(), z.unknown()),
      fileName: fileName.optional(),
      // Needed for a review: seconds of video, to estimate the cost before the call.
      videoSeconds: z.number().positive().max(limits.maxVideoSeconds).optional(),
      idempotencyKey,
    })
    .refine((r) => (r.kind === "review") === (r.fileName !== undefined), {
      message: "A review needs a video file, and only a review may carry one",
      path: ["fileName"],
    })
    .refine((r) => r.kind !== "review" || r.videoSeconds !== undefined, {
      message: "A review needs videoSeconds",
      path: ["videoSeconds"],
    })
    .refine((r) => JSON.stringify(r.schema).length <= limits.maxSchemaChars, {
      message: "Schema too large",
      path: ["schema"],
    });
}

export type GenerateRequest = z.infer<ReturnType<typeof generateRequestSchema>>;

export function uploadStartSchema(limits: Limits) {
  return z.object({
    sizeBytes: z.number().int().positive().max(limits.maxUploadBytes),
    mimeType: z.enum(["video/mp4", "video/quicktime"]),
  });
}
