export const colors = {
  background: "#0B0B0F",
  surface: "#15161C",
  surfaceRaised: "#1C1E27",
  border: "rgba(255,255,255,0.08)",
  textPrimary: "#F5F6FA",
  textSecondary: "#9AA0AE",
  textMuted: "#6B7280",
  accent: "#4F7CFF",
  accentMuted: "rgba(79,124,255,0.15)",
  success: "#3DD68C",
  successMuted: "rgba(61,214,140,0.15)",
  warning: "#F5A524",
  warningMuted: "rgba(245,165,36,0.15)",
  danger: "#E5484D",
  dangerMuted: "rgba(229,72,77,0.15)",
  overlayScrim: "rgba(11,11,15,0.75)",
  violet: "#8B5CF6",
  violetMuted: "rgba(139,92,246,0.18)",
  pink: "#EC4899",
  pinkMuted: "rgba(236,72,153,0.18)",
  teal: "#14B8A6",
  tealMuted: "rgba(20,184,166,0.18)",
} as const;

// Transcript-annotation highlight colors — one per feedback category. All
// represent "worth noticing/improving" flags, so none reuse `success` (green
// is reserved for "good outcome" semantics elsewhere in the app — status
// badges, high scores, checkmarks).
export const annotationColors: Record<"filler" | "structure" | "delivery" | "presence" | "content", string> = {
  filler: colors.warning,
  structure: colors.violet,
  delivery: colors.accent,
  presence: colors.pink,
  content: colors.teal,
};

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
