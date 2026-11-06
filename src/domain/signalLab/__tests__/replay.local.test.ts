import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeFeatures } from "../../dev/voiceLab";
import { extractAudioFeatures } from "../../dsp/audioFeatures";
import { LAB_TESTS } from "../registry";
import type { StepMeasure, StepMeasures } from "../types";

// Runs Signal Lab's real tests on recordings from the phone, so a formula can be
// tuned without recording again. Needs the unpacked raw recordings (Signal Lab,
// Share raw recordings); without LAB_RAW_DIR it does nothing.
//   LAB_RAW_DIR=path/to/raw LAB_OUT=out.json npx jest replay.local
const DIR = process.env.LAB_RAW_DIR;

function readWav(path: string): { waveform: Float32Array; sampleRate: number } {
  const b = readFileSync(path);
  let at = 12;
  let sampleRate = 16000;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") sampleRate = b.readUInt32LE(at + 12);
    if (id === "data") {
      const n = Math.floor(Math.min(size, b.length - at - 8) / 2);
      const waveform = new Float32Array(n);
      for (let i = 0; i < n; i++) waveform[i] = b.readInt16LE(at + 8 + i * 2) / 32768;
      return { waveform, sampleRate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`No audio in ${path}`);
}

// Every recorded step, grouped by test, measured by the code as it is now.
function loadRecorded(dir: string): Record<string, StepMeasures> {
  const byTest: Record<string, StepMeasures> = {};
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
    const measure: StepMeasure = { stepId: raw.stepId, durationMs: raw.durationMs };
    if (raw.stopwatchMs != null) measure.stopwatchMs = raw.stopwatchMs;
    if (raw.faceWidth != null) measure.faceWidth = raw.faceWidth;
    if (raw.cues) measure.cues = raw.cues;
    if (raw.words) measure.words = raw.words;
    if (raw.engines) measure.engines = raw.engines;
    if (raw.face) {
      measure.face = raw.face;
      measure.faceCalibration = raw.faceCalibration;
    }
    let wav: { waveform: Float32Array; sampleRate: number } | null = null;
    try {
      wav = readWav(join(dir, name.replace(/\.json$/, ".wav")));
    } catch {
      // A face-only step has no audio.
    }
    if (wav) {
      const features = extractAudioFeatures(wav.waveform, wav.sampleRate);
      measure.audio = { features, summary: summarizeFeatures(features) };
    }
    (byTest[raw.testId] ??= {})[raw.stepId] = measure;
  }
  return byTest;
}

(DIR ? describe : describe.skip)("replaying recorded runs", () => {
  it("runs every recorded test", () => {
    const byTest = loadRecorded(DIR!);
    const out: Record<string, unknown> = {};
    for (const { def, evaluate } of LAB_TESTS) {
      if (!byTest[def.id]) continue;
      const o = evaluate(byTest[def.id]);
      out[def.id] = { pass: o.pass, summary: o.summary, checks: o.checks.map((c) => `${c.pass === null ? "." : c.pass ? "P" : "F"} ${c.label}: ${c.value}`), numbers: o.numbers };
    }
    if (process.env.LAB_OUT) writeFileSync(process.env.LAB_OUT, JSON.stringify(out, null, 1));
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });
});
