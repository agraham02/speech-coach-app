import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";

interface CardProps extends ViewProps {
  // Tappable cards sink slightly when pressed.
  onPress?: () => void;
  // raised: a quiet neutral fill, for a block inside a screen section (never
  // a card inside a card).
  tone?: "surface" | "raised";
  // Which of the five band tints (0-4) a card takes; neighbouring cards can
  // take different ones, as on the canvas.
  tint?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// A flat, tinted block ("Words and bands", D38): one of the five band tints,
// no border and no shadow. A white surface is for grouped rows (ListGroup).
export function Card({ style, children, onPress, tone = "surface", tint = 0, accessibilityLabel, ...props }: CardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const cardStyle = [styles.card, { backgroundColor: colors.bands[((tint % 5) + 5) % 5] }, tone === "raised" && styles.raised, style];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={cardStyle}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={cardStyle} accessibilityLabel={accessibilityLabel} {...props}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: t.radius.lg,
    padding: t.space.lg - 4,
  },
  raised: { backgroundColor: t.colors.accentMuted },
}));
