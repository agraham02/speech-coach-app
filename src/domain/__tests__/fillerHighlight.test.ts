import { buildHighlightSegments, detectFillerWords, type AnnotationCategory, type LocatedAnnotation } from "../transcriptAnnotations";
import { buildColors, getAnnotationColors } from "../../theme/theme";
import { darkPalette, lightPalette } from "../../theme/tokens";

// WCAG 2.x contrast ratio between two opaque hex colors.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("highlight token", () => {
  const HEX = /^#[0-9A-Fa-f]{6}$/;

  it("is an opaque hex color in both themes", () => {
    expect(lightPalette.highlight).toMatch(HEX);
    expect(darkPalette.highlight).toMatch(HEX);
  });

  it("keeps the transcript text readable on it (>= 4.5:1) in light and dark", () => {
    expect(contrast(lightPalette.textPrimary, lightPalette.highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkPalette.textPrimary, darkPalette.highlight)).toBeGreaterThanOrEqual(4.5);
  });

  it("reads as yellow: red and green high, blue low", () => {
    for (const hex of [lightPalette.highlight, darkPalette.highlight]) {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(r).toBeGreaterThan(b);
      expect(g).toBeGreaterThan(b);
      expect(Math.abs(r - g)).toBeLessThan(40);
    }
  });

  it("is what both filler categories use, in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      const colors = buildColors(scheme);
      const annotation = getAnnotationColors(colors);
      expect(annotation.filler).toBe(colors.highlight);
      expect(annotation.filler_contextual).toBe(colors.highlight);
    }
  });
});

describe("filler words in the transcript segments", () => {
  const transcript = "Um, so I think, like, it was, you know, fine uh yes.";

  // The same mapping AnnotatedTranscript builds from detectFillerWords.
  function fillerAnnotations(): LocatedAnnotation[] {
    return detectFillerWords(transcript).map((match) => ({
      start: match.start,
      end: match.end,
      category: (match.type === "hesitation" ? "filler" : "filler_contextual") as AnnotationCategory,
      note: match.word,
    }));
  }

  it("marks um, uh, like and you know, and nothing else", () => {
    const segments = buildHighlightSegments(transcript, fillerAnnotations());
    const marked = segments.filter((s) => s.category !== null).map((s) => s.text.toLowerCase());
    expect(marked).toEqual(["um", "like", "you know", "uh"]);
    expect(segments.map((s) => s.text).join("")).toBe(transcript);
  });

  it("gives um and uh the filler category and like and you know the contextual one", () => {
    const segments = buildHighlightSegments(transcript, fillerAnnotations());
    const byText = Object.fromEntries(segments.filter((s) => s.category).map((s) => [s.text.toLowerCase(), s.category]));
    expect(byText).toEqual({ um: "filler", like: "filler_contextual", "you know": "filler_contextual", uh: "filler" });
  });

  it("leaves a transcript with no fillers unmarked", () => {
    const clean = "We shipped the release on Friday.";
    const segments = buildHighlightSegments(clean, detectFillerWords(clean).map((m) => ({ start: m.start, end: m.end, category: "filler" as const, note: m.word })));
    expect(segments).toEqual([{ text: clean, category: null, note: null }]);
  });
});
