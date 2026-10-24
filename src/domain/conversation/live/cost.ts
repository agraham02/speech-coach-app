// What a minute of live conversation costs Tono, from the server's prices and
// a model of a minute. Pure; the numbers in docs/decisions/conversation-voice.md
// come from here (and its test), so a price change is one edit.

export interface Rates {
  inputPerM: number;
  outputPerM: number;
}

export interface MinuteModel {
  // Partner lines a minute: a reply (about 8 s), the wait (about 2 s), the
  // partner's line (about 4 s).
  turnsPerMinute: number;
  // Seconds of partner speech a minute.
  partnerSpeechSeconds: number;
  // The partner prompt: fixed instructions, plus each line of history.
  promptBaseTokens: number;
  tokensPerHistoryItem: number;
  // History items the average turn carries (the conversation so far).
  averageHistoryItems: number;
  // The line and its JSON.
  outputTokens: number;
  // Text sent to the speech model per line.
  ttsInputTokens: number;
}

// Measured where possible: the prompt sizes from the server's builder (the
// cost test builds a real prompt), speech at 25 tokens a second (Google).
// The turn rhythm is an estimate; the Dev lab and the test plan measure it.
export const TYPICAL_MINUTE: MinuteModel = {
  turnsPerMinute: 4,
  partnerSpeechSeconds: 18,
  promptBaseTokens: 1000,
  tokensPerHistoryItem: 25,
  averageHistoryItems: 6,
  outputTokens: 60,
  ttsInputTokens: 40,
};

// A chatty minute: short replies, long partner lines.
export const HEAVY_MINUTE: MinuteModel = { ...TYPICAL_MINUTE, turnsPerMinute: 5, partnerSpeechSeconds: 30, averageHistoryItems: 10 };

const AUDIO_TOKENS_PER_SECOND = 25;

export function costPerMinuteUsd(m: MinuteModel, text: Rates, tts: Rates): { text: number; voice: number; total: number } {
  const promptTokens = m.promptBaseTokens + m.tokensPerHistoryItem * m.averageHistoryItems;
  const textCost = (m.turnsPerMinute * (promptTokens * text.inputPerM + m.outputTokens * text.outputPerM)) / 1e6;
  const voiceCost = (m.turnsPerMinute * m.ttsInputTokens * tts.inputPerM + m.partnerSpeechSeconds * AUDIO_TOKENS_PER_SECOND * tts.outputPerM) / 1e6;
  return { text: textCost, voice: voiceCost, total: textCost + voiceCost };
}
