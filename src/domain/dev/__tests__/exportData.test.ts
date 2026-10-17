import type { Session } from "../../sessionTypes";
import { buildAsrExport, buildTakeExport } from "../exportData";
import { formatJson } from "../formatJson";

const context = { exportedAt: "2026-10-16T12:00:00.000Z", app: { version: "1.0.0", build: "Dev", os: "iOS 26.0" } };

describe("formatJson", () => {
  const sample = {
    name: "x",
    nums: [1, 2.5, null],
    words: [
      ["um", 0, 200],
      ["so", 250, 400],
    ],
    nested: { list: [{ a: 1 }, { b: [1, 2] }], empty: [], none: {} },
    skipped: undefined,
  };

  it("round-trips to the same data", () => {
    expect(JSON.parse(formatJson(sample))).toEqual(JSON.parse(JSON.stringify(sample)));
  });

  it("keeps number runs on one line and rows one per line", () => {
    const text = formatJson(sample);
    expect(text).toContain('"nums": [1, 2.5, null]');
    expect(text).toContain('["um", 0, 200],\n');
    expect(text).not.toContain("skipped");
  });

  it("handles primitives and empties", () => {
    expect(formatJson(5)).toBe("5");
    expect(formatJson("a\nb")).toBe('"a\\nb"');
    expect(formatJson([])).toBe("[]");
    expect(formatJson({})).toBe("{}");
  });
});

describe("buildTakeExport", () => {
  const session = {
    id: "s1",
    recordedAt: "2026-10-16T10:00:00.000Z",
    sessionType: "free_record",
    durationSeconds: 60,
    status: "done",
    wantsGrading: false,
    videoDeletedAt: null,
    sessionScore: 9,
    transcriptionSource: "whisper_ondevice",
    transcriptVerbatim: "so I was going",
    transcriptClean: "So I was going",
    transcriptWords: [
      { text: "so", startMs: 0, endMs: 200 },
      { text: "I", startMs: 250, endMs: 300 },
    ],
    wpmCurve: [{ bucketStartSeconds: 0, wpm: 120 }],
    fillerWordCount: 0,
    fillerRatePerMinute: 0,
    repeatedWordCount: 1,
    dspStatus: "complete",
    pitchAvgHz: 180,
    pitchMinHz: 100,
    pitchMaxHz: 260,
    volumeAvgDbfs: -30,
    volumeStddevDbfs: 5,
    pitchContourHz: [180.4, null, 200.6],
    volumeEnvelopeDbfs: [-30.123, -25.55],
  } as unknown as Session;

  const out = buildTakeExport({
    context,
    session,
    steps: [{ sessionId: "s1", step: "transcribe", status: "done", attempts: 1, lastError: null, updatedAt: "t" }],
    scores: null,
    artifacts: { pauses: { hesitations: 0 } },
    presenceSamples: 300,
  });

  it("identifies the export and the take", () => {
    expect(out.kind).toBe("tono-take-export");
    expect(out.take).toMatchObject({ id: "s1", type: "free_record", sessionScore: 9 });
  });

  it("carries the transcript with word timings and a count", () => {
    expect(out.transcript.wordCount).toBe(4);
    expect(out.transcript.timedWords).toEqual([
      ["so", 0, 200],
      ["I", 250, 300],
    ]);
  });

  it("rounds the voice curves and notes the omitted face timeline", () => {
    expect(out.voice.pitchContourHz).toEqual([180, null, 201]);
    expect(out.voice.volumeEnvelopeDbfs).toEqual([-30.1, -25.6]);
    expect(out.presenceTimeline).toEqual({ omitted: true, samples: 300 });
  });

  it("includes stored results and steps, nulls for the rest", () => {
    expect(out.pauses).toEqual({ hesitations: 0 });
    expect(out.coach).toBeNull();
    expect(out.steps[0]).toMatchObject({ step: "transcribe", status: "done" });
  });
});

describe("buildAsrExport", () => {
  const reference = "So um I think uh we can go";
  const base = {
    context,
    take: { sessionId: "s1", recordedAt: "2026-10-16T10:00:00.000Z", audioSeconds: 60 },
    reference,
    history: [],
    models: [{ id: "turbo-q5", label: "Turbo", bytes: 574000000, license: "MIT", downloaded: true }],
  };

  it("scores each engine against the reference", () => {
    const out = buildAsrExport({
      ...base,
      runs: [
        { id: "turbo", label: "Turbo", status: "done", text: "So I think we can go", ms: 30000 },
        { id: "crisper", label: "Crisper", status: "done", text: "So um I think uh we can go", ms: 45000, words: [{ text: "So", startMs: 0, endMs: 100 }] },
      ],
    });
    expect(out.reference).toEqual({ text: reference, wordCount: 8, fillerCount: 2 });
    const [turbo, crisper] = out.results;
    expect(turbo).toMatchObject({ fillerCount: 0, fillerRetention: 0, realtimeFactor: 0.5 });
    expect(turbo.wer).toBeCloseTo(2 / 8, 3);
    expect(crisper).toMatchObject({ fillerCount: 2, fillerRetention: 1, wer: 0 });
    expect(crisper.timedWords).toEqual([["So", 0, 100]]);
  });

  it("handles errors, running engines and a missing reference", () => {
    const out = buildAsrExport({
      ...base,
      reference: "  ",
      runs: [
        { id: "a", label: "A", status: "error", error: "boom" },
        { id: "b", label: "B", status: "running" },
        { id: "c", label: "C", status: "done", text: "hello there", ms: 1000 },
      ],
    });
    expect(out.reference.text).toBeNull();
    expect(out.results[0]).toMatchObject({ error: "boom", text: null, wer: null });
    expect(out.results[1]).toMatchObject({ status: "running", wordCount: null });
    expect(out.results[2]).toMatchObject({ wordCount: 2, wer: null, fillerRetention: null });
  });

  it("flags garbage and invented fillers, and scores a stored deep review", () => {
    const out = buildAsrExport({
      ...base,
      runs: [{ id: "turbo-prompted", label: "Prompted", status: "done", text: "Um, I mean, yeah. Um, I mean, yeah. Um, I mean, yeah.", ms: 24000, words: [{ text: "yeah.", startMs: 108000, endMs: 119900 }] }],
      deepReview: { provider: "gemini", model: "gemini-flash-latest", heardAudio: true, text: "So um I think uh we can go" },
    });
    const [prompted] = out.results;
    expect(prompted.inventedFillers).toBeGreaterThan(0);
    expect(prompted.problems).toEqual(["words run to 119.9 s of 60.0 s of audio", expect.stringContaining("repeats"), "12 words in 60 s"]);
    expect(out.deepReviewTranscript).toMatchObject({ model: "gemini-flash-latest", heardAudio: true, fillerCount: 2, wer: 0, fillerRetention: 1, inventedFillers: 0 });
  });

  it("works with no take selected", () => {
    const out = buildAsrExport({ ...base, take: null, runs: [] });
    expect(out.take).toBeNull();
    expect(out.results).toEqual([]);
  });
});
