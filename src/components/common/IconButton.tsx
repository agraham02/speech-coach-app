import type { StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  // filled: a soft circle behind the glyph (back, close, settings). plain:
  // just the glyph, for dense rows.
  variant?: "filled" | "plain" | "ink";
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// A round icon-only button with a generous hit area.
export function IconButton({ icon, onPress, accessibilityLabel, size = 40, variant = "filled", color, disabled, style }: IconButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fg = color ?? (variant === "ink" ? colors.onAccent : colors.textPrimary);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        variant === "filled" && styles.filled,
        variant === "ink" && styles.ink,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={fg} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  button: { alignItems: "center", justifyContent: "center" },
  filled: { backgroundColor: t.colors.surfaceRaised },
  ink: { backgroundColor: t.colors.accent },
  disabled: { opacity: 0.35 },
}));
