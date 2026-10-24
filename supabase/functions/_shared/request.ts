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
    .refine((r) => TASKS[r.task].via !== "converse", { message: "This task runs through ai-converse", path: ["task"] })
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

// A conversation is named by the phone (a random id per conversation); the
// server keys its minutes to it.
const conversationId = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// What ai-converse takes. "turn": the partner's next line, written and
// spoken. "speak": a line the app already has (the scripted opener, the Dev
// voice lab), spoken. Both stream the voice back as it is made.
export function converseRequestSchema(limits: Limits, voices: readonly string[]) {
  const voice = z.string().refine((v) => voices.includes(v), { message: "Unknown voice" });
  return z.discriminatedUnion("op", [
    z.object({
      op: z.literal("turn"),
      schemaVersion: z.number().int().positive(),
      inputs: z.record(z.string(), z.unknown()).refine((i) => JSON.stringify(i).length <= limits.maxInputChars, { message: "Inputs too large" }),
      voice,
      conversationId,
      idempotencyKey,
    }),
    z.object({
      op: z.literal("speak"),
      text: z.string().min(1).max(600),
      mood: z.string().max(40).optional(),
      voice,
      conversationId,
      idempotencyKey,
    }),
  ]);
}

export type ConverseRequest = z.infer<ReturnType<typeof converseRequestSchema>>;

export function uploadStartSchema(limits: Limits) {
  return z.object({
    sizeBytes: z.number().int().positive().max(limits.maxUploadBytes),
    mimeType: z.enum(["video/mp4", "video/quicktime"]),
  });
}
