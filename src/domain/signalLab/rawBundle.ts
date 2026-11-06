import type { StepMeasure } from "./types";

// The raw data behind a Signal Lab run, for tuning on a computer without
// recording everything again: a step's tracks as JSON, packed with its audio
// into one uncompressed tar file. Pure.

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

// Round every number in a face sample: tracker values don't mean anything past
// three places, and the file is several minutes of them.
function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return round(value, 3);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v)]));
  return value;
}

export function rawStepRecord(testId: string, stepId: string, measure: StepMeasure, at: string) {
  const f = measure.audio?.features;
  return {
    testId,
    stepId,
    at,
    durationMs: measure.durationMs,
    stopwatchMs: measure.stopwatchMs ?? null,
    faceWidth: measure.faceWidth ?? null,
    cues: measure.cues ?? null,
    words: measure.words ?? null,
    engines: measure.engines ?? null,
    faceCalibration: measure.faceCalibration ?? null,
    summary: measure.audio?.summary ?? null,
    features: f
      ? {
          version: f.version,
          sampleRate: f.sampleRate,
          durationMs: f.durationMs,
          hopMs: f.hopMs,
          offsetMs: f.offsetMs,
          noiseFloorDb: f.noiseFloorDb,
          f0Hz: Array.from(f.f0Hz, (v) => round(v, 1)),
          confidence: Array.from(f.confidence, (v) => round(v, 2)),
          levelDb: Array.from(f.levelDb, (v) => round(v, 1)),
          speech: Array.from(f.speech).join(""),
          peaks: Array.from(f.peaks),
        }
      : null,
    face: measure.face ? roundDeep(measure.face) : null,
  };
}

// "voice.pitch_variety" and "pitch_variety.flat" as a name every system takes.
export function rawFileName(testId: string, stepId: string, extension: "json" | "wav"): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${safe(testId)}__${safe(stepId)}.${extension}`;
}

const BLOCK = 512;

function ascii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) target[offset + i] = text.charCodeAt(i) & 0x7f;
}

const octal = (value: number, width: number) => value.toString(8).padStart(width - 1, "0");

// One file's 512-byte tar header (the ustar format every tar tool reads).
export function tarHeader(name: string, size: number, modifiedSeconds = 0): Uint8Array {
  if (name.length > 100) throw new Error(`The name ${name} is too long for a tar file.`);
  const h = new Uint8Array(BLOCK);
  ascii(h, 0, name);
  ascii(h, 100, octal(0o644, 8));
  ascii(h, 108, octal(0, 8));
  ascii(h, 116, octal(0, 8));
  ascii(h, 124, octal(size, 12));
  ascii(h, 136, octal(modifiedSeconds, 12));
  // The checksum is summed with its own field as spaces.
  ascii(h, 148, "        ");
  h[156] = "0".charCodeAt(0);
  ascii(h, 257, "ustar");
  ascii(h, 263, "00");
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i];
  ascii(h, 148, `${octal(sum, 7)}\0 `);
  return h;
}

// Zero bytes after a file, up to the next block.
export function tarPadding(size: number): Uint8Array {
  return new Uint8Array((BLOCK - (size % BLOCK)) % BLOCK);
}

// Two empty blocks end a tar file.
export function tarEnd(): Uint8Array {
  return new Uint8Array(BLOCK * 2);
}
