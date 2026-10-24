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

// Counts are per UTC calendar month, except the trial's, which run over the
// trial itself (14 days, which can span two months).
const limits = z.object({
  // The free taste: judged takes a month for someone with no trial and no Plus.
  freeMonthlyJudgedTakes: z.number().int().nonnegative(),
  // Beta mode (TestFlight): what everyone who isn't paying gets.
  betaMonthlyJudgedTakes: z.number().int().nonnegative(),
  betaMonthlyTextCalls: z.number().int().nonnegative(),
  betaMonthlyInsights: z.number().int().nonnegative(),
  // The 14-day trial, counted over the trial.
  trialJudgedTakes: z.number().int().nonnegative(),
  trialTextCalls: z.number().int().nonnegative(),
  trialInsights: z.number().int().nonnegative(),
  trialConversationMinutes: z.number().int().nonnegative(),
  // Tono Plus, a month.
  plusMonthlyJudgedTakes: z.number().int().nonnegative(),
  plusMonthlyTextCalls: z.number().int().nonnegative(),
  plusMonthlyInsights: z.number().int().nonnegative(),
  plusMonthlyConversationMinutes: z.number().int().nonnegative(),
  // The real AI cost one subscriber may run up in a month (or in the trial).
  paidCostCapUsd: z.number().nonnegative(),
  // Judged takes in a UTC day, for everyone: stops a stuck retry loop.
  dailyJudgedTakes: z.number().int().positive(),
  maxVideoSeconds: z.number().int().positive(),
  maxUploadBytes: z.number().int().positive(),
  // The phone sends structured inputs, never prompts; this bounds their size.
  maxInputChars: z.number().int().positive(),
});

export const serverConfigSchema = z.object({
  mode: z.enum(["beta", "launch"]),
  // Stops every hosted AI call at once.
  killSwitch: z.boolean(),
  // Whether the app offers Tono Plus for sale. The purchase code ships in the
  // app either way; this is the launch switch, so turning sales on needs no
  // app update.
  plusPurchasable: z.boolean(),
  // Whether someone who said in onboarding that they are under 18 may use
  // Tono AI. The Gemini API terms say no (docs/decisions/tiers-and-trial.md);
  // the app keeps everything on the phone for them while this is false.
  minorsMayUseAi: z.boolean(),
  // Monthly spend ceiling for everyone who is not paying (free and beta).
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
  minorsMayUseAi: false,
  freeBudgetUsd: 50,
  limits: {
    freeMonthlyJudgedTakes: 1,
    betaMonthlyJudgedTakes: 15,
    betaMonthlyTextCalls: 100,
    betaMonthlyInsights: 4,
    trialJudgedTakes: 20,
    trialTextCalls: 60,
    trialInsights: 4,
    trialConversationMinutes: 30,
    plusMonthlyJudgedTakes: 60,
    plusMonthlyTextCalls: 300,
    plusMonthlyInsights: 12,
    plusMonthlyConversationMinutes: 120,
    paidCostCapUsd: 2.5,
    dailyJudgedTakes: 6,
    maxVideoSeconds: 300,
    maxUploadBytes: 500_000_000,
    maxInputChars: 60_000,
  },
  models: {
    review_video: { primary: "gemini-3.5-flash-lite", fallback: "gemini-3.8-flash", maxOutputTokens: 6000, videoFps: 1 },
    // Gemini 3.1 Flash-Lite is 40% cheaper on output and text-only calls don't
    // need 3.5's audio pricing; it waits as a 0% candidate until the hosted
    // eval says it judges as well (and it shuts down on 2027-05-07).
    text: {
      primary: "gemini-3.5-flash-lite",
      fallback: "gemini-3.8-flash",
      candidate: { model: "gemini-3.1-flash-lite", rolloutPercent: 0 },
      maxOutputTokens: 4000,
    },
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
