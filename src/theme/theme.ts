import { darkPalette, fontFamilies, lightPalette, radius, type Palette } from "./tokens";

export { font } from "./tokens";

export type SchemeName = "light" | "dark";

// Colors that aren't part of the semantic palette: subtle fills and the
// annotation hues used by the transcript and a few charts. They differ per
// scheme.
function extras(scheme: SchemeName) {
  const light = scheme === "light";
  return {
    subtleFill: light ? "rgba(28,25,15,0.045)" : "rgba(255,250,235,0.055)",
    heroBorder: light ? "rgba(28,25,15,0.08)" : "rgba(255,250,235,0.10)",
    violet: light ? "#6A3FD6" : "#B3A1FF",
    violetMuted: light ? "rgba(106,63,214,0.10)" : "rgba(179,161,255,0.16)",
    pink: light ? "#B8285F" : "#FF92B8",
    pinkMuted: light ? "rgba(184,40,95,0.10)" : "rgba(255,146,184,0.16)",
    teal: light ? "#0E7563" : "#5FE0C3",
    tealMuted: light ? "rgba(14,117,99,0.10)" : "rgba(95,224,195,0.16)",
    indigo: light ? "#3F51C9" : "#8C9BFF",
    indigoMuted: light ? "rgba(63,81,201,0.10)" : "rgba(140,155,255,0.16)",
    // A real blue for the few places that need "interactive" without ink
    // (an annotation category, a chart series).
    blue: light ? "#2F5BD3" : "#7EA2FF",
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
): Record<"filler" | "filler_contextual" | "structure" | "delivery" | "presence" | "content" | "restated_point" | "repeated_words", string> {
  return {
    filler: c.warning,
    // "like", "actually", "you know": fillers only in some uses, so a
    // different hue from um and uh.
    filler_contextual: c.pink,
    structure: c.violet,
    delivery: c.blue,
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

// Legacy scale for older screens (newer code uses the theme's `space`,
// `radius` and `type` through makeStyles). Kept in step with the tokens.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  pill: radius.pill,
} as const;

export const typography = {
  caption: 13,
  body: 15,
  bodyLarge: 17,
  title: 22,
  headline: 28,
} as const;

// Families for older screens' display styles: titles and numbers (title),
// spoken words — prompts and lines (spoken).
export const fontDisplay = {
  title: fontFamilies.semibold,
  spoken: fontFamilies.medium,
} as const;
