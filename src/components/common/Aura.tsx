import { useId, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";

interface AuraProps {
  color: string;
  secondary?: string;
  // 0-1, scaled down in light mode where tints read stronger.
  strength?: number;
  // Where the main glow sits, as fractions of the box.
  at?: { x: number; y: number };
}

// A soft radial glow filling its parent — the app's one decorative motif,
// always in a color that means something (a skill, the streak, the score).
// Sized explicitly: a percentage-sized Svg keeps its first measurement on
// Android, so the glow would stop short when the content grows.
export function Aura({ color, secondary, strength = 0.34, at = { x: 0.08, y: 0 } }: AuraProps) {
  const { scheme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const s = strength * (scheme === "light" ? 0.7 : 1);
  const second = secondary ?? color;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
    >
      {size.width > 0 ? (
        <Animated.View entering={FadeIn.duration(800)} style={StyleSheet.absoluteFill}>
          <Svg width={size.width} height={size.height}>
            <Defs>
              <RadialGradient id={`${id}a`} cx={`${at.x * 100}%`} cy={`${at.y * 100}%`} rx="90%" ry="75%">
                <Stop offset="0" stopColor={color} stopOpacity={s} />
                <Stop offset="0.55" stopColor={color} stopOpacity={s * 0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id={`${id}b`} cx={`${(1 - at.x) * 100}%`} cy={`${(1 - at.y) * 100}%`} rx="70%" ry="60%">
                <Stop offset="0" stopColor={second} stopOpacity={s * 0.55} />
                <Stop offset="1" stopColor={second} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={size.width} height={size.height} fill={`url(#${id}a)`} />
            <Rect width={size.width} height={size.height} fill={`url(#${id}b)`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
