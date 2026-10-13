import type { TextStyle, ViewStyle } from "react-native";

// Design tokens — "Quiet Studio" (design-refresh-plan.md). Warm neutrals and
// an ink accent; color only where it means something (the five skills,
// status, recording). Screens read these through useTheme()/makeStyles()
// (ThemeProvider.tsx), which follow the system appearance live.

export type SkillId = "articulation" | "cadence" | "impromptu" | "confidence" | "conversation";

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
  // The ink: primary buttons, selection, focus. Monochrome on purpose — the
  // only hues in the UI are the skills, status and recording.
  accent: string;
  accentMuted: string;
  onAccent: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  // The record button and the live dot, in both schemes.
  record: string;
  overlayScrim: string;
  switchTrackOff: string;
  skill: Record<SkillId, SkillColor>;
}

export const darkPalette: Palette = {
  background: "#0E0E0C",
  surface: "#181816",
  surfaceRaised: "#232320",
  border: "rgba(255,250,235,0.08)",
  separator: "rgba(255,250,235,0.07)",
  textPrimary: "#F4F2EC",
  textSecondary: "#A9A69D",
  textMuted: "#868379",
  accent: "#F4F2EC",
  accentMuted: "rgba(244,242,236,0.10)",
  onAccent: "#0E0E0C",
  success: "#5FD69B",
  successMuted: "rgba(95,214,155,0.14)",
  warning: "#F2B54B",
  warningMuted: "rgba(242,181,75,0.14)",
  danger: "#FF6B5E",
  dangerMuted: "rgba(255,107,94,0.14)",
  record: "#FF453A",
  overlayScrim: "rgba(8,8,6,0.72)",
  switchTrackOff: "rgba(255,250,235,0.18)",
  skill: {
    articulation: { fg: "#5FE0C3", bg: "rgba(95,224,195,0.14)" },
    cadence: { fg: "#B3A1FF", bg: "rgba(179,161,255,0.14)" },
    impromptu: { fg: "#FFC85E", bg: "rgba(255,200,94,0.14)" },
    confidence: { fg: "#FF92B8", bg: "rgba(255,146,184,0.14)" },
    conversation: { fg: "#6FC6FF", bg: "rgba(111,198,255,0.14)" },
  },
};

// Skill fg colors are deeper in light mode so labels stay readable (>= 4.5:1
// on surface and background).
export const lightPalette: Palette = {
  background: "#F6F5F1",
  surface: "#FFFFFF",
  surfaceRaised: "#EFEEE9",
  border: "rgba(28,25,15,0.09)",
  separator: "rgba(28,25,15,0.07)",
  textPrimary: "#181714",
  textSecondary: "#5D5A52",
  textMuted: "#77726A",
  accent: "#181714",
  accentMuted: "rgba(24,23,20,0.07)",
  onAccent: "#FFFFFF",
  success: "#14824F",
  successMuted: "rgba(20,130,79,0.10)",
  warning: "#A35F00",
  warningMuted: "rgba(163,95,0,0.10)",
  danger: "#C93A2E",
  dangerMuted: "rgba(201,58,46,0.10)",
  record: "#FF3B30",
  overlayScrim: "rgba(24,23,20,0.42)",
  switchTrackOff: "rgba(28,25,15,0.16)",
  skill: {
    articulation: { fg: "#0E7563", bg: "rgba(14,117,99,0.10)" },
    cadence: { fg: "#6A3FD6", bg: "rgba(106,63,214,0.10)" },
    impromptu: { fg: "#9A6200", bg: "rgba(154,98,0,0.10)" },
    confidence: { fg: "#B8285F", bg: "rgba(184,40,95,0.10)" },
    conversation: { fg: "#0A6FA6", bg: "rgba(10,111,166,0.10)" },
  },
};

// One family, Instrument Sans: titles and big numbers in semibold with tight
// tracking, spoken words (prompts, lines) in medium, the interface in
// regular. Each weight is its own family: on Android a custom font plus
// `fontWeight` renders a faked bold, so type styles carry `fontFamily` and
// never `fontWeight`.
export const fontFamilies = {
  regular: "InstrumentSans-Regular",
  medium: "InstrumentSans-Medium",
  semibold: "InstrumentSans-SemiBold",
  bold: "InstrumentSans-Bold",
} as const;

export type FontWeight = "400" | "500" | "600" | "700" | "800" | "900";

// The sans family for a weight — use in styles instead of `fontWeight`:
//   title: { ...font("600"), fontSize: 18 }
export function font(weight: FontWeight | TextStyle["fontWeight"] = "400"): { fontFamily: string } {
  switch (String(weight)) {
    case "500":
      return { fontFamily: fontFamilies.medium };
    case "600":
      return { fontFamily: fontFamilies.semibold };
    case "700":
    case "800":
    case "900":
    case "bold":
      return { fontFamily: fontFamilies.bold };
    default:
      return { fontFamily: fontFamilies.regular };
  }
}

export const typeScale = {
  display: { ...font("600"), fontSize: 52, lineHeight: 58, letterSpacing: -1.8 },
  largeTitle: { ...font("600"), fontSize: 34, lineHeight: 41, letterSpacing: -1 },
  title1: { ...font("600"), fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  title2: { ...font("600"), fontSize: 21, lineHeight: 27, letterSpacing: -0.2 },
  title3: { ...font("600"), fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  headline: { ...font("600"), fontSize: 16, lineHeight: 22 },
  body: { ...font("400"), fontSize: 16, lineHeight: 24 },
  callout: { ...font("400"), fontSize: 15, lineHeight: 22 },
  subhead: { ...font("400"), fontSize: 14, lineHeight: 20 },
  footnote: { ...font("400"), fontSize: 13, lineHeight: 18 },
  caption1: { ...font("500"), fontSize: 12, lineHeight: 16 },
  caption2: { ...font("600"), fontSize: 11, lineHeight: 14, letterSpacing: 0.1 },
  // Spoken words: prompts, lines to read, quotes.
  quote: { ...font("500"), fontSize: 22, lineHeight: 30, letterSpacing: -0.3 },
} satisfies Record<string, TextStyle>;

export type TypeStyle = keyof typeof typeScale;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
// Screen side padding, and the gap between a screen's sections.
export const layout = { gutter: 20, section: 28 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

// Dark mode separates layers by tone alone; light mode lifts cards with a
// soft shadow instead of a border.
export function shadows(scheme: "light" | "dark"): { card: ViewStyle; float: ViewStyle } {
  if (scheme === "dark") {
    return {
      card: {},
      float: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
    };
  }
  return {
    card: { shadowColor: "#1C190F", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    float: { shadowColor: "#1C190F", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  };
}

export const SKILL_LABELS: Record<SkillId, string> = {
  articulation: "Articulation",
  cadence: "Cadence",
  impromptu: "Impromptu",
  confidence: "Confidence",
  conversation: "Conversation",
};
