import { deriveSessionStatus, inferLegacySteps } from "../sessionSteps";

describe("deriveSessionStatus", () => {
  it("is processing while any step is pending or running", () => {
    expect(deriveSessionStatus([{ step: "transcribe", status: "done" }, { step: "cloud_review", status: "running" }])).toBe("processing");
  });
  it("is error only when the transcript failed", () => {
    expect(deriveSessionStatus([{ step: "transcribe", status: "failed" }])).toBe("error");
    expect(deriveSessionStatus([{ step: "transcribe", status: "done" }, { step: "cloud_review", status: "failed" }])).toBe("done");
  });
  it("treats an interrupted transcript as needing attention", () => {
    expect(deriveSessionStatus([{ step: "transcribe", status: "interrupted" }])).toBe("error");
  });
});

describe("inferLegacySteps", () => {
  const base = {
    hasTranscript: true,
    dspStatus: "complete",
    hasScores: false,
    wantsGrading: false,
  };
  const byStep = (rows: ReturnType<typeof inferLegacySteps>) => Object.fromEntries(rows.map((r) => [r.step, r.status]));

  it("maps a finished, ungraded session", () => {
    expect(byStep(inferLegacySteps({ ...base, status: "done" }))).toEqual({
      transcribe: "done",
      audio_metrics: "done",
      presence: "skipped",
      coach: "skipped",
      cloud_review: "skipped",
    });
  });

  it("marks a session stuck in processing as interrupted", () => {
    const rows = byStep(
      inferLegacySteps({ ...base, status: "processing", hasTranscript: false, dspStatus: null, wantsGrading: true }),
    );
    expect(rows.transcribe).toBe("interrupted");
    expect(rows.cloud_review).toBe("interrupted");
  });

  it("marks graded sessions done", () => {
    const rows = byStep(inferLegacySteps({ ...base, status: "done", hasScores: true }));
    expect(rows.cloud_review).toBe("done");
  });

  it("marks a failed grading attempt as failed", () => {
    const rows = inferLegacySteps({ ...base, status: "error", wantsGrading: true });
    expect(rows.find((r) => r.step === "cloud_review")).toMatchObject({ status: "failed" });
  });
});
