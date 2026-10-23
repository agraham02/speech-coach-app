import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";

interface ConfettiProps {
  // The pieces' colors, used in turn.
  colors: string[];
  count?: number;
  delay?: number;
}

const DURATION = 3200;

// One fall of confetti over the whole screen, kept for the path finale (the
// biggest moment in the app). Thin paper pieces drift down, sway and turn,
// then fade; it plays once. With Reduce Motion it doesn't play at all.
export function Confetti({ colors, count = 56, delay = 200 }: ConfettiProps) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: seeded(i) * width,
        // Staggered starts above the top edge, so it rains rather than drops.
        startY: -40 - seeded(i + 31) * height * 0.5,
        fall: height * (0.75 + seeded(i + 57) * 0.45),
        sway: 14 + seeded(i + 13) * 26,
        swayTurns: 1 + seeded(i + 71) * 2,
        spin: (seeded(i + 5) - 0.5) * 900,
        w: 6 + Math.round(seeded(i + 19) * 4),
        h: 10 + Math.round(seeded(i + 23) * 6),
        tint: colors[i % colors.length],
      })),
    [count, width, height, colors],
  );

  useEffect(() => {
    if (reduced) return;
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
  }, [delay, reduced, progress]);

  if (reduced) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Piece key={i} progress={progress} {...p} />
      ))}
    </View>
  );
}

interface PieceProps {
  progress: SharedValue<number>;
  x: number;
  startY: number;
  fall: number;
  sway: number;
  swayTurns: number;
  spin: number;
  w: number;
  h: number;
  tint: string;
}

function Piece({ progress, x, startY, fall, sway, swayTurns, spin, w, h, tint }: PieceProps) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t === 0 ? 0 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
      transform: [
        { translateX: x + Math.sin(t * Math.PI * 2 * swayTurns) * sway },
        { translateY: startY + fall * t + Math.abs(startY) * t },
        { rotate: `${spin * t}deg` },
        // A piece turning over reads as paper, not a dot.
        { scaleX: Math.cos(t * Math.PI * 4 * swayTurns) },
      ],
    };
  });
  return <Animated.View style={[styles.piece, { width: w, height: h, backgroundColor: tint }, style]} />;
}

// Deterministic 0-1 noise, so the fall looks the same every time.
function seeded(n: number): number {
  const v = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return v - Math.floor(v);
}

const styles = StyleSheet.create({
  piece: { position: "absolute", left: 0, top: 0, borderRadius: 1.5 },
});
