import type { TextStyle, ViewStyle } from "react-native";

// Design tokens — "Quiet Studio", in the "Words and bands" look (D38, the
// redesign canvas). Warm neutrals and an ink accent; colour only where it
// means something: the six pillars, status, recording, and one brand red for
// the main action. Screens read these through useTheme()/makeStyles()
// (ThemeProvider.tsx), which follow the system appearance live.

export type SkillId = "articulation" | "cadence" | "impromptu" | "confidence" | "conversation";

// The skill tree's six pillars (domain/scoring/skillTree.ts; a test keeps the
// two lists the same).
export type PillarKey = "message" | "voice" | "connection" | "clarity" | "presence" | "composure";
export const PILLAR_KEYS: readonly PillarKey[] = ["message", "voice", "connection", "clarity", "presence", "composure"];

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
  // Brand red, from the logo's dot: the one main button on a screen, the
  // selected tab's dot and a tappable phrase's underline. Nothing else.
  brand: string;
  // Brand red as text or a line (lighter in dark mode to stay readable).
  brandText: string;
  brandMuted: string;
  onBrand: string;
  // The five tints that stacked bands take, in order.
  bands: readonly [string, string, string, string, string];
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  // The highlighter-pen yellow behind filler words in a transcript. Opaque, and
  // textPrimary stays readable on it (>= 4.5:1) in both schemes, so the marked
  // words keep their normal ink.
  highlight: string;
  // The record button and the live dot, in both schemes.
  record: string;
  overlayScrim: string;
  switchTrackOff: string;
  skill: Record<SkillId, SkillColor>;
  // Text colour on its own tint, >= 4.5:1 in both schemes. Pillar colours
  // always come with the pillar's name, so colour is never the only signal.
  pillar: Record<PillarKey, SkillColor>;
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
  brand: "#D9361F",
  brandText: "#FF6B55",
  brandMuted: "rgba(255,107,85,0.18)",
  onBrand: "#FFFFFF",
  bands: ["#2B2823", "#33291F", "#262C22", "#22292D", "#302C1B"],
  success: "#5FD69B",
  successMuted: "rgba(95,214,155,0.14)",
  warning: "#F2B54B",
  warningMuted: "rgba(242,181,75,0.14)",
  danger: "#FF6B5E",
  dangerMuted: "rgba(255,107,94,0.14)",
  // A deep gold: reads as yellow on the dark surfaces without glaring, with
  // the light ink on top.
  highlight: "#7A6200",
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
  pillar: {
    message: { fg: "#FFC85E", bg: "rgba(255,200,94,0.14)" },
    voice: { fg: "#B3A1FF", bg: "rgba(179,161,255,0.14)" },
    connection: { fg: "#6FC6FF", bg: "rgba(111,198,255,0.14)" },
    clarity: { fg: "#5FE0C3", bg: "rgba(95,224,195,0.14)" },
    presence: { fg: "#FF92B8", bg: "rgba(255,146,184,0.14)" },
    composure: { fg: "#B6D96A", bg: "rgba(182,217,106,0.14)" },
  },
};

// Skill and pillar fg colours are deeper in light mode so labels stay
// readable (>= 4.5:1 on their own tint, over the background or a surface).
export const lightPalette: Palette = {
  background: "#F6F5F1",
  surface: "#FFFFFF",
  surfaceRaised: "#EFEEE9",
  border: "rgba(28,25,15,0.09)",
  separator: "rgba(28,25,15,0.07)",
  textPrimary: "#181714",
  textSecondary: "#5D5A52",
  // Darkened from #77726A (4.4:1) so it passes 4.5:1 on the background.
  textMuted: "#6E6A62",
  accent: "#181714",
  accentMuted: "rgba(24,23,20,0.07)",
  onAccent: "#FFFFFF",
  brand: "#D9361F",
  // A shade darker than the button, so red text passes 4.5:1 on the background.
  brandText: "#CC321C",
  brandMuted: "rgba(217,54,31,0.12)",
  onBrand: "#FFFFFF",
  bands: ["#EBE4D5", "#E8D8CB", "#DDE2D0", "#D9E0E3", "#EFE5C2"],
  success: "#14824F",
  successMuted: "rgba(20,130,79,0.10)",
  warning: "#A35F00",
  warningMuted: "rgba(163,95,0,0.10)",
  danger: "#C93A2E",
  dangerMuted: "rgba(201,58,46,0.10)",
  // Highlighter yellow with the dark ink on top.
  highlight: "#FFE55C",
  record: "#FF3B30",
  overlayScrim: "rgba(24,23,20,0.42)",
  switchTrackOff: "rgba(28,25,15,0.16)",
  skill: {
    articulation: { fg: "#0E7361", bg: "rgba(14,115,97,0.10)" },
    cadence: { fg: "#6A3FD6", bg: "rgba(106,63,214,0.10)" },
    impromptu: { fg: "#8E5A00", bg: "rgba(142,90,0,0.10)" },
    confidence: { fg: "#B8285F", bg: "rgba(184,40,95,0.10)" },
    conversation: { fg: "#0A6B9F", bg: "rgba(10,107,159,0.10)" },
  },
  pillar: {
    message: { fg: "#8E5A00", bg: "rgba(142,90,0,0.10)" },
    voice: { fg: "#6A3FD6", bg: "rgba(106,63,214,0.10)" },
    connection: { fg: "#0A6B9F", bg: "rgba(10,107,159,0.10)" },
    clarity: { fg: "#0E7361", bg: "rgba(14,115,97,0.10)" },
    presence: { fg: "#B8285F", bg: "rgba(184,40,95,0.10)" },
    composure: { fg: "#526E10", bg: "rgba(82,110,16,0.11)" },
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

// The one type scale (PLAN section 15, task 8.1), as the redesign canvas has
// it ("Words and bands", D38). Screens use these through <Txt variant> or
// theme.type; a test keeps raw sizes and <Text> out of the app.
export const typeScale = {
  // Big numbers are light, never bold, with tight tracking (scores, Overall).
  display: { ...font("400"), fontSize: 52, lineHeight: 54, letterSpacing: -3.4 },
  // Two-tone sentence headlines ("Morning, Sam. Ten minutes on ...").
  say: { ...font("500"), fontSize: 34, lineHeight: 38, letterSpacing: -0.9 },
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
  // A section's small-caps label: information, never tappable.
  label: { ...font("600"), fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: "uppercase" },
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
  articulation: "Clarity",
  cadence: "Voice",
  impromptu: "Message",
  confidence: "Presence",
  conversation: "Connection",
};
