import { tokenizeScript } from "./scriptTypes";

export interface DrillScoreResult {
  accuracyPercent: number;
  wpm: number;
  matchedWordCount: number;
  targetWordCount: number;
}

// Strips punctuation and lowercases for comparison — STT output and the
// target twister's own punctuation are never going to agree exactly, and
// that's not a meaningful signal here (unlike AnnotatedTranscript's
// word-for-word category highlighting, which needs the original text intact).
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "");
}

// Sequential pointer-advance match, not full alignment (e.g. Levenshtein/DP
// edit distance) — deliberately simple. STT output on rapid alliterative
// speech is noisy enough (dropped words, misheard homophones) that a precise
// alignment algorithm would just be confidently wrong about which word
// matched which; this optimistic single-pass scan gives a motivational
// approximate score without pretending to more precision than the input
// supports. See plan.md Phase 3 Risks: "treat accuracy%/WPM as motivational".
export function scoreDrillAttempt(
  targetText: string,
  recognizedText: string,
  elapsedSeconds: number,
): DrillScoreResult {
  const targetWords = tokenizeScript(targetText).map(normalizeWord).filter(Boolean);
  const recognizedWords = tokenizeScript(recognizedText).map(normalizeWord).filter(Boolean);

  let matchedWordCount = 0;
  let searchFrom = 0;
  for (const targetWord of targetWords) {
    const foundAt = recognizedWords.indexOf(targetWord, searchFrom);
    if (foundAt !== -1) {
      matchedWordCount += 1;
      searchFrom = foundAt + 1;
    }
  }

  const targetWordCount = targetWords.length;
  const accuracyPercent = targetWordCount > 0 ? Math.round((matchedWordCount / targetWordCount) * 100) : 0;
  const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);
  const wpm = Math.round(recognizedWords.length / elapsedMinutes);

  return { accuracyPercent, wpm, matchedWordCount, targetWordCount };
}

// Manual-timer fallback (no STT transcript at all — permission denied or
// recognition unavailable): still logs a completion and a WPM figure from
// elapsed time against the twister's own word count, just with no accuracy
// score to report (there's nothing to compare against).
export function scoreManualDrillAttempt(targetText: string, elapsedSeconds: number, repeatCount: number): number {
  const targetWordCount = tokenizeScript(targetText).length * repeatCount;
  const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);
  return Math.round(targetWordCount / elapsedMinutes);
}
