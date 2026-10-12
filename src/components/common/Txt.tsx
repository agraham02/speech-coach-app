import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { font, fontFamilies, SERIF_VARIANTS, type TypeStyle } from "../../theme/tokens";

type Tone = "primary" | "secondary" | "muted" | "accent" | "success" | "warning" | "danger" | "onAccent";

interface TxtProps extends TextProps {
  variant?: TypeStyle;
  tone?: Tone;
  color?: string;
  // Sans weights map to their own family (never fontWeight — see tokens.ts).
  // Ignored for the serif variants, which have one weight.
  weight?: "400" | "500" | "600" | "700" | "800";
  align?: "left" | "center" | "right";
  // Retired all-caps eyebrow: now renders as a quiet sentence-case label.
  uppercase?: boolean;
  // Serif italic (quotes) or tabular figures (numbers that change).
  italic?: boolean;
  tabular?: boolean;
}

const EYEBROW: TextStyle = { fontSize: 13, lineHeight: 18, letterSpacing: 0 };

// Text bound to the theme's type scale and semantic colors — screens use
// this instead of hand-picking font sizes and hex values.
export function Txt({ variant = "body", tone = "primary", color, weight, align, uppercase, italic, tabular, style, ...props }: TxtProps) {
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
  }[uppercase && tone === "muted" ? "muted" : tone];
  const serif = SERIF_VARIANTS.has(variant);
  return (
    <Text
      {...props}
      style={[
        t.type[variant],
        { color: color ?? toneColor },
        uppercase ? [EYEBROW, font(weight ?? "500")] : weight && !serif ? font(weight) : null,
        italic ? { fontFamily: serif ? fontFamilies.serifItalic : fontFamilies.regular, fontStyle: serif ? "normal" : "italic" } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
