import { darkPalette, lightPalette, type Palette } from "./tokens";

export type SchemeName = "light" | "dark";

// Colors that aren't part of the semantic palette: subtle fills and the
// decorative accent hues used by older screens. They differ per scheme.
function extras(scheme: SchemeName) {
  const light = scheme === "light";
  return {
    subtleFill: light ? "rgba(15,18,30,0.05)" : "rgba(255,255,255,0.06)",
    heroBorder: light ? "rgba(15,18,30,0.10)" : "rgba(255,255,255,0.14)",
    violet: light ? "#6D28D9" : "#8B5CF6",
    violetMuted: light ? "rgba(109,40,217,0.12)" : "rgba(139,92,246,0.18)",
    pink: light ? "#BE185D" : "#EC4899",
    pinkMuted: light ? "rgba(190,24,93,0.12)" : "rgba(236,72,153,0.18)",
    teal: light ? "#0F766E" : "#14B8A6",
    tealMuted: light ? "rgba(15,118,110,0.12)" : "rgba(20,184,166,0.18)",
    indigo: light ? "#4338CA" : "#6366F1",
    indigoMuted: light ? "rgba(67,56,202,0.12)" : "rgba(99,102,241,0.18)",
  };
}

// Everything a screen can ask the theme for: the semantic palette plus the
// extras. Read it with useTheme().colors (components) or the `colors` the
// makeStyles factory receives (styles) so it follows the system appearance.
export type Colors = Palette & ReturnType<typeof extras>;

export function buildColors(scheme: SchemeName): Colors {
  return { ...(scheme === "light" ? lightPalette : darkPalette), ...extras(scheme) };
}

// Always-dark colors for camera screens (recording overlays sit on top of
// live video, so they stay light-on-dark in both modes).
export const darkColors = buildColors("dark");

// Transcript-annotation highlight colors — one per feedback category. All
// represent "worth noticing/improving" flags, so none reuse `success` (green
// is reserved for "good outcome" semantics elsewhere in the app — status
// badges, high scores, checkmarks).
export function getAnnotationColors(
  c: Colors,
): Record<"filler" | "structure" | "delivery" | "presence" | "content" | "restated_point" | "repeated_words", string> {
  return {
    filler: c.warning,
    structure: c.violet,
    delivery: c.accent,
    presence: c.pink,
    content: c.teal,
    // The primary lever for the user's actual "I ramble/repeat myself"
    // complaint — a real flag on a real weakness, so it earns the danger red
    // rather than something more decorative.
    restated_point: c.danger,
    // A secondary, stutter-adjacent signal (literal word repetition, not the
    // same idea rephrased) — deliberately a different hue from restated_point
    // so the two never read as the same finding.
    repeated_words: c.indigo,
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  caption: 13,
  body: 15,
  bodyLarge: 17,
  title: 22,
  headline: 28,
} as const;

// Sora, loaded via expo-font in App.tsx — reserved for the "hero" numbers
// (overall score, streak count, recording timer) that the visual-direction
// pass calls out as display moments; everything else stays on the system
// font. Falls back to the system font automatically if used before the
// fonts finish loading, since an unregistered fontFamily name just no-ops.
export const fontDisplay = {
  regular: "Sora-Regular",
  bold: "Sora-Bold",
} as const;
