import { alignWords, fillerRetention, matchFillers, normalizeForWer, wordErrorRate } from "../eval/wer";

describe("normalizeForWer numbers", () => {
  it("spells out small numbers and ordinals", () => {
    expect(normalizeForWer("The 1st time, 3 times a week")).toEqual(["the", "first", "time", "three", "times", "a", "week"]);
    expect(wordErrorRate("the first time three times", "the 1st time 3 times")).toBe(0);
  });
});

describe("alignWords", () => {
  it("maps each reference word to its hypothesis word, or -1 when dropped", () => {
    expect(alignWords(["so", "um", "i", "went"], ["so", "i", "went"])).toEqual([0, -1, 1, 2]);
    expect(alignWords(["a", "b"], ["a", "x", "b"])).toEqual([0, 2]);
    expect(alignWords([], ["a"])).toEqual([]);
  });
});

describe("matchFillers", () => {
  it("counts fillers kept in place", () => {
    expect(matchFillers("So, um, I wanted to, uh, go", "So um I wanted to uh go")).toEqual({ expected: 2, kept: 2, invented: 0 });
  });

  it("does not credit fillers invented elsewhere", () => {
    // The filler-prompted model on garbage audio: four ums, none real.
    const reference = "So, um, I wanted to talk about, uh, how I started running last year";
    const hypothesis = "Um, I mean, yeah. Um, I mean, yeah.";
    expect(matchFillers(reference, hypothesis).invented).toBeGreaterThan(0);
    expect(matchFillers("so um i wanted to talk uh about it", "so i wanted to talk about it um um")).toEqual({ expected: 2, kept: 0, invented: 2 });
  });

  it("counts um written as uh as kept", () => {
    expect(matchFillers("I um think", "I uh think")).toEqual({ expected: 1, kept: 1, invented: 0 });
  });

  it("keeps the old behaviour for the simple cases", () => {
    expect(fillerRetention("um so uh yes", "so uh yes")).toBe(0.5);
    expect(fillerRetention("so yes", "so yes")).toBeNull();
  });
});
