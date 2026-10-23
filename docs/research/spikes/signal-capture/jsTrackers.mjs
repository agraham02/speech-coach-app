// Runs the JavaScript pitch trackers on one 16 kHz float32 file and prints
// JSON: per tracker, frame times, f0 (null = unvoiced) and the CPU time.
//
//   node --experimental-strip-types jsTrackers.mjs FILE.f32 PITCHFINDER_DIR
//
// PITCHFINDER_DIR is a node_modules folder holding pitchfinder@2.3.4 (kept
// outside the repo). "current" reproduces src/domain/audioAnalysis.ts exactly.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const { trackPitch } = await import(process.env.PITCH_TRACKER_MODULE || "../../../../src/domain/dsp/pitchTracker.ts");

const [, , file, pfDir] = process.argv;
const require = createRequire(path.join(pfDir, "noop.js"));
const Pitchfinder = require("pitchfinder");

const buf = readFileSync(file);
const waveform = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const sampleRate = 16000;
const durationS = waveform.length / sampleRate;

function rms(frame) {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / frame.length);
}

// Exact copy of analyzePitchVolume's pitch loop (200 ms buckets, one
// 2048-sample frame at each bucket centre, RMS gate 0.01, 65-600 Hz).
function current(threshold = 0.1) {
  const detect = Pitchfinder.YIN({ sampleRate, threshold });
  const FRAME_SIZE = 2048;
  const per = Math.round(0.2 * sampleRate);
  const t = [], f0 = [], vol = [];
  for (let start = 0; start < waveform.length; start += per) {
    const end = Math.min(start + per, waveform.length);
    const bucket = waveform.subarray(start, end);
    const r = rms(bucket);
    vol.push(Math.max(20 * Math.log10(Math.max(r, 1e-6)), -60));
    t.push(((start + end) / 2 / sampleRate) * 1000);
    if (r < 0.01) { f0.push(null); continue; }
    const center = Math.floor((start + end) / 2);
    const fs = Math.max(0, Math.min(center - FRAME_SIZE / 2, waveform.length - FRAME_SIZE));
    const frame = waveform.subarray(fs, fs + FRAME_SIZE);
    const p = frame.length >= FRAME_SIZE ? detect(frame) : null;
    f0.push(p && p >= 65 && p <= 600 ? p : null);
  }
  return { t, f0, vol };
}

// The same detector run every 10 ms: separates "too few frames" from "the
// detector rejects voiced frames".
function currentDense(threshold = 0.1) {
  const detect = Pitchfinder.YIN({ sampleRate, threshold });
  const FRAME_SIZE = 2048, hop = 160;
  const t = [], f0 = [];
  for (let start = 0; start + FRAME_SIZE <= waveform.length; start += hop) {
    const frame = waveform.subarray(start, start + FRAME_SIZE);
    // pitchfinder only reads the first 1024 samples; its centre is 512 in.
    t.push(((start + 512) / sampleRate) * 1000);
    if (rms(frame.subarray(0, 1024)) < 0.01) { f0.push(null); continue; }
    const p = detect(frame);
    f0.push(p && p >= 65 && p <= 600 ? p : null);
  }
  return { t, f0 };
}

function mpm() {
  const detect = Pitchfinder.Macleod({ sampleRate, bufferSize: 1024 });
  const hop = 160;
  const t = [], f0 = [];
  for (let start = 0; start + 1024 <= waveform.length; start += hop) {
    const frame = waveform.subarray(start, start + 1024);
    t.push(((start + 512) / sampleRate) * 1000);
    if (rms(frame) < 0.003) { f0.push(null); continue; }
    const r = detect(frame);
    f0.push(r && r.freq > 0 && r.probability >= 0.8 && r.freq >= 60 && r.freq <= 500 ? r.freq : null);
  }
  return { t, f0 };
}

function proposed() {
  const track = trackPitch(waveform, sampleRate, process.env.PITCH_OPTS ? JSON.parse(process.env.PITCH_OPTS) : {});
  return { t: track.frames.map((f) => f.tMs), f0: track.frames.map((f) => f.f0Hz), conf: track.frames.map((f) => f.confidence) };
}

const runners = {
  current: () => current(0.1),
  current_thr020: () => current(0.2),
  current_dense: () => currentDense(0.1),
  mpm,
  proposed_yin: proposed,
};

const only = process.env.TRACKERS ? process.env.TRACKERS.split(",") : Object.keys(runners);
const out = { durationS, trackers: {} };
for (const name of only) {
  const t0 = process.cpuUsage();
  const w0 = performance.now();
  const res = runners[name]();
  const cpu = process.cpuUsage(t0);
  out.trackers[name] = { ...res, cpuMs: (cpu.user + cpu.system) / 1000, wallMs: performance.now() - w0 };
}
process.stdout.write(JSON.stringify(out));
