import { historyToCsv, MAX_HISTORY, summarizeHistory, upsertRun, type AsrRunRecord } from "../asrHistory";

const run = (extra: Partial<AsrRunRecord> = {}): AsrRunRecord => ({
  sessionId: "s1",
  engineId: "turbo",
  at: "2026-10-16T10:00:00.000Z",
  audioSeconds: 60,
  ms: 30000,
  words: 150,
  wer: 0.1,
  fillerRetention: 0.5,
  fillers: 4,
  ...extra,
});

describe("upsertRun", () => {
  it("replaces an earlier run for the same take and engine", () => {
    const history = upsertRun([run({ wer: 0.3 })], run({ wer: 0.1 }));
    expect(history).toHaveLength(1);
    expect(history[0].wer).toBe(0.1);
  });
  it("keeps runs for other takes and engines", () => {
    const history = upsertRun(upsertRun([], run()), run({ engineId: "crisper" }));
    expect(history).toHaveLength(2);
    expect(upsertRun(history, run({ sessionId: "s2" }))).toHaveLength(3);
  });
  it("caps the history, dropping the oldest", () => {
    let history: AsrRunRecord[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) history = upsertRun(history, run({ sessionId: "s" + i }));
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[0].sessionId).toBe("s5");
  });
});

describe("summarizeHistory", () => {
  it("averages per engine and sorts by error rate", () => {
    const summary = summarizeHistory([
      run({ sessionId: "a", engineId: "turbo", wer: 0.2, fillerRetention: 0.4 }),
      run({ sessionId: "b", engineId: "turbo", wer: 0.1, fillerRetention: 0.6 }),
      run({ sessionId: "a", engineId: "crisper", wer: 0.05, fillerRetention: 1 }),
    ]);
    expect(summary.map((s) => s.engineId)).toEqual(["crisper", "turbo"]);
    expect(summary[1].takes).toBe(2);
    expect(summary[1].avgWer).toBeCloseTo(0.15);
    expect(summary[1].avgFillerRetention).toBeCloseTo(0.5);
  });

  it("ignores takes with no fillers when averaging retention", () => {
    const summary = summarizeHistory([run({ sessionId: "a", fillerRetention: null }), run({ sessionId: "b", fillerRetention: 0.8 })]);
    expect(summary[0].avgFillerRetention).toBeCloseTo(0.8);
    expect(summarizeHistory([run({ fillerRetention: null })])[0].avgFillerRetention).toBeNull();
  });

  it("reports speed as processing time over audio length", () => {
    expect(summarizeHistory([run({ ms: 30000, audioSeconds: 60 })])[0].avgRealtimeFactor).toBeCloseTo(0.5);
    // A stored deep review was not timed here.
    expect(summarizeHistory([run({ engineId: "deep-review", ms: 0 })])[0].avgRealtimeFactor).toBeNull();
  });

  it("is empty for no history", () => {
    expect(summarizeHistory([])).toEqual([]);
  });
});

describe("historyToCsv", () => {
  it("writes a header and one row per run", () => {
    const lines = historyToCsv([run(), run({ sessionId: "s2", fillerRetention: null })]).split("\n");
    expect(lines[0]).toBe("session,engine,at,audio_s,ms,words,wer,filler_retention,fillers,invented_fillers");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("s1,turbo,2026-10-16T10:00:00.000Z,60.0,30000,150,0.100,0.50,4,");
    expect(lines[2].split(",")[7]).toBe("");
  });
});
