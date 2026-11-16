import { View, type AccessibilityActionEvent } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { tick } from "../../utils/haptics";
import { ratingValueText, stepRating } from "./inputLogic";

interface RatingTrackProps {
  // The chosen stop, 1 to `max`; null until answered (nothing is preset).
  value: number | null;
  onChange: (value: number) => void;
  // A word under each number, low to high (optional; one per stop).
  words?: readonly string[];
  lowLabel?: string;
  highLabel?: string;
  max?: number;
  accessibilityLabel: string;
}

// "How it felt": one track of stops, a number (and optionally a word) in each.
// Tap a stop, or, with a screen reader, swipe up and down on the whole track.
export function RatingTrack({ value, onChange, words, lowLabel, highLabel, max = 5, accessibilityLabel }: RatingTrackProps) {
  const styles = useStyles();
  const stops = Array.from({ length: max }, (_, i) => i + 1);

  function pick(n: number) {
    if (n !== value) tick();
    onChange(n);
  }

  function onAction(e: AccessibilityActionEvent) {
    const next = stepRating(value, e.nativeEvent.actionName === "increment" ? 1 : -1, max);
    if (next != null) pick(next);
  }

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 1, max, now: value ?? undefined, text: ratingValueText(value, max) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={onAction}
    >
      <View style={styles.stops}>
        {stops.map((n, i) => {
          const selected = value === n;
          const word = words?.[i];
          return (
            <PressableScale key={n} onPress={() => pick(n)} scaleTo={0.95} accessible={false} style={[styles.stop, selected && styles.stopOn]}>
              {selected ? <View pointerEvents="none" style={styles.ring} /> : null}
              <Txt variant="title3" weight="600" tabular style={styles.number}>
                {n}
              </Txt>
              {word ? (
                <Txt variant="caption2" tone="secondary" numberOfLines={1}>
                  {word}
                </Txt>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
      {lowLabel || highLabel ? (
        <View style={styles.ends}>
          <Txt variant="caption1" tone="secondary">
            {lowLabel}
          </Txt>
          <Txt variant="caption1" tone="secondary">
            {highLabel}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 8 },
  stops: { flexDirection: "row", gap: 6 },
  stop: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stopOn: { borderColor: t.colors.textPrimary, backgroundColor: t.colors.accentMuted },
  ring: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12.5, borderWidth: 1, borderColor: t.colors.textPrimary },
  number: { lineHeight: 20 },
  ends: { flexDirection: "row", justifyContent: "space-between" },
}));
