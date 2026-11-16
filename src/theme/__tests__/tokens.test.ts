import { darkPalette, lightPalette, PILLAR_KEYS, type Palette } from "../tokens";
import { SKILL_TREE } from "../../domain/scoring/skillTree";

// Task 8.2: the canvas's tokens, with the contrast the design system promises
// (4.5:1 for text in both themes).

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

// A colour, flattened onto `under` when it has alpha.
function rgb(color: string, under: [number, number, number] = [255, 255, 255]): [number, number, number] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number);
  return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = ([r, g, bl]: [number, number, number]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes: [string, Palette][] = [
  ["light", lightPalette],
  ["dark", darkPalette],
];

describe("tokens", () => {
  it("has the tree's six pillars, Composure included", () => {
    expect([...PILLAR_KEYS]).toEqual(SKILL_TREE.map((p) => p.id));
    for (const [, p] of themes) expect(Object.keys(p.pillar).sort()).toEqual([...PILLAR_KEYS].sort());
    expect(lightPalette.pillar.composure.fg).toBe("#526E10");
    expect(darkPalette.pillar.composure.fg).toBe("#B6D96A");
  });

  it.each(themes)("keeps every pillar's text readable on its tint, over the background and a surface (%s)", (_, p) => {
    for (const key of PILLAR_KEYS) {
      for (const ground of [p.background, p.surface]) {
        const tint = rgb(p.pillar[key].bg, rgb(ground));
        expect([key, ground, contrast(rgb(p.pillar[key].fg), tint) >= 4.5]).toEqual([key, ground, true]);
      }
    }
  });

  it.each(themes)("keeps body, secondary and muted text at 4.5:1 on the background (%s)", (_, p) => {
    for (const text of [p.textPrimary, p.textSecondary, p.textMuted]) {
      expect([text, contrast(rgb(text), rgb(p.background)) >= 4.5]).toEqual([text, true]);
    }
  });

  it("makes the main button brand red, with its label readable", () => {
    for (const [, p] of themes) {
      expect(p.brand).toBe("#D9361F");
      expect(contrast(rgb(p.onBrand), rgb(p.brand))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(p.brandText), rgb(p.background))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives bands five tints that keep body text readable", () => {
    for (const [, p] of themes) {
      expect(p.bands).toHaveLength(5);
      for (const band of p.bands) expect([band, contrast(rgb(p.textPrimary), rgb(band)) >= 4.5]).toEqual([band, true]);
    }
  });
});
