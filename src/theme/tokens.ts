import type { TextStyle } from "react-native";

// Semantic design tokens for both color schemes ("Calm coach" direction).
// Screens read these through useTheme()/makeStyles() (ThemeProvider.tsx),
// which follow the system appearance live. theme.ts builds the full color
// set (palette + a few extras) for a scheme.

export type SkillId = "articulation" | "cadence" | "impromptu" | "confidence";

export interface SkillColor {
  fg: string;
  bg: string;
}

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  separator: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  onAccent: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  overlayScrim: string;
  switchTrackOff: string;
  skill: Record<SkillId, SkillColor>;
}

export const darkPalette: Palette = {
  background: "#0B0B0F",
  surface: "#15161C",
  surfaceRaised: "#1C1E27",
  border: "rgba(255,255,255,0.08)",
  separator: "rgba(255,255,255,0.06)",
  textPrimary: "#F5F6FA",
  textSecondary: "#A3A9B6",
  textMuted: "#6E7584",
  accent: "#5B84FF",
  accentMuted: "rgba(91,132,255,0.16)",
  onAccent: "#FFFFFF",
  success: "#3DD68C",
  successMuted: "rgba(61,214,140,0.15)",
  warning: "#F5A524",
  warningMuted: "rgba(245,165,36,0.15)",
  danger: "#E5484D",
  dangerMuted: "rgba(229,72,77,0.15)",
  overlayScrim: "rgba(11,11,15,0.75)",
  switchTrackOff: "rgba(255,255,255,0.2)",
  skill: {
    articulation: { fg: "#2DD4BF", bg: "rgba(45,212,191,0.16)" },
    cadence: { fg: "#A78BFA", bg: "rgba(167,139,250,0.16)" },
    impromptu: { fg: "#FBBF24", bg: "rgba(251,191,36,0.16)" },
    confidence: { fg: "#F472B6", bg: "rgba(244,114,182,0.16)" },
  },
};

// Contrast-checked against `surface`/`background` for text use: skill fg
// colors are darker shades in light mode so labels stay readable (>= 4.5:1).
export const lightPalette: Palette = {
  background: "#F6F6F9",
  surface: "#FFFFFF",
  surfaceRaised: "#EEEFF4",
  border: "rgba(15,18,30,0.08)",
  separator: "rgba(15,18,30,0.06)",
  textPrimary: "#14161F",
  textSecondary: "#4A5161",
  textMuted: "#6B7282",
  accent: "#3359E0",
  accentMuted: "rgba(51,89,224,0.10)",
  onAccent: "#FFFFFF",
  success: "#11804F",
  successMuted: "rgba(17,128,79,0.10)",
  warning: "#A35C00",
  warningMuted: "rgba(163,92,0,0.10)",
  danger: "#C4262C",
  dangerMuted: "rgba(196,38,44,0.10)",
  overlayScrim: "rgba(20,22,31,0.45)",
  switchTrackOff: "rgba(15,18,30,0.15)",
  skill: {
    articulation: { fg: "#0F766E", bg: "rgba(15,118,110,0.10)" },
    cadence: { fg: "#6D28D9", bg: "rgba(109,40,217,0.10)" },
    impromptu: { fg: "#A16207", bg: "rgba(161,98,7,0.10)" },
    confidence: { fg: "#BE185D", bg: "rgba(190,24,93,0.10)" },
  },
};

// iOS-HIG-aligned type scale. Every style carries its own line height and
// weight so screens stop hand-tuning `typography.caption - 1` variants.
export const typeScale = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "600" },
} satisfies Record<string, TextStyle>;

export type TypeStyle = keyof typeof typeScale;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const SKILL_LABELS: Record<SkillId, string> = {
  articulation: "Articulation",
  cadence: "Cadence",
  impromptu: "Impromptu",
  confidence: "Confidence",
};
