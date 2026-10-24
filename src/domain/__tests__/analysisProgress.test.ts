import {
  AUTO_RESUME_WINDOW_MS,
  etaSentence,
  MAX_AUTO_ATTEMPTS,
  MAX_OFFLINE_RETRIES,
  offlineRetryDue,
  remainingSeconds,
  resumeDecision,
  stepSeconds,
  summarizeWork,
} from "../analysis/progress";
import { reviewLine, workHeadline, workReassurance } from "../analysis/workCopy";
import type { SessionStep, StepStatus } from "../sessionSteps";

type S = Record<SessionStep, StepStatus>;
const ALL: SessionStep[] = ["transcribe", "audio_metrics", "presence", "coach", "cloud_review"];

function steps(status: Partial<S>, errors: Partial<Record<SessionStep, string>> = {}) {
  const base: S = { transcribe: "pending", audio_metrics: "pending", presence: "pending", coach: "pending", cloud_review: "pending" };
  return ALL.map((step) => ({ step, status: { ...base, ...status }[step], lastError: errors[step] ?? null }));
}

describe("summarizeWork: the states of a take's analysis", () => {
  it("is idle with no steps, or with every step skipped", () => {
    expect(summarizeWork([]).phase).toBe("idle");
    expect(summarizeWork(steps({ transcribe: "skipped", audio_metrics: "skipped", presence: "skipped", coach: "skipped", cloud_review: "skipped" })).phase).toBe("idle");
  });

  it("is queued when steps wait and none has started", () => {
    const w = summarizeWork(steps({}));
    expect(w.phase).toBe("queued");
    expect(w.current).toBe("transcribe");
    expect(w.finished).toBe(0);
    expect(w.review).toBe("queued");
  });

  it("is running while a step runs, and counts the step as 'n of total'", () => {
    const w = summarizeWork(steps({ transcribe: "done", audio_metrics: "running" }));
    expect(w.phase).toBe("running");
    expect(w.current).toBe("audio_metrics");
    expect(w.position).toBe(2);
    expect(w.total).toBe(5);
    expect(w.finished).toBe(1);
    expect(workHeadline(w)).toBe("Step 2 of 5: Measuring pace, pauses and pitch");
  });

  it("leaves skipped steps out of the count (no face timeline, no review asked for)", () => {
    const w = summarizeWork(steps({ presence: "skipped", cloud_review: "skipped", transcribe: "done", audio_metrics: "running" }));
    expect(w.total).toBe(3);
    expect(w.position).toBe(2);
    expect(w.review).toBe("none");
  });

  it("is done when every counted step is done", () => {
    const w = summarizeWork(steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "done" }));
    expect(w.phase).toBe("done");
    expect(w.current).toBeNull();
    expect(w.review).toBe("done");
    expect(w.onDevice).toBe("done");
  });

  it("separates the phone's steps from the review", () => {
    const w = summarizeWork(steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "running" }));
    expect(w.phase).toBe("running");
    expect(w.onDevice).toBe("done");
    expect(w.review).toBe("running");
    expect(reviewLine(w)).toBe("Your AI coach is reviewing it.");
    expect(workReassurance(w)).toMatch(/numbers are in/i);
  });

  it("needs attention, with the sentence, when nothing runs and a step failed", () => {
    const w = summarizeWork(
      steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "failed" }, { cloud_review: "Tono AI had a temporary problem. Try again." }),
    );
    expect(w.phase).toBe("attention");
    expect(w.review).toBe("failed");
    expect(w.problems).toHaveLength(1);
    expect(reviewLine(w)).toBe("Tono AI had a temporary problem. Try again.");
    expect(workHeadline(w)).toBe("One part didn't finish");
  });

  it("a failed review that is only waiting for a connection says so and needs no button", () => {
    const failed = steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "failed" }, { cloud_review: "No connection." });
    const waiting = summarizeWork(failed, { status: "unavailable", reason: "offline" });
    expect(waiting.reviewWaitsForConnection).toBe(true);
    expect(reviewLine(waiting)).toMatch(/sends itself/);
    // The same failure for another reason is for the person to retry.
    expect(summarizeWork(failed, { status: "unavailable", reason: "quota" }).reviewWaitsForConnection).toBe(false);
    expect(summarizeWork(failed, null).reviewWaitsForConnection).toBe(false);
  });

  it("resumed after a relaunch: the cut-off step runs again and the ones behind it wait their turn", () => {
    // Killed during voice analysis: reconcile marked it interrupted, then the
    // pipeline starts the first interrupted step.
    const killed = summarizeWork(steps({ transcribe: "done", audio_metrics: "interrupted", presence: "interrupted", coach: "interrupted", cloud_review: "interrupted" }));
    expect(killed.phase).toBe("attention");
    expect(killed.current).toBe("audio_metrics");

    const resumed = summarizeWork(steps({ transcribe: "done", audio_metrics: "running", presence: "interrupted", coach: "interrupted", cloud_review: "interrupted" }));
    expect(resumed.phase).toBe("running");
    expect(resumed.current).toBe("audio_metrics");
    expect(resumed.finished).toBe(1);
  });

  it("an interrupted review is a problem for the person, not 'waiting for a connection'", () => {
    const w = summarizeWork(steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "interrupted" }), { status: "unavailable", reason: "offline" });
    expect(w.review).toBe("failed");
    expect(w.reviewWaitsForConnection).toBe(false);
  });

  it("two takes are two separate summaries (no shared state)", () => {
    const a = summarizeWork(steps({ transcribe: "running" }));
    const b = summarizeWork(steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "done" }));
    expect([a.phase, b.phase]).toEqual(["running", "done"]);
  });
});

