import { afterAnswer, EMPTY_FEEDBACK_STATE, shouldAskForFeedback, MAX_DISMISSALS } from "../feedbackPrompt";

const NOW = new Date("2026-11-01T12:00:00Z");
const enough = { reps: 6, days: 4 };

describe("shouldAskForFeedback", () => {
  it("waits for enough use on enough days", () => {
    expect(shouldAskForFeedback({ reps: 4, days: 4 }, EMPTY_FEEDBACK_STATE, NOW)).toBe(false);
    expect(shouldAskForFeedback({ reps: 9, days: 2 }, EMPTY_FEEDBACK_STATE, NOW)).toBe(false);
    expect(shouldAskForFeedback(enough, EMPTY_FEEDBACK_STATE, NOW)).toBe(true);
  });

  it("never asks again after an answer", () => {
    const answered = afterAnswer(EMPTY_FEEDBACK_STATE, "great", NOW);
    expect(shouldAskForFeedback(enough, answered, new Date("2027-06-01T12:00:00Z"))).toBe(false);
    expect(shouldAskForFeedback(enough, afterAnswer(EMPTY_FEEDBACK_STATE, "better", NOW), new Date("2027-06-01T12:00:00Z"))).toBe(false);
  });

  it("leaves a gap after Not now, then asks again", () => {
    const later = afterAnswer(EMPTY_FEEDBACK_STATE, "later", NOW);
    expect(later.dismissed).toBe(1);
    expect(shouldAskForFeedback(enough, later, new Date("2026-11-20T12:00:00Z"))).toBe(false);
    expect(shouldAskForFeedback(enough, later, new Date("2026-12-20T12:00:00Z"))).toBe(true);
  });

  it("stops after the third Not now", () => {
    let state = EMPTY_FEEDBACK_STATE;
    for (let i = 0; i < MAX_DISMISSALS; i++) state = afterAnswer(state, "later", NOW);
    expect(shouldAskForFeedback(enough, state, new Date("2030-01-01T12:00:00Z"))).toBe(false);
  });

  it("copes with a bad saved date", () => {
    expect(shouldAskForFeedback(enough, { answeredAt: null, lastShownAt: "garbage", dismissed: 1 }, NOW)).toBe(true);
  });
});
