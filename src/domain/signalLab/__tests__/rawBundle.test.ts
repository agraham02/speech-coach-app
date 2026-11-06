import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rawFileName, rawStepRecord, tarEnd, tarHeader, tarPadding } from "../rawBundle";

describe("a step's raw record", () => {
  it("keeps the tracks and rounds them", () => {
    const features = {
      version: "x",
      sampleRate: 16000,
      durationMs: 30,
      hopMs: 10,
      offsetMs: 5,
      noiseFloorDb: -60,
      f0Hz: Float32Array.from([0, 101.26, 99.91]),
      confidence: Float32Array.from([0, 0.912, 0.8]),
      levelDb: Float32Array.from([-60.04, -30.26, -31]),
      speech: Uint8Array.from([0, 1, 1]),
      peaks: Int32Array.from([1]),
    };
    const record = rawStepRecord("voice.pace", "pace.read", { stepId: "pace.read", durationMs: 30, audio: { features, summary: {} as never }, stopwatchMs: 25 }, "2026-11-06T00:00:00Z");
    expect(record.features?.f0Hz).toEqual([0, 101.3, 99.9]);
    expect(record.features?.speech).toBe("011");
    expect(record.stopwatchMs).toBe(25);
    expect(JSON.parse(JSON.stringify(record)).features.peaks).toEqual([1]);
  });

  it("works for a face-only step, rounding the samples", () => {
    const face = [{ tMs: 1000, present: true, yaw: 1.23456, pitch: 0, smile: 0.123456, eyesOpen: 1, framed: true, bs: [0.123456] }];
    const record = rawStepRecord("presence.looking", "lens", { stepId: "lens", durationMs: 1000, face }, "t");
    expect(record.features).toBeNull();
    expect(record.face).toEqual([{ tMs: 1000, present: true, yaw: 1.235, pitch: 0, smile: 0.123, eyesOpen: 1, framed: true, bs: [0.123] }]);
  });
});

describe("the tar file", () => {
  it("names files safely", () => {
    expect(rawFileName("voice.pitch_variety", "pitch_variety.flat", "wav")).toBe("voice-pitch_variety__pitch_variety-flat.wav");
  });

  it("pads to a block", () => {
    expect(tarPadding(512)).toHaveLength(0);
    expect(tarPadding(1)).toHaveLength(511);
    expect(tarEnd()).toHaveLength(1024);
  });

  it("refuses a name a tar header can't hold", () => {
    expect(() => tarHeader("x".repeat(101), 1)).toThrow(/too long/);
  });

  it("is read back by a real tar tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "tono-tar-"));
    try {
      const one = Buffer.from("hello tar");
      const two = Buffer.alloc(1500, 7);
      const out = Buffer.concat([tarHeader("one.json", one.length, 1700000000), one, tarPadding(one.length), tarHeader("two.wav", two.length, 1700000000), two, tarPadding(two.length), tarEnd()]);
      writeFileSync(join(dir, "b.tar"), out);
      expect(execFileSync("tar", ["-tf", "b.tar"], { cwd: dir, encoding: "utf8" }).trim().split(/\r?\n/)).toEqual(["one.json", "two.wav"]);
      execFileSync("tar", ["-xf", "b.tar"], { cwd: dir });
      expect(readFileSync(join(dir, "one.json"), "utf8")).toBe("hello tar");
      expect(readFileSync(join(dir, "two.wav")).equals(two)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
