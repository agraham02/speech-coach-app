import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const SHOWN_MS = 10_000;

interface ArrivalPillProps {
  // The thing has landed (its skeleton became content).
  arrived: boolean;
  // The person can see it now.
  targetVisible: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

// A small pill at the bottom of a scrolling screen: "Your score is ready".
// Content that lands above or below where someone is reading doesn't pull
// them anywhere or play unseen; this says it's there and takes them to it. It
// only shows when `arrived` turns true during the visit while the thing isn't
// on screen, and goes away once it is, when pressed, or after a few seconds.
export function ArrivalPill({ arrived, targetVisible, label, icon, onPress }: ArrivalPillProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const wasArrived = useRef(arrived);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (arrived && !wasArrived.current && !targetVisible) setShown(true);
    wasArrived.current = arrived;
    // Only a change of `arrived` can raise the pill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  useEffect(() => {
    if (targetVisible) setShown(false);
  }, [targetVisible]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View entering={FadeInDown.duration(duration.base).easing(easeOut)} exiting={FadeOutDown.duration(duration.fast)}>
        <PressableScale
          onPress={() => {
            setShown(false);
            onPress();
          }}
          accessibilityLabel={label}
          style={styles.pill}
        >
          <Ionicons name={icon} size={15} color={colors.onAccent} />
          <Txt variant="footnote" weight="600" tone="onAccent">
            {label}
          </Txt>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: "absolute", left: 0, right: 0, bottom: t.space.sm, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.xs + 2,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
  },
}));
