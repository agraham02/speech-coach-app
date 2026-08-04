// Converts a "#RRGGBB" hex string to "rgba(r,g,b,alpha)" — the theme's
// accent colors are stored as plain hex, but gradients (HeroCard) need an
// alpha channel to fade to transparent.
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
