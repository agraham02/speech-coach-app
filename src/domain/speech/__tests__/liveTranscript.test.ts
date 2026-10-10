import { beginTask, EMPTY_TRANSCRIPT, finalizePartial, fullText, reduceResult, type LiveTranscript } from "../liveTranscript";

function feed(events: [boolean, string][], start: LiveTranscript = EMPTY_TRANSCRIPT): LiveTranscript {
  return events.reduce((state, [isFinal, transcript], i) => reduceResult(state, { isFinal, transcript }, i * 100), start);
}

describe("liveTranscript", () => {
  it("appends segmented finals instead of replacing them", () => {
    const state = feed([
      [false, "she"],
      [false, "she sells"],
      [true, "she sells seashells"],
      [false, "by"],
      [true, "by the seashore"],
    ]);
    expect(fullText(state)).toBe("she sells seashells by the seashore");
    expect(state.partial).toBe("");
  });

  it("keeps a genuine identical repetition", () => {
    const state = feed([
      [false, "toy boat"],
      [true, "toy boat"],
      [false, "toy"],
      [false, "toy boat"],
      [true, "toy boat"],
    ]);
    expect(fullText(state)).toBe("toy boat toy boat");
  });

  it("drops a duplicated final with no partial in between", () => {
    const state = feed([
      [false, "toy boat"],
      [true, "toy boat"],
      [true, "toy boat"],
    ]);
    expect(fullText(state)).toBe("toy boat");
  });

  it("drops a closing final that repeats every segment of the task", () => {
    const state = feed([
      [false, "she sells"],
      [true, "she sells seashells by the seashore"],
      [false, "she"],
      [true, "She sells sea shells by the seashore"],
      [true, "she sells seashells by the seashore She sells sea shells by the seashore"],
    ]);
    expect(fullText(state)).toBe("she sells seashells by the seashore She sells sea shells by the seashore");
  });

  it("drops a late partial that re-reports the last segment", () => {
    let state = feed([
      [false, "she sells"],
      [true, "she sells seashells by the seashore"],
      [false, "she sells seashells by the seashore"],
    ]);
    expect(fullText(state)).toBe("she sells seashells by the seashore");
    expect(fullText(finalizePartial(state, 1000))).toBe("she sells seashells by the seashore");
    // A genuine rep afterwards still counts.
    state = feed([[false, "she"], [false, "she sells seashells by the seashore"], [true, "she sells seashells by the seashore"]], state);
    expect(fullText(state)).toBe("she sells seashells by the seashore she sells seashells by the seashore");
  });

  it("strips committed text from cumulative partials of the next utterance", () => {
    const state = feed([
      [false, "peter piper"],
      [true, "peter piper picked a peck"],
      [false, "peter piper picked a peck of"],
      [false, "peter piper picked a peck of pickled peppers"],
    ]);
    expect(fullText(state)).toBe("peter piper picked a peck of pickled peppers");
  });

  it("keeps two reps said in one breath after a pause", () => {
    const state = feed([
      [false, "red lorry"],
      [true, "red lorry yellow lorry"],
      [false, "red"],
      [false, "red lorry yellow lorry red"],
      [true, "red lorry yellow lorry red lorry yellow lorry"],
    ]);
    expect(fullText(state)).toBe("red lorry yellow lorry red lorry yellow lorry red lorry yellow lorry");
  });

  it("shows committed text plus the live partial", () => {
    const state = feed([
      [true, "red lorry"],
      [false, "yellow"],
    ]);
    expect(fullText(state)).toBe("red lorry yellow");
  });

  it("promotes a dangling partial on finalize and on a new task", () => {
    const state = feed([[false, "fred fed"]]);
    expect(fullText(finalizePartial(state, 500))).toBe("fred fed");
    const next = beginTask(state, 500);
    expect(next.taskId).toBe(1);
    expect(next.committed.map((u) => u.text)).toEqual(["fred fed"]);
  });

  it("records first and last result times", () => {
    const state = feed([
      [false, ""],
      [false, "a"],
      [true, "a big"],
    ]);
    expect(state.firstResultAtMs).toBe(100);
    expect(state.lastResultAtMs).toBe(200);
  });
});
