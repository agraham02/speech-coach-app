import { useId, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface HeroCardProps extends ViewProps {
  // The glow's color — usually a skill's fg. Without one, a faint ink glow.
  accent?: string;
  accentSecondary?: string;
  // Styles the inner content wrapper (e.g. a `gap` between children) — plain
  // `style` only affects the outer card, since the glow layer has to sit
  // between the two.
  contentStyle?: StyleProp<ViewStyle>;
}

// The "aura" card: a surface with a soft radial glow in a color that means
// something (today's focus skill, the score you just earned). Reserved for
// the one thing per screen that matters most, so it only means something
// because it's rare.
export function HeroCard({ style, contentStyle, children, accent, accentSecondary, ...props }: HeroCardProps) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const main = accent ?? colors.textPrimary;
  const second = accentSecondary ?? main;
  // Light mode needs less: tinted glows read stronger on white.
  const strength = (accent ? 0.34 : 0.1) * (scheme === "light" ? 0.7 : 1);
  // Explicit size: a percentage-sized Svg keeps its first measurement on
  // Android, so the glow would stop short when the content grows.
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      style={[styles.card, style]}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
      {...props}
    >
      <Animated.View entering={FadeIn.duration(700)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={size.width} height={size.height}>
          <Defs>
            <RadialGradient id={`${id}a`} cx="8%" cy="0%" rx="90%" ry="75%">
              <Stop offset="0" stopColor={main} stopOpacity={strength} />
              <Stop offset="0.55" stopColor={main} stopOpacity={strength * 0.35} />
              <Stop offset="1" stopColor={main} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${id}b`} cx="100%" cy="100%" rx="70%" ry="60%">
              <Stop offset="0" stopColor={second} stopOpacity={strength * 0.55} />
              <Stop offset="1" stopColor={second} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id}a)`} />
          <Rect width="100%" height="100%" fill={`url(#${id}b)`} />
        </Svg>
      </Animated.View>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: t.radius.xl - 4,
    backgroundColor: t.colors.surface,
    overflow: "hidden",
    ...t.shadow.card,
  },
  content: { padding: t.space.lg },
}));
