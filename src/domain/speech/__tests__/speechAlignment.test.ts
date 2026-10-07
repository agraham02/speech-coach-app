import { tokenizeHeard } from "../normalize";
import { numericReadings } from "../numberWords";
import {
  alignFinal,
  buildTarget,
  followLive,
  scoreAlignment,
  scoreManualAttempt,
  statusesFromAlignment,
} from "../speechAlignment";

function heard(text: string) {
  return tokenizeHeard(text).tokens;
}

function finalScore(targetText: string, reps: number, heardText: string, focus: string[] = []) {
  const target = buildTarget(targetText, reps);
  const tokens = heard(heardText);
  const ops = alignFinal(target, tokens);
  return { target, ops, score: scoreAlignment(target, tokens, ops, { speakingMs: 6000 }, focus) };
}

describe("numericReadings", () => {
  it("reads cardinals, digit-by-digit, and ordinals", () => {
    expect(numericReadings("2")).toEqual(["two"]);
    expect(numericReadings("11")).toEqual(["eleven", "oneone"]);
    expect(numericReadings("6th")).toEqual(["sixth"]);
    expect(numericReadings("21")).toContain("twentyone");
    expect(numericReadings("word")).toEqual([]);
  });
});

describe("tokenizeHeard", () => {
  it("normalizes curly apostrophes and strips fillers but counts them", () => {
    const { tokens, fillerCount } = tokenizeHeard("Um the sixth sick sheikh’s uh sheep");
    expect(tokens.map((t) => t.norm)).toEqual(["the", "sixth", "sick", "sheikhs", "sheep"]);
    expect(fillerCount).toBe(2);
  });
});

describe("buildTarget", () => {
  it("expands repetitions and splits hyphenated words", () => {
    const target = buildTarget("One-one was fast.", 2);
    expect(target.map((w) => w.norm)).toEqual(["one", "one", "was", "fast", "one", "one", "was", "fast"]);
    expect(target[0].display).toBe("One-");
    expect(target[4].rep).toBe(1);
  });
});

describe("followLive", () => {
  const fred = buildTarget("Fred fed Ted bread, and Ted fed Fred bread.");

  it("keeps following after a misheard word instead of freezing", () => {
    const state = followLive(fred, heard("fred said ted bread and ted fed fred bread"));
    expect(state.statuses[0]).toBe("hit");
    expect(state.statuses[1]).toBe("missed"); // "fed" heard as "said"
    expect(state.statuses.slice(2)).toEqual(Array(7).fill("hit"));
    expect(state.cursor).toBe(9);
  });

  it("does not jump to a repeated word's later occurrence", () => {
    // "fed" also appears at index 6 — it must match index 1, not skip ahead.
    const state = followLive(fred, heard("fred fed"));
    expect(state.statuses.slice(0, 3)).toEqual(["hit", "hit", "pending"]);
    expect(state.cursor).toBe(2);
  });

  it("counts an unmatched word as extra and leaves the cursor in place", () => {
    const state = followLive(fred, heard("fred banana"));
    expect(state.cursor).toBe(1);
    expect(state.extraWords).toBe(1);
  });

  it("resyncs when the speaker skips ahead past the window", () => {
    const state = followLive(fred, heard("fred fed ted fed fred bread"));
    // "ted" at 2, then "fed fred bread" matches 6..8 via a 3-word resync.
    expect(state.statuses.slice(6)).toEqual(["hit", "hit", "hit"]);
    expect(state.cursor).toBe(9);
  });

  it("tracks the current repetition", () => {
    const target = buildTarget("Toy boat.", 3);
    const state = followLive(target, heard("toy boat toy boat"));
    expect(state.cursor).toBe(4);
    expect(state.currentRep).toBe(2);
  });

  it("matches compounds, numbers, and homophones", () => {
    const wood = followLive(buildTarget("How much wood would a woodchuck chuck"), heard("how much would wood a wood chuck chuck"));
    expect(wood.statuses).toEqual(Array(7).fill("hit"));

    const twos = followLive(buildTarget("One-one was a race horse, two-two was one too."), heard("11 was a race horse 2 2 was 1 to"));
    expect(twos.statuses.every((s) => s === "hit")).toBe(true);

    const cream = followLive(buildTarget("I scream, you scream"), heard("ice cream you scream"));
    expect(cream.statuses).toEqual(["hit", "hit", "hit", "hit"]);
  });
});

