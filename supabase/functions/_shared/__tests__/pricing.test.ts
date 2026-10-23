import { costUsd, estimateCostUsd, estimateTextTokens, estimateVideoInputTokens, tokensFromGeminiUsage } from "../pricing";

const LITE = { inputPerM: 0.3, outputPerM: 2.5 };
const AUDIO_DEARER = { inputPerM: 0.25, audioPerM: 0.5, outputPerM: 1.5 };

describe("costUsd", () => {
  it("prices a 3 minute take on Flash-Lite at about 1.4 cents", () => {
    // 180 s: 70 video + 32 audio tokens a second, 3k prompt, 3k answer.
    const cost = costUsd({ inputText: 3000, inputVideo: 12_600, inputAudio: 5760, output: 3000, thinking: 0 }, LITE);
    expect(cost).toBeCloseTo(0.0139, 4);
  });

  it("bills thinking tokens as output", () => {
    const without = costUsd({ inputText: 0, inputVideo: 0, inputAudio: 0, output: 1000, thinking: 0 }, LITE);
    const withThinking = costUsd({ inputText: 0, inputVideo: 0, inputAudio: 0, output: 1000, thinking: 1000 }, LITE);
    expect(withThinking).toBeCloseTo(without * 2, 8);
  });

  it("uses the audio rate when a model has one", () => {
    const audio = costUsd({ inputText: 0, inputVideo: 0, inputAudio: 1_000_000, output: 0, thinking: 0 }, AUDIO_DEARER);
    const text = costUsd({ inputText: 1_000_000, inputVideo: 0, inputAudio: 0, output: 0, thinking: 0 }, AUDIO_DEARER);
    expect(audio).toBeCloseTo(0.5, 8);
    expect(text).toBeCloseTo(0.25, 8);
  });
});

describe("estimateCostUsd", () => {
  it("is at least the real cost of a full-length answer", () => {
    const est = estimateCostUsd({ inputTokens: 18_360 + 3000, maxOutputTokens: 6000, price: AUDIO_DEARER });
    const real = costUsd({ inputText: 3000, inputVideo: 12_600, inputAudio: 5760, output: 6000, thinking: 0 }, AUDIO_DEARER);
    expect(est).toBeGreaterThanOrEqual(real);
  });
});

describe("token estimates", () => {
  it("estimates video input from seconds and sampling rate", () => {
    expect(estimateVideoInputTokens(180)).toBe(18_360);
    expect(estimateVideoInputTokens(180, 0.5)).toBe(180 * (35 + 32));
  });

  it("rounds text up", () => {
    expect(estimateTextTokens(10)).toBe(4);
    expect(estimateTextTokens(0)).toBe(0);
  });
});

describe("tokensFromGeminiUsage", () => {
  it("splits input by modality and keeps thinking apart", () => {
    expect(
      tokensFromGeminiUsage({
        promptTokenCount: 17_700,
        candidatesTokenCount: 1100,
        thoughtsTokenCount: 800,
        promptTokensDetails: [
          { modality: "VIDEO", tokenCount: 15_800 },
          { modality: "AUDIO", tokenCount: 1900 },
          { modality: "TEXT", tokenCount: 0 },
        ],
      }),
    ).toEqual({ inputText: 0, inputVideo: 15_800, inputAudio: 1900, output: 1100, thinking: 800 });
  });

  it("treats everything as text without a breakdown", () => {
    expect(tokensFromGeminiUsage({ promptTokenCount: 900, candidatesTokenCount: 700 })).toEqual({
      inputText: 900,
      inputVideo: 0,
      inputAudio: 0,
      output: 700,
      thinking: 0,
    });
  });

  it("is null when there is nothing usable", () => {
    expect(tokensFromGeminiUsage(undefined)).toBeNull();
    expect(tokensFromGeminiUsage({})).toBeNull();
  });
});
