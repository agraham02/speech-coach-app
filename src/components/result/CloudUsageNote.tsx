import { useEffect, useState } from "react";
import { Txt } from "../common/Txt";
import { describeUsage, type CloudUsageCall } from "../../domain/cloudUsage";
import { PROVIDERS, type ProviderId } from "../../services/cloud/providers";
import { getLatestUsage } from "../../services/cloud/usageStore";

// A quiet line under a take's coaching: what its AI review used, in the
// provider's own tokens. `refreshKey` re-reads it when a review finishes.
export function CloudUsageNote({ sessionId, refreshKey }: { sessionId: string; refreshKey?: unknown }) {
  const [call, setCall] = useState<CloudUsageCall | null>(null);

  useEffect(() => {
    let live = true;
    getLatestUsage(sessionId)
      .then((c) => {
        if (live) setCall(c);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sessionId, refreshKey]);

  if (!call || call.totalTokens === null) return null;
  const name = PROVIDERS[call.provider as ProviderId]?.name ?? call.provider;
  return (
    <Txt variant="footnote" tone="muted">
      {"AI review by " + name + " used " + describeUsage(call) + "."}
    </Txt>
  );
}
