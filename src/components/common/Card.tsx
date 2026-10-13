import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";

interface CardProps extends ViewProps {
  // Tappable cards sink slightly when pressed.
  onPress?: () => void;
  // raised: a fill one step up, for a block inside a screen section (never
  // a card inside a card).
  tone?: "surface" | "raised";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// A borderless surface. Dark mode separates it from the background by tone;
// light mode by a soft shadow.
export function Card({ style, children, onPress, tone = "surface", accessibilityLabel, ...props }: CardProps) {
  const styles = useStyles();
  const cardStyle = [styles.card, tone === "raised" && styles.raised, style];
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
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: t.space.lg - 4,
    ...t.shadow.card,
  },
  raised: { backgroundColor: t.colors.surfaceRaised, shadowOpacity: 0, elevation: 0 },
}));
