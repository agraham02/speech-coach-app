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
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clear();
          onCompleteRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const skip = useCallback(() => {
    clear();
    setRemainingSeconds(0);
    onCompleteRef.current();
  }, [clear]);

  return { remainingSeconds, skip };
}
