import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

interface PrimaryButtonProps {
  label: string;
  // May return a promise: taps are ignored until it settles.
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  loading?: boolean;
  // primary: the one ink action on a screen. secondary: a quiet filled
  // button. ghost: text only. danger: destructive.
  variant?: "primary" | "danger" | "secondary" | "ghost";
  size?: "lg" | "md" | "sm";
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  // Escape hatch for layout only (e.g. `flex: 1` to split a row evenly) —
  // merged after the variant styles, so it can't override the button's own
  // color/appearance rules.
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  // A stable handle for automated testing.
  testID?: string;
}

const HEIGHT = { lg: 56, md: 46, sm: 36 } as const;

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  size = "lg",
  icon,
  iconRight,
  style,
  accessibilityLabel,
  testID,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const pending = useRef(false);
  function press() {
    if (pending.current) return;
    const result = onPress();
    if (result && typeof (result as Promise<unknown>).finally === "function") {
      pending.current = true;
      (result as Promise<unknown>).catch(() => undefined).finally(() => {
        pending.current = false;
      });
    }
  }
  const styles = useStyles();
  const { colors } = useTheme();
  const fg = {
    primary: colors.onAccent,
    danger: colors.onAccent,
    secondary: colors.textPrimary,
    ghost: colors.textPrimary,
  }[variant];
  const iconSize = size === "sm" ? 16 : 19;

  return (
    <PressableScale
      onPress={press}
      disabled={isDisabled}
      haptic={variant === "primary" ? "tap" : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      testID={testID}
      style={[
        styles.button,
        { minHeight: HEIGHT[size], paddingHorizontal: size === "sm" ? 14 : 22 },
        variant === "danger" && styles.danger,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={iconSize} color={fg} /> : null}
          <Txt variant={size === "lg" ? "headline" : size === "md" ? "callout" : "footnote"} weight="600" color={fg} numberOfLines={1}>
            {label}
          </Txt>
          {iconRight ? <Ionicons name={iconRight} size={iconSize} color={fg} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  button: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.space.sm },
  danger: { backgroundColor: t.colors.danger },
  secondary: { backgroundColor: t.colors.surfaceRaised },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.35 },
}));
