import { z } from "zod";
import type { Limits } from "./config.ts";
import { TASK_NAMES, TASKS, type Task } from "./prompts/index.ts";

// What the phone may ask for: a task by name, its structured inputs, and the
// answer format it reads. It never sends a prompt or a schema; the server
// writes those (prompts/). Everything is bounded here: size, shape, and which
// task may carry a video.

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
      task: z.enum(TASK_NAMES as [Task, ...Task[]]),
      schemaVersion: z.number().int().positive(),
      inputs: z.record(z.string(), z.unknown()),
      // The take's uploaded video, when the judge should watch it.
      media: z.object({ fileName, videoSeconds: z.number().positive().max(limits.maxVideoSeconds) }).optional(),
      idempotencyKey,
    })
    .refine((r) => !r.media || TASKS[r.task].allowsMedia, { message: "Only a take review may carry a video", path: ["media"] })
    .refine((r) => JSON.stringify(r.inputs).length <= limits.maxInputChars, { message: "Inputs too large", path: ["inputs"] });
}

export type GenerateRequest = z.infer<ReturnType<typeof generateRequestSchema>>;

// The task's own inputs, checked against its schema. Throws a readable message.
export function parseTaskInputs(request: GenerateRequest): { ok: true; inputs: unknown } | { ok: false; message: string } {
  const def = TASKS[request.task];
  if (request.schemaVersion !== def.schemaVersion) {
    return { ok: false, message: `This app reads ${request.task} format ${request.schemaVersion}; the server writes ${def.schemaVersion}` };
  }
  const parsed = def.inputs.safeParse(request.inputs);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `${issue?.path.join(".") || "inputs"}: ${issue?.message ?? "invalid"}` };
  }
  return { ok: true, inputs: parsed.data };
}

export function uploadStartSchema(limits: Limits) {
  return z.object({
    sizeBytes: z.number().int().positive().max(limits.maxUploadBytes),
    mimeType: z.enum(["video/mp4", "video/quicktime"]),
  });
}
