import type { Safety } from "./turnMachine";

// Reading ai-converse's answer: newline-delimited JSON, arriving in pieces as
// the partner's line is written and spoken (supabase/functions/ai-converse).
// Pure: the bytes come from a streamed fetch, or all at once when the fetch
// can't stream; either way the same events come out.

export type ConverseEvent =
  | { type: "line"; line: string; mood: string; ended: boolean; safety: Safety; model?: string; promptVersion?: string }
  | { type: "audio"; pcm: string }
  | {
      type: "done";
      voice: { model: string; seconds: number; streamed: boolean } | null;
      noVoice: string | null;
      sampleRate: number;
      timing: { llmMs: number | null; ttsFirstAudioMs: number | null; ttsMs: number | null; totalMs: number };
      allowance: unknown;
    }
  | { type: "error"; code: string };

export class NdjsonReader {
  private buffer = "";

  push(text: string): unknown[] {
    this.buffer += text;
    const out: unknown[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) out.push(parse(line));
    }
    return out.filter((v) => v !== undefined);
  }

  end(): unknown[] {
    const line = this.buffer.trim();
    this.buffer = "";
    const v = line ? parse(line) : undefined;
    return v === undefined ? [] : [v];
  }
}

function parse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// One event, checked. Anything unexpected is dropped rather than trusted.
export function toConverseEvent(raw: unknown): ConverseEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "line": {
      if (typeof o.line !== "string" || !o.line.trim()) return null;
      const safety: Safety = o.safety === "redirect" || o.safety === "crisis" ? o.safety : "ok";
      return {
        type: "line",
        line: o.line.trim().slice(0, 400),
        mood: typeof o.mood === "string" ? o.mood : "warm",
        ended: o.ended === true || safety === "crisis",
        safety,
        ...(typeof o.model === "string" ? { model: o.model } : {}),
        ...(typeof o.promptVersion === "string" ? { promptVersion: o.promptVersion } : {}),
      };
    }
    case "audio":
      return typeof o.pcm === "string" && o.pcm.length > 0 ? { type: "audio", pcm: o.pcm } : null;
    case "done": {
      const voice = o.voice as { model?: unknown; seconds?: unknown; streamed?: unknown } | null | undefined;
      const timing = (o.timing ?? {}) as Record<string, unknown>;
      return {
        type: "done",
        voice: voice && typeof voice.model === "string" ? { model: voice.model, seconds: num(voice.seconds) ?? 0, streamed: voice.streamed === true } : null,
        noVoice: typeof o.noVoice === "string" ? o.noVoice : null,
        sampleRate: num(o.sampleRate) ?? 24_000,
        timing: { llmMs: num(timing.llmMs), ttsFirstAudioMs: num(timing.ttsFirstAudioMs), ttsMs: num(timing.ttsMs), totalMs: num(timing.totalMs) ?? 0 },
        allowance: o.allowance ?? null,
      };
    }
    case "error":
      return { type: "error", code: typeof o.code === "string" ? o.code : "error" };
    default:
      return null;
  }
}

// What the phone measured about one partner turn, for the Dev lab and the
// test plan: from the request leaving to the words, the first sound, the end.
export interface TurnLatency {
  // End of the person's reply (the endpoint) to the request leaving.
  sentAt: number;
  lineAt: number | null;
  firstAudioAt: number | null;
  doneAt: number | null;
  server: { llmMs: number | null; ttsFirstAudioMs: number | null; totalMs: number } | null;
}

export function latencySummary(l: TurnLatency): { toLineMs: number | null; toFirstAudioMs: number | null; totalMs: number | null } {
  return {
    toLineMs: l.lineAt != null ? l.lineAt - l.sentAt : null,
    toFirstAudioMs: l.firstAudioAt != null ? l.firstAudioAt - l.sentAt : null,
    totalMs: l.doneAt != null ? l.doneAt - l.sentAt : null,
  };
}

// The median and 90th percentile, for the lab's table.
export function percentiles(values: number[]): { median: number | null; p90: number | null; n: number } {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { median: null, p90: null, n: 0 };
  const at = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
  return { median: at(0.5), p90: at(0.9), n: v.length };
}
