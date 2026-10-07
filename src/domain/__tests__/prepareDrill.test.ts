import { countPauseMarks, prepareDrill, stripPauseMarks } from "../drills/prepareDrill";

describe("prepareDrill", () => {
  it("strips and counts pause marks", () => {
    expect(stripPauseMarks("One. / Two, // three.")).toBe("One. Two, three.");
    expect(countPauseMarks("a / b // c / d")).toBe(3);
  });

  it("is deterministic for a seed and respects content ids", () => {
    expect(prepareDrill("pace_reading", 3, 7)).toEqual(prepareDrill("pace_reading", 3, 7));
    expect(prepareDrill("minimal_pairs", 2, 1, "mp_r_l").contentId).toBe("mp_r_l");
  });

  it("scales difficulty with level", () => {
    const easy = prepareDrill("minimal_pairs", 1, 3);
    const hard = prepareDrill("minimal_pairs", 9, 3);
    expect(hard.targetText!.split(" ").length).toBeGreaterThan(easy.targetText!.split(" ").length);
    expect(prepareDrill("random_word_story", 9, 1).words!.length).toBe(4);
    expect(prepareDrill("random_word_story", 1, 1).words!.length).toBe(2);
  });

  it("pause drills show marks but score against clean text", () => {
    const setup = prepareDrill("pause_reading", 2, 4);
    expect(setup.pauseMarks).toBeGreaterThan(0);
    expect(setup.targetText).not.toMatch(/\//);
    expect(setup.displayText).toMatch(/[|‖]/);
  });

  it("only offers easy content at low levels", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(["pace_coffee", "pace_bridge"]).toContain(prepareDrill("pace_reading", 1, seed).contentId);
    }
  });

  it("refuses non-live types", () => {
    expect(() => prepareDrill("rep", 1, 1)).toThrow();
  });
});
