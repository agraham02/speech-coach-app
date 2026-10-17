import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const BARS = 30;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;

// The recognizer's volume (-2..10) as 0-1.
export const levelOf = (volume: number) => Math.max(0, Math.min(1, (volume + 2) / 12));

interface LevelBarsProps {
  // The live session: its volume feed gives about ten readings a second.
  session: { onVolume(listener: (value: number) => void): () => void };
  active: boolean;
  // A reading at or above this is a voice, not the room.
  voiceLevel: number;
}

// The last few seconds of your voice as scrolling bars: quiet ones fade, ones
// that count as a voice turn green. Readings go into a ref and the bars are
// redrawn on a timer, so ten readings a second do not each re-render.
export function LevelBars({ session, active, voiceLevel }: LevelBarsProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const levels = useRef<number[]>(Array.from({ length: BARS }, () => 0));
  const [, redraw] = useState(0);

  useEffect(() => {
    if (!active) return;
    const off = session.onVolume((value) => {
      levels.current = [...levels.current.slice(1), levelOf(value)];
    });
    const timer = setInterval(() => redraw((n) => n + 1), 100);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [active, session]);

  // Back to flat once it stops listening.
  useEffect(() => {
    if (!active) levels.current = Array.from({ length: BARS }, () => 0);
  }, [active]);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {levels.current.map((level, i) => {
        const voiced = level >= voiceLevel;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT),
                backgroundColor: voiced ? colors.success : colors.textMuted,
                opacity: voiced ? 1 : 0.35,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { height: MAX_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bar: { width: 4, borderRadius: 2 },
}));
