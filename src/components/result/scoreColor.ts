import type { Colors } from "../../theme/theme";

export function colorForScore(score: number, colors: Colors): string {
  if (score >= 8) return colors.success;
  if (score >= 5) return colors.accent;
  return colors.warning;
}
