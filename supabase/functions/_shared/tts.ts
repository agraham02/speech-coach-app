// Gemini text-to-speech through the Interactions API: the request body, and
// reading what comes back. Pure (no Deno or network), so jest tests it; the
// call itself is in gemini.ts.
//
// From the docs (ai.google.dev/gemini-api/docs/speech-generation, read
// 2026-10-24): POST /v1beta/interactions with the line as a user_input text
// item, the delivery as a speech_metadata annotation's `style`, the voice in
// generation_config.speech_config, and response_format audio. A unary answer
// is a WAV (RIFF header, 24 kHz mono 16-bit) at steps[].content[].data; a
// streamed one (stream: true) is server-sent events whose `step.delta` events
// carry headerless 16-bit PCM in delta.data. The raw event JSON isn't shown
// in the docs, so the readers below look in every place the docs name and
// ignore anything else; the device test plan (K) checks it on the real API.

export interface TtsRequest {
  model: string;
  text: string;
  voice: string;
  // How it's said ("warm and relaxed").
  style?: string;
  stream: boolean;
}

export function ttsBody(r: TtsRequest): Record<string, unknown> {
  return {
    model: r.model,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: r.text,
            ...(r.style ? { annotations: [{ type: "speech_metadata", style: r.style }] } : {}),
          },
        ],
      },
    ],
    // Raw PCM both ways, so a streamed and a unary answer read the same.
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: r.voice }] },
    ...(r.stream ? { stream: true } : {}),
  };
}

// ---- base64 without Buffer (Deno and jest both have atob/btoa) ----

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

// ---- reading the answer ----

// The PCM inside a WAV, or the bytes as they are when there's no RIFF header
// (audio/l16 is headerless). Walks the chunks to find "data".
export function pcmFromAudio(bytes: Uint8Array): Uint8Array {
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return bytes;
  let o = 12;
  while (o + 8 <= bytes.length) {
    const size = bytes[o + 4] | (bytes[o + 5] << 8) | (bytes[o + 6] << 16) | (bytes[o + 7] << 24);
    if (tag(o) === "data") return bytes.subarray(o + 8, Math.min(bytes.length, o + 8 + size));
    o += 8 + size + (size % 2);
  }
  return new Uint8Array(0);
}

interface AudioItem {
  type?: string;
  data?: unknown;
  mime_type?: string;
}

function isAudio(item: AudioItem | null | undefined): item is AudioItem & { data: string } {
  return !!item && typeof item.data === "string" && (item.type === "audio" || (typeof item.mime_type === "string" && item.mime_type.startsWith("audio/")));
}

// Every base64 audio piece in one JSON object from the API: a streamed
// event's delta, or a whole interaction's steps (unary, or a final event).
export function audioPiecesIn(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const o = json as { event_type?: string; delta?: AudioItem; steps?: { type?: string; content?: AudioItem[] }[]; interaction?: unknown };
  const pieces: string[] = [];
  if (isAudio(o.delta)) pieces.push(o.delta.data);
  for (const step of o.steps ?? []) {
    if (step?.type && step.type !== "model_output") continue;
    for (const item of step?.content ?? []) if (isAudio(item)) pieces.push(item.data);
  }
  if (o.interaction && o.interaction !== json) pieces.push(...audioPiecesIn(o.interaction));
  return pieces;
}

// Usage, if the API reports it: { input tokens, output tokens }.
export function ttsUsageIn(json: unknown): { inputTokens: number; outputTokens: number } | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { usage?: Record<string, unknown>; interaction?: { usage?: Record<string, unknown> } };
  const u = o.usage ?? o.interaction?.usage;
  if (!u) return null;
  const num = (...keys: string[]) => {
    for (const k of keys) if (typeof u[k] === "number") return u[k] as number;
    return null;
  };
  const input = num("total_input_tokens", "input_tokens", "promptTokenCount");
  const output = num("total_output_tokens", "output_tokens", "candidatesTokenCount");
  return input == null && output == null ? null : { inputTokens: input ?? 0, outputTokens: output ?? 0 };
}

// Server-sent events, fed in pieces as they arrive: hands back each event's
// parsed JSON. Lines are "data: {...}"; an event ends at a blank line. A data
// line that isn't JSON (a "[DONE]" marker) is skipped.
export class SseReader {
  private buffer = "";
  private data: string[] = [];

  push(text: string): unknown[] {
    this.buffer += text;
    const out: unknown[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      if (line === "") {
        this.flushInto(out);
      } else if (line.startsWith("data:")) {
        this.data.push(line.slice(5).replace(/^ /, ""));
      }
    }
    return out;
  }

  end(): unknown[] {
    const out: unknown[] = [];
    if (this.buffer.startsWith("data:")) this.data.push(this.buffer.slice(5).replace(/^ /, ""));
    this.buffer = "";
    this.flushInto(out);
    return out;
  }

  private flushInto(out: unknown[]) {
    if (!this.data.length) return;
    const text = this.data.join("\n");
    this.data = [];
    try {
      out.push(JSON.parse(text));
    } catch {
      // not JSON: ignore
    }
  }
}

// PCM pieces regrouped into chunks of about `targetBytes`, always on a
// whole-sample (2-byte) boundary, so the phone gets a steady stream of
// playable buffers whatever size the API sends.
export class PcmChunker {
  private pending: Uint8Array[] = [];
  private size = 0;

  constructor(private readonly targetBytes: number) {}

  push(bytes: Uint8Array): Uint8Array[] {
    this.pending.push(bytes);
    this.size += bytes.length;
    const out: Uint8Array[] = [];
    while (this.size >= this.targetBytes) out.push(this.take(this.targetBytes));
    return out;
  }

  // What's left, trimmed to whole samples.
  end(): Uint8Array | null {
    const n = this.size - (this.size % 2);
    if (n <= 0) return null;
    return this.take(n);
  }

  private take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      const head = this.pending[0];
      const want = n - filled;
      if (head.length <= want) {
        out.set(head, filled);
        filled += head.length;
        this.pending.shift();
      } else {
        out.set(head.subarray(0, want), filled);
        this.pending[0] = head.subarray(want);
        filled += want;
      }
    }
    this.size -= n;
    return out;
  }
}
