import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii, spacing } from "../../theme/theme";
import { withAlpha } from "../../utils/color";

interface HeroCardProps extends ViewProps {
  accent?: string;
  accentSecondary?: string;
  // Styles the inner content wrapper (e.g. a `gap` between children) — plain
  // `style` only affects the outer card, since the glow layers need to sit
  // between the two as siblings rather than have content style bleed into them.
  contentStyle?: StyleProp<ViewStyle>;
}

// A Card with a soft two-tone gradient glow behind it — reserved for the one
// surface per screen that should read as "the important thing" (today's
// prompt, the score you just earned, your streak). Every other Card in the
// app stays flat on purpose, so this only means something because it's rare.
export function HeroCard({
  style,
  contentStyle,
  children,
  accent = colors.accent,
  accentSecondary = colors.violet,
  ...props
}: HeroCardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      <LinearGradient
        colors={[withAlpha(accentSecondary, 0.28), "transparent"]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[withAlpha(accent, 0.22), "transparent"]}
        start={{ x: 1, y: 1 }}
        end={{ x: 0.25, y: 0.15 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.heroBorder,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  content: { padding: spacing.lg },
});
