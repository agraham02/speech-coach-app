import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Aura } from "./Aura";

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
  const { colors } = useTheme();
  return (
    <View style={[styles.card, style]} {...props}>
      <Aura color={accent ?? colors.textPrimary} secondary={accentSecondary} strength={accent ? 0.34 : 0.1} />
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
