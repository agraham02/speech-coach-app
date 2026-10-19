import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";

interface BurstProps {
  // The particles' colors — a skill's, mostly; a second one mixes in.
  color: string;
  secondary?: string;
  // Changing this fires the burst again.
  trigger?: number | string;
  count?: number;
  // How far the particles travel, in points.
  radius?: number;
  delay?: number;
}

const DURATION = 1100;

// A short, soft burst of dots from the center of its parent — the one
// celebratory flourish, kept for stages earned and units finished. It plays
// once and is gone; with Reduce Motion it doesn't play at all.
export function Burst({ color, secondary, trigger = 0, count = 22, radius = 130, delay = 0 }: BurstProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Spread evenly with a little jitter, so it reads as a ring, not noise.
        const angle = (i / count) * Math.PI * 2 + (seeded(i) - 0.5) * 0.5;
        const distance = radius * (0.55 + seeded(i + 99) * 0.45);
        return {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          size: 5 + Math.round(seeded(i + 7) * 5),
          tint: secondary && i % 3 === 0 ? secondary : color,
        };
      }),
    [count, radius, color, secondary],
  );

  useEffect(() => {
    if (reduced) return;
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }));
  }, [trigger, delay, reduced, progress]);

  if (reduced) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p, i) => (
          <Particle key={i} progress={progress} {...p} />
        ))}
      </View>
    </View>
  );
}

function Particle({ progress, dx, dy, size, tint }: { progress: SharedValue<number>; dx: number; dy: number; size: number; tint: string }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    // Out fast, a little drift down at the end, fading over the last half.
    return {
      opacity: t === 0 ? 0 : t < 0.5 ? 1 : 1 - (t - 0.5) * 2,
      transform: [{ translateX: dx * t }, { translateY: dy * t + 18 * t * t }, { scale: 1 - t * 0.4 }],
    };
  });
  return <Animated.View style={[styles.particle, { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2, backgroundColor: tint }, style]} />;
}

// Deterministic 0-1 noise, so a burst looks the same every time.
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const styles = StyleSheet.create({
  center: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0 },
  particle: { position: "absolute" },
});
