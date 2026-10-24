import { useEffect, useState } from "react";
import { Txt } from "../common/Txt";
import { describeUsage, type CloudUsageCall } from "../../domain/cloudUsage";
import { getLatestUsage } from "../../services/cloud/usageStore";

// A quiet line under a take's coaching: what its Tono AI judgement used, in
// tokens. `refreshKey` re-reads it when a review finishes.
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
  return (
    <Txt variant="footnote" tone="muted">
      {"Tono AI used " + describeUsage(call) + "."}
    </Txt>
  );
}
