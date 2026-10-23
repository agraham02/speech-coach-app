import type { Ionicons } from "@expo/vector-icons";

// Settings is a handful of small sections, each opened from the You tab.
export type SettingsSection = "practice" | "goal" | "ai" | "account" | "deepReviews" | "permissions" | "help";

export const SETTINGS_SECTIONS: { key: SettingsSection; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "practice", title: "Practice", subtitle: "Your profile, level and Plan your point", icon: "person-circle-outline" },
  { key: "goal", title: "Goal & reminders", subtitle: "Sessions a day, practice days and nudges", icon: "alarm-outline" },
  { key: "ai", title: "Coaching & AI", subtitle: "What runs on your phone", icon: "hardware-chip-outline" },
  { key: "account", title: "Account", subtitle: "Sign in for Tono AI", icon: "person-circle-outline" },
  { key: "deepReviews", title: "Deep reviews", subtitle: "Your AI coach: Tono AI or your own key", icon: "sparkles-outline" },
  { key: "permissions", title: "Permissions", subtitle: "Camera, microphone and notifications", icon: "shield-checkmark-outline" },
  { key: "help", title: "Help & data", subtitle: "Tips, diagnostics, export and reset", icon: "help-buoy-outline" },
];