describe("how long it takes", () => {
  const ctx = { takeSeconds: 60, reviewInput: "text" as const };

  it("the phone's steps together come to roughly a fifth to a third of the talk (the logged takes: 0.2 to 0.25)", () => {
    const w = summarizeWork(steps({ cloud_review: "skipped" }));
    const [lo, hi] = remainingSeconds(w, { ...ctx, takeSeconds: 55 });
    // The logged 55 s take took 11 s.
    expect(lo).toBeLessThanOrEqual(11);
    expect(hi).toBeGreaterThanOrEqual(11);
  });

  it("each of the three logged takes falls inside the range", () => {
    for (const [seconds, took] of [
      [41, 9],
      [55, 11],
      [89, 21],
    ] as const) {
      const [lo, hi] = remainingSeconds(summarizeWork(steps({ cloud_review: "skipped" })), { takeSeconds: seconds, reviewInput: null });
      expect(lo).toBeLessThanOrEqual(took);
      expect(hi).toBeGreaterThanOrEqual(took);
    }
  });

  it("only counts what is left", () => {
    const all = remainingSeconds(summarizeWork(steps({})), ctx)[1];
    const half = remainingSeconds(summarizeWork(steps({ transcribe: "done" })), ctx)[1];
    expect(half).toBeLessThan(all);
    expect(remainingSeconds(summarizeWork(steps({ transcribe: "done", audio_metrics: "done", presence: "done", coach: "done", cloud_review: "done" })), ctx)).toEqual([0, 0]);
  });

  it("a review that watches the video is far slower than one that reads the words", () => {
    expect(stepSeconds("cloud_review", { takeSeconds: 60, reviewInput: "video" })[0]).toBeGreaterThan(stepSeconds("cloud_review", ctx)[1]);
  });

  it("says a ceiling, not a countdown, and admits it when it runs long", () => {
    expect(etaSentence([2, 8], 3)).toBe("A few seconds.");
    expect(etaSentence([5, 30], 3)).toBe("Usually under half a minute.");
    expect(etaSentence([20, 60], 3)).toBe("Usually about a minute or less.");
    expect(etaSentence([45, 180], 3)).toBe("Usually 1 to 3 minutes.");
    expect(etaSentence([5, 30], 200)).toMatch(/longer than usual/);
  });
});

describe("after the app was closed", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");

  it("resumes a recent take whose steps have few attempts", () => {
    expect(resumeDecision([{ attempts: 1 }, { attempts: 0 }], now - 60_000, now)).toBe("resume");
  });

  it("leaves a take that is a day old, or whose steps already ran too often (a step that crashes the app can't loop)", () => {
    expect(resumeDecision([{ attempts: 1 }], now - AUTO_RESUME_WINDOW_MS - 1, now)).toBe("leave");
    expect(resumeDecision([{ attempts: MAX_AUTO_ATTEMPTS }], now - 60_000, now)).toBe("leave");
  });

  describe("a review that failed for lack of a connection", () => {
    const offline = { status: "unavailable" as const, reason: "offline" };
    const failed = { status: "failed" as const, attempts: 1 };

    it("is sent again, for a day, a few times", () => {
      expect(offlineRetryDue({ step: failed, review: offline, recordedAtMs: now - 3_600_000, nowMs: now })).toBe(true);
      expect(offlineRetryDue({ step: { status: "failed", attempts: MAX_OFFLINE_RETRIES }, review: offline, recordedAtMs: now - 3_600_000, nowMs: now })).toBe(false);
      expect(offlineRetryDue({ step: failed, review: offline, recordedAtMs: now - 25 * 3_600_000, nowMs: now })).toBe(false);
    });

    it("is not sent again for any other reason (a quota or a refusal is the person's to retry)", () => {
      expect(offlineRetryDue({ step: failed, review: { status: "unavailable", reason: "quota" }, recordedAtMs: now - 1000, nowMs: now })).toBe(false);
      expect(offlineRetryDue({ step: failed, review: { status: "unavailable", reason: "error" }, recordedAtMs: now - 1000, nowMs: now })).toBe(false);
      expect(offlineRetryDue({ step: failed, review: null, recordedAtMs: now - 1000, nowMs: now })).toBe(false);
    });

    it("only when the step is failed (not running, not done)", () => {
      expect(offlineRetryDue({ step: { status: "running", attempts: 1 }, review: offline, recordedAtMs: now - 1000, nowMs: now })).toBe(false);
      expect(offlineRetryDue({ step: { status: "done", attempts: 1 }, review: offline, recordedAtMs: now - 1000, nowMs: now })).toBe(false);
    });
  });
});
