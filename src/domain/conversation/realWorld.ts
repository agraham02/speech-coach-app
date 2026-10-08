import { MISSIONS, type Mission } from "../../content/conversationContent";
import { hashString } from "../dailyPlan";

// The real-world side of the Conversation skill: today's missions and the
// "predicted vs actual" gap from Prime → Debrief. Pure.

// Two missions a day, the same all day, different from yesterday's.
export function missionsForDate(date: string, count = 2): Mission[] {
  const start = hashString(`missions:${date}`) % MISSIONS.length;
  const out: Mission[] = [];
  for (let i = 0; i < Math.min(count, MISSIONS.length); i++) out.push(MISSIONS[(start + i * 3) % MISSIONS.length]);
  return out;
}

export interface PredictionPair {
  predicted: number; // 0-10, how awkward you expected it to be
  actual: number; // 0-10, how awkward it was
}

export interface PredictionSummary {
  count: number;
  avgPredicted: number | null;
  avgActual: number | null;
  // predicted - actual, averaged: positive means it went better than feared.
  avgGap: number | null;
  // How often it went at least as well as expected.
  betterOrSameShare: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizePredictions(pairs: PredictionPair[]): PredictionSummary {
  if (pairs.length === 0) return { count: 0, avgPredicted: null, avgActual: null, avgGap: null, betterOrSameShare: null };
  const sum = (f: (p: PredictionPair) => number) => pairs.reduce((s, p) => s + f(p), 0);
  return {
    count: pairs.length,
    avgPredicted: round1(sum((p) => p.predicted) / pairs.length),
    avgActual: round1(sum((p) => p.actual) / pairs.length),
    avgGap: round1(sum((p) => p.predicted - p.actual) / pairs.length),
    betterOrSameShare: Math.round((pairs.filter((p) => p.actual <= p.predicted).length / pairs.length) * 100) / 100,
  };
}

// One kind sentence for the Progress card — never scolding when it went
// worse than feared.
export function predictionMessage(s: PredictionSummary): string {
  if (s.count === 0 || s.avgGap == null) return "Prime a conversation, then debrief it, to see how your predictions compare with what actually happens.";
  if (s.count < 3) return "A few more debriefs and a pattern will show up here.";
  if (s.avgGap >= 1) return `On average it went ${s.avgGap} points less awkward than you predicted. Your nerves forecast worse than reality.`;
  if (s.avgGap > -1) return "Your predictions are close to how it actually goes — the dread isn't adding much information.";
  return "Lately things have felt harder than you expected. That happens — keep debriefing; one rough stretch isn't the trend.";
}
