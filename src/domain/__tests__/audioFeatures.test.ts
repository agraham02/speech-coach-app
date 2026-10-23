import { BREATH, extractAudioFeatures, hysteresisGate, PAUSE, SPEECH } from "../dsp/audioFeatures";
import { pausesFromFeatures } from "../dsp/pauses";
import { bucketSeries, loudnessStatsOf, pitchStatsOf, voiceChartData } from "../signals/audioSummary";
import { FS, synthSpeech } from "./synthSpeech";

describe("voice activity", () => {
  it("opens over the floor and holds through a short dip (hangover)", () => {
    const levels = Float32Array.from([-70, -70, -40, -40, -66, -66, -40, -70, -70, -70, -70, -70, -70, -70, -70, -70, -70, -70]);
    const gate = Array.from(hysteresisGate(levels, -70));
    expect(gate.slice(0, 2)).toEqual([PAUSE, PAUSE]);
    // The two quiet frames inside speech stay speech.
    expect(gate.slice(2, 7)).toEqual([SPEECH, SPEECH, SPEECH, SPEECH, SPEECH]);
    expect(gate[gate.length - 1]).toBe(PAUSE);
  });

  it("finds every pause between phrases", () => {
    const { wave, truth } = synthSpeech({ phrases: 6, pauseMs: 700 });
    const p = pausesFromFeatures(extractAudioFeatures(wave, FS));
    expect(p.pauses).toHaveLength(truth.pauses.length);
    p.pauses.forEach((pause, i) => {
      expect(Math.abs(pause.startMs - truth.pauses[i][0])).toBeLessThan(150);
      expect(Math.abs(pause.endMs - truth.pauses[i][1])).toBeLessThan(150);
    });
  });

  it("keeps a breath inside its pause instead of splitting it, and counts it", () => {
    const { wave, truth } = synthSpeech({ phrases: 6, pauseMs: 1200, breaths: true });
    const f = extractAudioFeatures(wave, FS);
    const p = pausesFromFeatures(f);
    expect(p.pauses).toHaveLength(truth.pauses.length);
    expect(p.breaths).toBeGreaterThanOrEqual(truth.pauses.length - 1);
    expect(p.pauses.every((pause) => pause.durationMs >= 1000)).toBe(true);
    expect(Array.from(f.speech).filter((v) => v === BREATH).length).toBeGreaterThan(0);
  });
});

describe("loudness", () => {
  it("measures the voice, not the pausing: longer pauses leave it alone", () => {
    const normal = loudnessStatsOf(extractAudioFeatures(synthSpeech({ pauseMs: 600, seed: 4 }).wave, FS))!;
    const longPauses = loudnessStatsOf(extractAudioFeatures(synthSpeech({ pauseMs: 2400, seed: 4 }).wave, FS))!;
    expect(Math.abs(normal.spreadDb - longPauses.spreadDb)).toBeLessThan(1);
    expect(Math.abs((normal.syllablePeakSdDb ?? 0) - (longPauses.syllablePeakSdDb ?? 0))).toBeLessThan(0.5);
    expect(Math.abs(normal.speechMedianDbfs - longPauses.speechMedianDbfs)).toBeLessThan(1);
  });

  it("orders a flat delivery below a varied one by syllable-peak spread", () => {
    const flat = loudnessStatsOf(extractAudioFeatures(synthSpeech({ accentDb: 0.5, seed: 8 }).wave, FS))!;
    const varied = loudnessStatsOf(extractAudioFeatures(synthSpeech({ accentDb: 5, seed: 8 }).wave, FS))!;
    expect(flat.syllablePeakSdDb).not.toBeNull();
    expect(varied.syllablePeakSdDb!).toBeGreaterThan(flat.syllablePeakSdDb! + 1);
    expect(flat.snrDb).toBeGreaterThan(30);
  });

  it("finds about one peak a syllable", () => {
    const f = extractAudioFeatures(synthSpeech({ syllables: 6, phrases: 5 }).wave, FS);
    expect(f.peaks.length).toBeGreaterThan(20);
    expect(f.peaks.length).toBeLessThan(40);
  });
});

describe("series and chart data", () => {
  const f = extractAudioFeatures(synthSpeech({ phrases: 4, pauseMs: 900 }).wave, FS);

  it("derives the 200 ms series with gaps as null, never 0", () => {
    const s = bucketSeries(f);
    expect(s.pitchContourHz.length).toBe(Math.ceil(f.durationMs / 200));
    expect(s.pitchContourHz.some((v) => v === null)).toBe(true);
    expect(s.pitchContourHz.every((v) => v === null || v > 60)).toBe(true);
    expect(s.volumeEnvelopeDbfs.every((v) => v >= -60)).toBe(true);
  });

  it("fits the chart to a width, in semitones from the median, with pauses as gaps", () => {
    const chart = voiceChartData(f, 100);
    expect(chart.enoughVoice).toBe(true);
    expect(chart.tMs.length).toBeLessThanOrEqual(100);
    const voiced = chart.pitchSt.filter((v): v is number => v !== null);
    expect(Math.abs(voiced.sort((a, b) => a - b)[Math.floor(voiced.length / 2)])).toBeLessThan(1);
    expect(chart.pitchSt.filter((v) => v === null).length).toBeGreaterThan(5);
    expect(chart.levelDb.some((v) => v === null)).toBe(true);
  });

  it("says there's not enough voice instead of drawing a floor line", () => {
    const short = extractAudioFeatures(synthSpeech({ phrases: 1, syllables: 3 }).wave, FS);
    expect(voiceChartData(short).enoughVoice).toBe(false);
    expect(pitchStatsOf(short)!.voicedSeconds).toBeLessThan(1);
  });
});
