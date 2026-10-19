import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { remainingSeconds } from "../domain/prepTimer";

// Seconds left until a wall-clock deadline, calling `onComplete` once when it
// passes. Unlike a counter ticking once a second, it stays right after you've
// been in another app (a web search during research): coming back recomputes
// from the clock. A null deadline, or `enabled` false, pauses it.
export function useDeadlineCountdown(deadlineMs: number | null, enabled: boolean, onComplete: () => void): number {
  const [remaining, setRemaining] = useState(() => (deadlineMs == null ? 0 : remainingSeconds(deadlineMs, Date.now())));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (deadlineMs == null || !enabled) return undefined;
    const tick = () => {
      const left = remainingSeconds(deadlineMs, Date.now());
      setRemaining(left);
      // Once per deadline: extending it re-arms the next completion.
      if (left === 0 && firedFor.current !== deadlineMs) {
        firedFor.current = deadlineMs;
        onCompleteRef.current();
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [deadlineMs, enabled]);

  return remaining;
}
