import { getArtifact, listArtifactsOfKind, putArtifact } from "../db/artifactsRepo";
import type { CloudUsageCall, TokenUsage } from "../../domain/cloudUsage";
import { logger } from "../../utils/logger";

// Token usage of deep reviews, kept per take (a take reviewed twice has two
// entries, so nothing spent is forgotten) and totalled for Settings.

interface UsageArtifact {
  calls: CloudUsageCall[];
}

export async function recordCloudUsage(
  sessionId: string,
  call: { provider: string; model: string; input: "video" | "measurements"; elapsedMs: number; videoBytes: number | null; usage: TokenUsage | null },
): Promise<void> {
  try {
    const { usage, ...rest } = call;
    const entry: CloudUsageCall = {
      at: new Date().toISOString(),
      ...rest,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      thinkingTokens: usage?.thinkingTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      ...(usage?.inputByType ? { inputByType: usage.inputByType } : {}),
    };
    const existing = await getArtifact<UsageArtifact>(sessionId, "cloud_usage");
    await putArtifact(sessionId, "cloud_usage", { calls: [...(existing?.calls ?? []), entry] } satisfies UsageArtifact);
    logger.info(
      `[cloud] usage ${sessionId}: ${entry.provider} ${entry.model}, in=${entry.inputTokens ?? "?"} out=${entry.outputTokens ?? "?"} thinking=${entry.thinkingTokens ?? "?"} total=${entry.totalTokens ?? "?"}, ${Math.round(entry.elapsedMs / 1000)} s`,
    );
  } catch (error) {
    // Keeping count must never fail a review.
    logger.warn(`[cloud] couldn't record usage for ${sessionId} - ${(error as Error).message}`);
  }
}

// The most recent review of a take, or null.
export async function getLatestUsage(sessionId: string): Promise<CloudUsageCall | null> {
  const artifact = await getArtifact<UsageArtifact>(sessionId, "cloud_usage");
  return artifact?.calls?.length ? artifact.calls[artifact.calls.length - 1] : null;
}

// Every review ever made on this phone, oldest first.
export async function getAllUsageCalls(): Promise<CloudUsageCall[]> {
  const all = await listArtifactsOfKind<UsageArtifact>("cloud_usage");
  return all.flatMap((a) => a.calls ?? []).sort((a, b) => a.at.localeCompare(b.at));
}
