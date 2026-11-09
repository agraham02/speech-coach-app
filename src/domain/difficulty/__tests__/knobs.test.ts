import { breathRounds, guidedKnobs, rewindTargets, warmUpTargets } from "../knobs";
import { scoreGuided, tryPrompt } from "../../guided/guidedMeasures";
import { rewindScore } from "../../personal/personalScores";

describe("what gets harder", () => {
  it("guided bars run from the plan's easy end to its hard end", () => {
    expect(guidedKnobs(1)).toEqual({ rateRatioFull: 1.3, holdMs: 900 });
    expect(guidedKnobs(10)).toEqual({ rateRatioFull: 1.8, holdMs: 2700 });
  });

  it("Power pause asks for the hold its level needs", () => {
    expect(tryPrompt("Hold {hold} seconds, then speak.", 1)).toBe("Hold 1 seconds, then speak.");
    expect(tryPrompt("Hold {hold} seconds, then speak.", 10)).toBe("Hold 3 seconds, then speak.");
    expect(tryPrompt("Hold {hold} seconds, then speak.", 5)).toBe("Hold 2 seconds, then speak.");
  });

  it("the same Rate contrast scores less at a higher level", () => {
    const words = (text: string, gapMs: number) => {
      let t = 0;
      return text.split(" ").map((w) => {
        const word = { text: w, startMs: t, endMs: t + 250 };
        t += 250 + gapMs;
        return word;
      });
    };
    const clip = (text: string, gapMs: number) => {
      const w = words(text, gapMs);
      return { text, words: w, volume: [], startDelayMs: 0, spokenMs: w[w.length - 1].endMs };
    };
    const fast = clip("I woke up late and ran for the bus and made it", 0);
    const slow = clip("It was the most important thing today for me", 150);
    const easy = scoreGuided("gd_rate_contrast", [fast, slow], null, 1).score!;
    const hard = scoreGuided("gd_rate_contrast", [fast, slow], null, 10).score!;
    expect(easy).toBeGreaterThan(hard);
  });

  it("warm-ups: hiss 10 to 25 s, pa-ta-ka 5 to 7, siren 12 to 18, a round more every three levels", () => {
    expect(warmUpTargets(1)).toEqual({ hissSeconds: 10, patakaRate: 5, sirenSemitones: 12 });
    expect(warmUpTargets(10)).toEqual({ hissSeconds: 25, patakaRate: 7, sirenSemitones: 18 });
    expect([1, 3, 4, 7, 10].map((l) => breathRounds(4, l))).toEqual([4, 4, 5, 6, 7]);
  });

  it("Rewind: 60 to 120 seconds and more details for the same marks", () => {
    expect(rewindTargets(1)).toEqual({ targetSeconds: 60, detailsFull: 4 });
    expect(rewindTargets(10)).toEqual({ targetSeconds: 120, detailsFull: 6 });
    const stats = { seconds: 70, words: 150, coverage: { morning: true, midday: true, evening: true }, details: { numbers: 2, times: 1, names: 1, senses: 1, total: 5 }, longestPauseSeconds: null, longPauses: 0 };
    const at = (level: number) => rewindScore({ stats, transcript: "x", words: null, ...rewindTargets(level), delivery: false, stutterMode: false }).score!;
    expect(at(1)).toBeGreaterThan(at(10));
  });
});
