import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { Txt } from "../common/Txt";

type TxtProps = React.ComponentProps<typeof Txt>;

interface CountUpProps extends Omit<TxtProps, "children"> {
  from: number;
  to: number;
  decimals?: number;
  delay?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
}

// A number that counts from where it was to where it is — the score or a
// rating after a take. Eases out, so it lands softly; with Reduce Motion on
// it just shows the end value.
export function CountUp({ from, to, decimals = 0, delay = 0, durationMs = 900, prefix = "", suffix = "", ...txt }: CountUpProps) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : from);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || from === to) {
      setValue(to);
      return;
    }
    setValue(from);
    let start: number | null = null;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        if (start == null) start = now;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(from + (to - from) * eased);
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [from, to, delay, durationMs, reduced]);

  return (
    <Txt tabular {...txt}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </Txt>
  );
}
