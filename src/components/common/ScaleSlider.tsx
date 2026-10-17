import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Slider from "@react-native-community/slider";
import { tick } from "../../utils/haptics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

interface Props {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  accessibilityLabel: string;
}

// A whole-number self-rating on a slider, for answers that are an amount
// (0-10 attention, awkwardness, how much you believe a thought). Quick
// verdicts on a take (1-5 "how did it come across") stay as tap chips —
// one tap beats a drag there.
//
// Until it's touched, the thumb rests in the middle, greyed, with no number:
// a preset value would anchor the answer. Each whole step ticks under your
// thumb as you drag.
export function ScaleSlider({ value, onChange, min = 0, max = 10, lowLabel, highLabel, accessibilityLabel }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const middle = Math.round((min + max) / 2);
  const [display, setDisplay] = useState<number | null>(value);
  const [touched, setTouched] = useState(value != null);
  // The slider's `value` prop only sets where it starts (see
  // LabeledSlider.tsx), so a change from outside — a reset to unanswered
  // for the next round — remounts it. Its own drags don't.
  const emitted = useRef(value);
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    shown.current = value;
    setDisplay(value);
    setTouched(value != null);
    setMountKey((k) => k + 1);
  }, [value]);

  const shown = useRef(value);
  function slide(raw: number) {
    const n = Math.round(raw);
    setTouched(true);
    if (shown.current !== n) tick();
    shown.current = n;
    setDisplay(n);
  }

  function commit(raw: number) {
    const n = Math.round(raw);
    emitted.current = n;
    shown.current = n;
    setTouched(true);
    setDisplay(n);
    onChange(n);
  }

  const set = touched && display != null;
  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        {set ? (
          <>
            <Txt variant="display" tabular style={styles.number}>
              {display}
            </Txt>
            <Txt variant="footnote" tone="muted">
              out of {max}
            </Txt>
          </>
        ) : (
          <Txt variant="callout" tone="muted" style={styles.prompt}>
            Slide to choose
          </Txt>
        )}
      </View>
      <Slider
        key={mountKey}
        value={value ?? middle}
        minimumValue={min}
        maximumValue={max}
        step={1}
        tapToSeek
        onSlidingStart={() => setTouched(true)}
        onValueChange={slide}
        onSlidingComplete={commit}
        minimumTrackTintColor={set ? colors.accent : colors.switchTrackOff}
        maximumTrackTintColor={colors.switchTrackOff}
        thumbTintColor={set ? colors.accent : colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: display ?? undefined, text: set ? `${display} out of ${max}` : "not chosen" }}
      />
      {lowLabel || highLabel ? (
        <View style={styles.labels}>
          <Txt variant="caption1" tone="muted">
            {lowLabel} · {min}
          </Txt>
          <Txt variant="caption1" tone="muted">
            {max} · {highLabel}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs },
  // Fixed height, so the screen doesn't shift when the number appears.
  readout: { height: 64, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: t.space.sm },
  number: { fontSize: 48, lineHeight: 58, letterSpacing: -1.6 },
  prompt: { lineHeight: 58 },
  labels: { flexDirection: "row", justifyContent: "space-between" },
}));