describe("alignFinal + scoreAlignment", () => {
  it("scores a perfect three-rep attempt", () => {
    const { score } = finalScore("She sells seashells by the seashore.", 3, Array(3).fill("she sells seashells by the seashore").join(" "));
    expect(score.accuracyPercent).toBe(100);
    expect(score.cleanWordPercent).toBe(100);
    expect(score.repsCompleted).toBe(3);
    expect(score.misses).toEqual([]);
  });

  it("scores only two of three reps at about two thirds", () => {
    const { score } = finalScore("Toy boat.", 3, "toy boat toy boat");
    expect(score.accuracyPercent).toBe(67);
    expect(score.repsCompleted).toBe(2);
    expect(score.perRep[2].percent).toBe(0);
  });

  it("reports a substitution as 'heard X for Y'", () => {
    const { score } = finalScore("Fred fed Ted bread, and Ted fed Fred bread.", 1, "fred fed ted bed and ted fed fred bread");
    expect(score.misses).toEqual([{ target: "bread", heard: "bed", kind: "substituted", rep: 0 }]);
    expect(score.accuracyPercent).toBe(89);
  });

  it("gives half credit for a near miss", () => {
    const { score } = finalScore("A big black bug bit a big black bear.", 1, "a big black bog bit a big black bear");
    expect(score.misses[0]).toMatchObject({ target: "bug", heard: "bog", kind: "near" });
    expect(score.cleanWordPercent).toBe(89);
    expect(score.accuracyPercent).toBe(94);
  });

  it("reports skipped words and extra words", () => {
    const { score } = finalScore("Peter Piper picked a peck of pickled peppers.", 1, "peter piper picked a peck of really pickled peppers peppers");
    expect(score.extraWords).toBe(2);
    expect(score.accuracyPercent).toBe(100);

    const skipped = finalScore("Peter Piper picked a peck of pickled peppers.", 1, "peter piper a peck of pickled peppers").score;
    expect(skipped.misses).toEqual([{ target: "picked", heard: null, kind: "skipped", rep: 0 }]);
  });

  it("handles the One-one twister read with digits", () => {
    const text = "One-one was a race horse, two-two was one too. One-one won one race, two-two won one too.";
    const { score } = finalScore(text, 1, "11 was a race horse 2-2 was one too 1 1 won one race two two won 1 too");
    expect(score.accuracyPercent).toBe(100);
  });

  it("agrees with the live follower on a clean read", () => {
    const target = buildTarget("Red lorry, yellow lorry.", 2);
    const tokens = heard("red laurie yellow lorry red lorry yellow lorry");
    const live = followLive(target, tokens);
    const final = statusesFromAlignment(target, alignFinal(target, tokens));
    expect(live.statuses).toEqual(final);
  });

  it("summarizes misses per focus sound", () => {
    const { score } = finalScore("She sells seashells by the seashore.", 1, "she shells seashells by the seashore", ["s", "sh"]);
    const s = score.focusSounds.find((f) => f.sound === "s");
    // sells, seashells, seashore — "she" only has the "sh" sound.
    expect(s).toEqual({ sound: "s", total: 3, missed: 1 });
  });

  it("computes WPM from words spoken over speaking time", () => {
    const target = buildTarget("Toy boat.", 3);
    const tokens = heard("toy boat toy boat toy boat");
    const score = scoreAlignment(target, tokens, alignFinal(target, tokens), { speakingMs: 3000 });
    expect(score.wpm).toBe(120);
  });
});

describe("scoreManualAttempt", () => {
  it("uses the expanded word count", () => {
    expect(scoreManualAttempt("Toy boat.", 6, 3)).toBe(60);
  });
});

describe("every tongue twister in the app", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TONGUE_TWISTERS } = require("../../../data/tongueTwisters") as {
    TONGUE_TWISTERS: { id: string; text: string; repeatCount: number }[];
  };
  it.each(TONGUE_TWISTERS.map((t) => ({ id: t.id, twister: t })))("$id scores 100% when read perfectly", ({ twister }) => {
    const spoken = Array(twister.repeatCount).fill(twister.text).join(" ");
    const target = buildTarget(twister.text, twister.repeatCount);
    const tokens = heard(spoken);
    expect(followLive(target, tokens).statuses.every((s) => s === "hit")).toBe(true);
    const score = scoreAlignment(target, tokens, alignFinal(target, tokens), { speakingMs: 10000 });
    expect(score.accuracyPercent).toBe(100);
    expect(score.repsCompleted).toBe(twister.repeatCount);
  });
});
