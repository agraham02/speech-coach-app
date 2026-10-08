import { summarizeAttempt } from "../conversation/attemptMetrics";
import { ruleCoach } from "../coach/ruleCoach";
import { darkPalette, lightPalette, SKILL_LABELS } from "../../theme/tokens";
import { SKILLS } from "../mastery";

describe("conversation attempt metrics", () => {
  it("averages turn latencies and reads self-focus", () => {
    const s = summarizeAttempt({
      turns: [
        { latencyMs: 1000, asked: false },
        { latencyMs: 2000, asked: true },
      ],
      selfFocusBefore: 7,
      selfFocusAfter: 4,
    });
    expect(s).toEqual({ latencyMs: 1500, asked: true, selfFocusBefore: 7, selfFocusAfter: 4 });
  });

  it("tolerates missing or malformed JSON", () => {
    expect(summarizeAttempt(null)).toEqual({ latencyMs: null, asked: null, selfFocusBefore: null, selfFocusAfter: null });
    expect(summarizeAttempt({ turns: "nope", selfFocusAfter: "5" })).toEqual({ latencyMs: null, asked: null, selfFocusBefore: null, selfFocusAfter: null });
  });
});

describe("rep coach rambling tips", () => {
  const base = { durationSeconds: 60, wpmAvg: 150, fillerRatePerMinute: 1, pauses: null, presence: null, pitchRangeHz: 120 };

  it("flags detours as a tip without adding observations", () => {
    const transcript =
      "Remote work is better for focus. By the way my cat sat on my keyboard yesterday. Anyway, back to it. Speaking of cats, mine is great. So remote work wins.";
    const withDetours = ruleCoach({ ...base, transcript });
    const clean = ruleCoach({ ...base, transcript: "Remote work is better for focus. I get two hours of deep work every morning. So remote work wins." });
    expect(withDetours.tip).toMatch(/detours/);
    expect(withDetours.observations.map((o) => o.label)).toEqual(clean.observations.map((o) => o.label));
  });

  it("doesn't praise 'led with your point' after a throat-clearing opener", () => {
    // No pace/filler/pitch inputs, so nothing outranks the point-first win.
    const quiet = { durationSeconds: 30, wpmAvg: null, fillerRatePerMinute: null, pauses: null, presence: null, pitchRangeHz: null };
    const opener = ruleCoach({ ...quiet, transcript: "Okay, so, that's a good question. Let me think. I'd pick Lisbon because the food is great." });
    expect(opener.strength).not.toMatch(/led with your point/);
    const direct = ruleCoach({ ...quiet, transcript: "I would pick Lisbon for a trip. The food is great." });
    expect(direct.strength).toMatch(/led with your point/);
  });
});

// WCAG contrast of a hex color against another.
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

describe("skill colors", () => {
  it("every skill has a label and readable text color in both themes", () => {
    for (const skill of SKILLS) {
      expect(SKILL_LABELS[skill]).toBeTruthy();
      for (const bg of [lightPalette.surface, lightPalette.background]) expect(contrast(lightPalette.skill[skill].fg, bg)).toBeGreaterThanOrEqual(4.5);
      for (const bg of [darkPalette.surface, darkPalette.background]) expect(contrast(darkPalette.skill[skill].fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
