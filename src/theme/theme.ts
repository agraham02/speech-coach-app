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
  danger: "#E5484D",
  dangerMuted: "rgba(229,72,77,0.15)",
  overlayScrim: "rgba(11,11,15,0.75)",
} as const;

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
