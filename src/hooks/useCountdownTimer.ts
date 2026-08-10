import { useCallback, useEffect, useRef, useState } from "react";

// Counts down from `totalSeconds` to 0, calling `onComplete` once when it
// hits zero. Used for the pre-recording prep/brainstorm phase.
export function useCountdownTimer(totalSeconds: number, onComplete: () => void, enabled: boolean = true) {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return clear;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Fires onComplete as its own effect once the count hits zero, rather than
  // from inside the setRemainingSeconds updater above. A state updater is
  // supposed to be a pure reducer — React Strict Mode double-invokes it to
  // check that, and a caller whose onComplete sets a *different* component's
  // state (WarmUpOverlay's step-advance, once WarmUpStepView started using
  // this hook per-step) turns that double-invoke into a real "Cannot update
  // a component while rendering a different component" crash. Confirmed
  // live: reproduced this exact crash on WarmUpOverlay before this fix.
  useEffect(() => {
    if (enabled && remainingSeconds === 0) {
      clear();
      onCompleteRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, enabled]);

  const skip = useCallback(() => {
    clear();
    setRemainingSeconds(0);
  }, [clear]);

  return { remainingSeconds, skip };
}
