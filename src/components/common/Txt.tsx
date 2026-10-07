import { Text, type TextProps } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import type { TypeStyle } from "../../theme/tokens";

type Tone = "primary" | "secondary" | "muted" | "accent" | "success" | "warning" | "danger" | "onAccent";

interface TxtProps extends TextProps {
  variant?: TypeStyle;
  tone?: Tone;
  color?: string;
  weight?: "400" | "500" | "600" | "700" | "800";
  align?: "left" | "center" | "right";
  uppercase?: boolean;
}

// Text bound to the theme's type scale and semantic colors — new screens use
// this instead of hand-picking font sizes and hex values.
export function Txt({ variant = "body", tone = "primary", color, weight, align, uppercase, style, ...props }: TxtProps) {
  const t = useTheme();
  const toneColor = {
    primary: t.colors.textPrimary,
    secondary: t.colors.textSecondary,
    muted: t.colors.textMuted,
    accent: t.colors.accent,
    success: t.colors.success,
    warning: t.colors.warning,
    danger: t.colors.danger,
    onAccent: t.colors.onAccent,
  }[tone];
  return (
    <Text
      {...props}
      style={[
        t.type[variant],
        { color: color ?? toneColor },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: "uppercase", letterSpacing: 0.8 } : null,
        style,
      ]}
    />
  );
}
