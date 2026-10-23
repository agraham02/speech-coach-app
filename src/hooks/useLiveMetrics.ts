import { useEffect, useState } from "react";
import { subscribeLive, type MetricsReading } from "../services/dev/deviceMetrics";

// Live device readings while the component is mounted (dev builds only).
export function useLiveMetrics(enabled = true): { latest: MetricsReading | null; history: MetricsReading[] } {
  const [state, setState] = useState<{ latest: MetricsReading | null; history: MetricsReading[] }>({ latest: null, history: [] });
  useEffect(() => {
    if (!enabled) return;
    return subscribeLive((latest, history) => setState({ latest, history }));
  }, [enabled]);
  return state;
}
