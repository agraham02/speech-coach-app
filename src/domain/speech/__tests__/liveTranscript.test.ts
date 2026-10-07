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
