import { wordCount } from "../inputGuards";

describe("wordCount", () => {
  it("counts words, not spaces", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount(" one  two\nthree ")).toBe(3);
  });
});
