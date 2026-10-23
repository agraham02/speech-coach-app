import { detectTypedFillers } from "../fillers";
import { computeFillerStats, detectFillerWords } from "../transcriptAnnotations";

const words = (text: string, type?: "hesitation" | "contextual") =>
  detectTypedFillers(text)
    .filter((m) => !type || m.type === type)
    .map((m) => m.word.toLowerCase());

describe("hesitation fillers", () => {
  it("always counts um, uh and er", () => {
    expect(words("Um, so I was, uh, thinking we could, er, go. Ummm. Uhh, yes.", "hesitation")).toEqual(["um", "uh", "er", "ummm", "uhh"]);
  });

  it("doesn't mistake real words for them", () => {
    expect(words("The umbrella is under the eraser.")).toEqual([]);
  });
});

describe("like", () => {
  it("counts the filler use", () => {
    expect(words("And it was, like, the best day ever.")).toEqual(["like"]);
    expect(words("Like, I don't even know where to start.")).toEqual(["like"]);
    expect(words("It was like really hard to get there.")).toEqual(["like"]);
    expect(words("We just, um, like walked in.")).toEqual(["um", "like"]);
    expect(words("I was like like totally lost.")).toEqual(["like"]);
  });

  it("leaves the verb and the comparison alone", () => {
    expect(words("I like this plan a lot.")).toEqual([]);
    expect(words("I would like to talk about my first job.")).toEqual([]);
    expect(words("It looks like rain, and it sounds like thunder.")).toEqual([]);
    expect(words("Do it like this, not like that.")).toEqual([]);
    expect(words("Things like budgets and deadlines matter.")).toEqual([]);
    expect(words("She runs like a pro.")).toEqual([]);
    expect(words("Nothing like it exists.")).toEqual([]);
  });

  it("stays out when it can't tell (quotative, approximations)", () => {
    expect(words("And then he was like we need to leave now.")).toEqual([]);
    expect(words("There were like twenty people there.")).toEqual([]);
  });
});

describe("actually", () => {
  it("counts padding, not contrast", () => {
    expect(words("It was actually really good.")).toEqual(["actually"]);
    expect(words("I actually just wanted to say thanks.")).toEqual(["actually"]);
    expect(words("Um actually I forgot.")).toEqual(["um", "actually"]);
  });

  it("leaves contrast alone", () => {
    expect(words("I actually disagree with that.")).toEqual([]);
    expect(words("Actually, no, the meeting is on Tuesday.")).toEqual([]);
    expect(words("Everyone thought it failed, but it actually worked.")).toEqual([]);
  });
});

describe("other context fillers", () => {
  it("counts you know and I mean only when they stand alone", () => {
    expect(words("It's hard, you know, to start over.")).toEqual(["you know"]);
    expect(words("I mean, it worked out in the end.")).toEqual(["i mean"]);
    expect(words("Do you know what time it is?")).toEqual([]);
    expect(words("You know how it goes.")).toEqual([]);
    expect(words("That's not what I mean.")).toEqual([]);
    expect(words("I mean it this time.")).toEqual([]);
  });

  it("counts kind of and sort of as hedges, not as names for a kind", () => {
    expect(words("It's kind of hard to explain.")).toEqual(["kind of"]);
    expect(words("I sort of agree.")).toEqual(["sort of"]);
    expect(words("What kind of car do you drive?")).toEqual([]);
    expect(words("This sort of thing happens.")).toEqual([]);
  });

  it("counts basically and literally when they pad, not in the literal sense", () => {
    expect(words("Basically, we ran out of time.")).toEqual(["basically"]);
    expect(words("It was literally so cold.")).toEqual(["literally"]);
    expect(words("The phrase translated literally means good luck.")).toEqual([]);
  });

  it("labels each kind", () => {
    const typed = detectFillerWords("Um, it was, like, kind of fun.");
    expect(typed.map((m) => m.type)).toEqual(["hesitation", "contextual", "contextual"]);
  });
});

describe("computeFillerStats", () => {
  it("counts both kinds apart and together", () => {
    const s = computeFillerStats("Um, so, uh, it was, like, kind of fun. I actually disagree.", 30);
    expect(s.hesitation.count).toBe(2);
    expect(s.contextual.count).toBe(2);
    expect(s.count).toBe(4);
    expect(s.ratePerMinute).toBe(8);
    expect(s.hesitation.ratePerMinute).toBe(4);
  });
});
