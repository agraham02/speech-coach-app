import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "danger" | "secondary" | "ghost";
  // Escape hatch for layout only (e.g. `flex: 1` to split a row evenly) —
  // merged after the variant styles, so it can't override the button's own
  // color/appearance rules.
  style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({ label, onPress, disabled, loading, variant = "primary", style }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "danger" && styles.danger,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" || variant === "ghost" ? colors.accent : colors.onAccent} />
      ) : (
        <Text
          style={[
            styles.label,
            (variant === "secondary" || variant === "ghost") && styles.labelMuted,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  button: {
    backgroundColor: t.colors.accent,
    paddingVertical: t.space.md,
    borderRadius: t.radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  danger: { backgroundColor: t.colors.danger },
  secondary: { backgroundColor: t.colors.surfaceRaised, borderWidth: 1, borderColor: t.colors.border },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  label: { color: t.colors.onAccent, ...t.type.headline, fontSize: 17 },
  labelMuted: { color: t.colors.accent },
}));
