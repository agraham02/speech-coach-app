import type { ServerConfig } from "./config.ts";
import type { ModelRole } from "./types.ts";

// FNV-1a, 32 bit. Stable and dependency free; only used to spread users
// evenly across a rollout, never for anything secret.
export function hashToPercent(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

export interface ModelChoice {
  model: string;
  fallback?: string;
  isCandidate: boolean;
}

// Which model a user gets for a role. A candidate model goes to rolloutPercent
// of users, chosen by a hash of user and role so the same user stays put.
export function pickModel(role: ModelRole, userId: string, config: ServerConfig): ModelChoice {
  const r = config.models[role];
  const candidate = r.candidate;
  if (candidate && candidate.rolloutPercent > 0 && hashToPercent(`${userId}:${role}`) < candidate.rolloutPercent) {
    return { model: candidate.model, fallback: r.primary, isCandidate: true };
  }
  return { model: r.primary, fallback: r.fallback, isCandidate: false };
}
