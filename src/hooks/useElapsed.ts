import { useEffect, useRef, useState } from "react";

// Seconds since `active` last turned on (0 while off), ticking once a second.
export function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      started.current = null;
      setElapsed(0);
      return;
    }
    started.current ??= Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - (started.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return elapsed;
}
