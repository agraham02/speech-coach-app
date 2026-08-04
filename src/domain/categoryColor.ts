import { colors } from "../theme/theme";

export interface CategoryColor {
  fg: string;
  bg: string;
}

const PALETTE: CategoryColor[] = [
  { fg: colors.accent, bg: colors.accentMuted },
  { fg: colors.violet, bg: colors.violetMuted },
  { fg: colors.pink, bg: colors.pinkMuted },
  { fg: colors.teal, bg: colors.tealMuted },
];

// Deterministic hash so a given category always lands on the same color,
// stable across renders and sessions without a lookup table that would need
// updating every time data/topics.ts grows a new category.
export function colorForCategory(category: string): CategoryColor {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
