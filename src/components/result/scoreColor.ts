import { colors } from "../../theme/theme";

export function colorForScore(score: number): string {
  if (score >= 8) return colors.success;
  if (score >= 5) return colors.accent;
  return colors.warning;
}
