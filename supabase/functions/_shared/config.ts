import { z } from "zod";
import type { Mode, ModelRole } from "./types.ts";

// The one JSON row in the `config` table. Everything a price, limit or model
// change touches lives here, so changing any of it needs no app update and no
// redeploy. Money is USD; token prices are per million tokens.

const price = z.object({
  inputPerM: z.number().nonnegative(),
  // Audio is sometimes billed higher than text and video. Omitted means the same.
  audioPerM: z.number().nonnegative().optional(),
  outputPerM: z.number().nonnegative(),
});

const roleModels = z.object({
  primary: z.string().min(1),
  fallback: z.string().min(1).optional(),
  // A new model that only some users get, picked by a hash of the user id.
  candidate: z.object({ model: z.string().min(1), rolloutPercent: z.number().min(0).max(100) }).optional(),
  maxOutputTokens: z.number().int().positive(),
  // Gemini thinking budget in tokens (0 turns thinking off). Omitted leaves the model default.
  thinkingBudget: z.number().int().nonnegative().optional(),
  // Frames a second sampled from a video. Omitted leaves Google default (1).
  videoFps: z.number().positive().max(5).optional(),
});

const limits = z.object({
  starterReviews: z.number().int().nonnegative(),
  starterTextCalls: z.number().int().nonnegative(),
  betaMonthlyReviews: z.number().int().nonnegative(),
  betaMonthlyInsights: z.number().int().nonnegative(),
  betaMonthlyTextCalls: z.number().int().nonnegative(),
  plusMonthlyReviews: z.number().int().nonnegative(),
  plusMonthlyInsights: z.number().int().nonnegative(),
  plusMonthlyTextCalls: z.number().int().nonnegative(),
  plusMonthlyCostCapUsd: z.number().nonnegative(),
  dailyReviews: z.number().int().positive(),
  maxVideoSeconds: z.number().int().positive(),
  maxUploadBytes: z.number().int().positive(),
  maxPromptChars: z.number().int().positive(),
  maxSchemaChars: z.number().int().positive(),
});

export const serverConfigSchema = z.object({
  mode: z.enum(["beta", "launch"]),
  // Stops every hosted AI call at once.
  killSwitch: z.boolean(),
  // Whether the app offers Tono Plus for sale. The purchase code ships in the
  // app either way; this is the launch switch, so turning sales on needs no
  // app update. Rows written before it existed read as false.
  plusPurchasable: z.boolean().default(false),
  // Monthly spend ceiling for everyone who is not on Plus.
  freeBudgetUsd: z.number().nonnegative(),
  limits,
  models: z.object({ review_video: roleModels, text: roleModels, insight: roleModels }),
  prices: z.record(z.string(), price),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type ModelPrice = z.infer<typeof price>;
export type RoleModelConfig = z.infer<typeof roleModels>;
export type Limits = z.infer<typeof limits>;

// Used to seed the table. The model ids are pinned on purpose: the server
// never follows a floating alias. CHECK them against Google's current list
// (and the prices against the pricing page) before the first deploy.
export const DEFAULT_CONFIG: ServerConfig = {
  mode: "beta",
  killSwitch: false,
  plusPurchasable: false,
  freeBudgetUsd: 50,
  limits: {
    starterReviews: 5,
    starterTextCalls: 15,
    betaMonthlyReviews: 15,
    betaMonthlyInsights: 4,
    betaMonthlyTextCalls: 60,
    plusMonthlyReviews: 60,
    plusMonthlyInsights: 12,
    plusMonthlyTextCalls: 100,
    plusMonthlyCostCapUsd: 2.5,
    dailyReviews: 6,
    maxVideoSeconds: 300,
    maxUploadBytes: 500_000_000,
    maxPromptChars: 120_000,
    maxSchemaChars: 20_000,
  },
  models: {
    review_video: { primary: "gemini-3.5-flash-lite", fallback: "gemini-3.8-flash", maxOutputTokens: 6000, videoFps: 1 },
    text: { primary: "gemini-3.5-flash-lite", fallback: "gemini-3.8-flash", maxOutputTokens: 4000 },
    insight: { primary: "gemini-3.5-flash-lite", fallback: "gemini-3.8-flash", maxOutputTokens: 4000 },
  },
  prices: {
    "gemini-3.5-flash-lite": { inputPerM: 0.3, outputPerM: 2.5 },
    "gemini-3.1-flash-lite": { inputPerM: 0.25, audioPerM: 0.5, outputPerM: 1.5 },
    "gemini-3.8-flash": { inputPerM: 0.75, outputPerM: 3.75 },
  },
};

// Throws a readable error for a bad row, and for any model in use that has
// no price: an unpriced call would make the budgets wrong.
export function parseServerConfig(raw: unknown): ServerConfig {
  const config = serverConfigSchema.parse(raw);
  const roles: ModelRole[] = ["review_video", "text", "insight"];
  for (const role of roles) {
    const r = config.models[role];
    for (const model of [r.primary, r.fallback, r.candidate?.model]) {
      if (model && !config.prices[model]) throw new Error(`Model ${model} (role ${role}) has no price row`);
    }
  }
  return config;
}

export function modeLabel(mode: Mode): string {
  return mode === "beta" ? "beta" : "launch";
}
