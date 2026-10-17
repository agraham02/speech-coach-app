// The record kept by the ASR Lab of scored runs, so engines can be compared
// across several takes instead of one.

export interface AsrRunRecord {
  sessionId: string;
  engineId: string;
  at: string;
  audioSeconds: number;
  ms: number;
  words: number;
  // Word error rate against the typed reference, 0-1 (can exceed 1).
  wer: number;
  // Share of the reference fillers the engine kept; null if there were none.
  fillerRetention: number | null;
  fillers: number;
  // Fillers written where none was said (absent on older runs).
  inventedFillers?: number;
}

export const MAX_HISTORY = 400;

// Adds a run, replacing an earlier one for the same take and engine.
export function upsertRun(history: AsrRunRecord[], run: AsrRunRecord): AsrRunRecord[] {
  const kept = history.filter((r) => !(r.sessionId === run.sessionId && r.engineId === run.engineId));
  return [...kept, run].slice(-MAX_HISTORY);
}

export interface EngineSummary {
  engineId: string;
  takes: number;
  avgWer: number;
  avgFillerRetention: number | null;
  // Processing time divided by audio length: 0.5 = twice as fast as real time.
  // Null for a transcript that was not timed here (a stored deep review).
  avgRealtimeFactor: number | null;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function summarizeHistory(history: AsrRunRecord[]): EngineSummary[] {
  const byEngine = new Map<string, AsrRunRecord[]>();
  for (const run of history) byEngine.set(run.engineId, [...(byEngine.get(run.engineId) ?? []), run]);
  return [...byEngine.entries()]
    .map(([engineId, runs]) => {
      const retentions = runs.map((r) => r.fillerRetention).filter((v): v is number => v !== null);
      const factors = runs.filter((r) => r.audioSeconds > 0 && r.ms > 0).map((r) => r.ms / 1000 / r.audioSeconds);
      return {
        engineId,
        takes: runs.length,
        avgWer: mean(runs.map((r) => r.wer)),
        avgFillerRetention: retentions.length ? mean(retentions) : null,
        avgRealtimeFactor: factors.length ? mean(factors) : null,
      };
    })
    .sort((a, b) => a.avgWer - b.avgWer);
}

export function historyToCsv(history: AsrRunRecord[]): string {
  const header = "session,engine,at,audio_s,ms,words,wer,filler_retention,fillers,invented_fillers";
  const rows = history.map((r) =>
    [r.sessionId, r.engineId, r.at, r.audioSeconds.toFixed(1), r.ms, r.words, r.wer.toFixed(3), r.fillerRetention === null ? "" : r.fillerRetention.toFixed(2), r.fillers, r.inventedFillers ?? ""].join(","),
  );
  return [header, ...rows].join("\n");
}
