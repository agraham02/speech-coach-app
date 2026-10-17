import { useEffect, type ReactNode } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { makeStyles } from "../../theme/ThemeProvider";
import { duration, easeOut } from "../../theme/motion";
import { Card } from "./Card";
import { Txt } from "./Txt";

// A placeholder block that softly pulses while content loads — shaped like
// what's coming, so the screen doesn't jump when it arrives.
export function Skeleton({ width = "100%", height = 16, radius, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: easeOut }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * pulse.value }));
  return <Animated.View style={[styles.block, { width, height, borderRadius: radius ?? Math.min(12, height / 2) }, animated, style]} />;
}

// Lines of text: full width, the last one short.
export function SkeletonLines({ lines = 3, height = 14 }: { lines?: number; height?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.lines}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={height} width={i === lines - 1 && lines > 1 ? "62%" : "100%"} />
      ))}
    </View>
  );
}

// A card: a heading, then a few lines.
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <Card style={[styles.card, style]}>
      <Skeleton height={20} width="48%" />
      <SkeletonLines lines={lines} />
    </Card>
  );
}

// A score hero: the ring, then a line under it. `note` says what's being
// worked out, so the wait has a reason.
export function SkeletonHero({ note }: { note?: string }) {
  const styles = useStyles();
  return (
    <Card style={styles.hero} accessibilityLabel={note ?? "Loading"} accessible>
      <Skeleton width={156} height={156} radius={78} />
      <Skeleton height={14} width="40%" />
      {note ? (
        <Txt variant="footnote" tone="muted" align="center">
          {note}
        </Txt>
      ) : null}
    </Card>
  );
}

// A section that arrives while the screen is already showing: it fades in,
// and whatever is below slides down to make room instead of jumping.
export function Reveal({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeIn.duration(duration.slow).easing(easeOut)} exiting={FadeOut.duration(duration.fast)} layout={LinearTransition.duration(duration.base).easing(easeOut)} style={style}>
      {children}
    </Animated.View>
  );
}

// List rows: an icon tile, a title and a subtitle, a value on the right.
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const styles = useStyles();
  return (
    <Card style={styles.rows} accessibilityLabel="Loading" accessible>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={styles.rowText}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="40%" />
          </View>
          <Skeleton width={36} height={20} radius={10} />
        </View>
      ))}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  block: { backgroundColor: t.colors.surfaceRaised },
  lines: { gap: t.space.sm },
  card: { gap: t.space.md },
  hero: { alignItems: "center", gap: t.space.md, paddingVertical: t.space.xl },
  rows: { gap: t.space.md + 2, paddingVertical: t.space.md },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  rowText: { flex: 1, gap: 6 },
}));
