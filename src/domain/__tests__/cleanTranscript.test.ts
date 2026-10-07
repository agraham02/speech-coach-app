import { cleanTranscript } from "../cleanTranscript";

describe("cleanTranscript", () => {
  it("removes hesitations and fixes spacing", () => {
    expect(cleanTranscript("so um I think, uh, the plan works")).toBe("So I think, the plan works.");
  });

  it("collapses stuttered repeats", () => {
    expect(cleanTranscript("the the main point is is clear.")).toBe("The main point is clear.");
  });

  it("keeps meaningful discourse words", () => {
    expect(cleanTranscript("it was kind of like a dream")).toBe("It was kind of like a dream.");
  });

  it("capitalizes sentences and the pronoun i", () => {
    expect(cleanTranscript("i agree. but i wonder why")).toBe("I agree. But I wonder why.");
  });

  it("returns empty for filler-only input", () => {
    expect(cleanTranscript("um uh")).toBe("");
  });
});
