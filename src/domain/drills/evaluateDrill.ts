import { tokenizeHeard } from "../speech/normalize";
import { alignFinal, buildTarget, scoreAlignment, type DrillMiss } from "../speech/speechAlignment";
import { summarizeVolume, uniqueContentWords, usedWord, type VolumeReading } from "../dsp/volumePauses";
import {
  scoreAccuracy,
  scoreBridges,
  scoreChain,
  scoreCount,
  scoreJustAMinute,
  scorePace,
  scorePauses,
  scoreProjection,
  scoreStory,
  type DrillOutcome,
} from "./drillSpecs";
import type { DrillSetup } from "./prepareDrill";
import { chainWords, countBridges } from "./wordChain";

// Scores one live drill attempt from what the screen measured. Pure.

export interface DrillMeasurements {
  transcript: string;
  // first recognized speech -> last recognized word (ms); 0 if unknown
  speakingMs: number;
  volume: VolumeReading[];
  // Word chain: every seed word shown (the first plus one per fresh start).
  seedWords?: string[];
  // Word chain: off for people who stutter, so blocks never cost points.
  penalizeResets?: boolean;
}

export interface DrillDetails {
  accuracyPercent?: number;
  wpm?: number;
  misses?: DrillMiss[];
  counted?: string[];
  usedWords?: string[];
  missingWords?: string[];
  pauses?: number;
  hesitations?: number;
  fillers?: number;
  fractionAtTarget?: number;
  resets?: number;
  bridges?: number;
}

const HESITATION_MS = 2000;

export function evaluateDrill(setup: DrillSetup, m: DrillMeasurements): { outcome: DrillOutcome; details: DrillDetails } {
  const heard = tokenizeHeard(m.transcript);
  const rawTokens = heard.tokens.map((t) => t.raw);

  switch (setup.live) {
    case "follow": {
      const target = buildTarget(setup.targetText ?? "", 1);
      const ops = alignFinal(target, heard.tokens);
      const score = scoreAlignment(target, heard.tokens, ops, { speakingMs: m.speakingMs });
      const details: DrillDetails = { accuracyPercent: score.accuracyPercent, wpm: score.wpm, misses: score.misses };
      if (setup.type === "pace_reading") return { outcome: scorePace(score.wpm, score.accuracyPercent, setup.params), details };
      if (setup.type === "pause_reading") {
        const vol = summarizeVolume(m.volume, setup.params.minPauseMs ?? 400);
        details.pauses = vol.pauses.length;
        return { outcome: scorePauses(vol.pauses.length, setup.pauseMarks ?? 1), details };
      }
      return { outcome: scoreAccuracy(score.accuracyPercent), details };
    }
    case "count": {
      const counted = uniqueContentWords(rawTokens, setup.letter);
      const unit = setup.letter ? `“${setup.letter.toUpperCase()}” words` : setup.category ?? "words";
      return { outcome: scoreCount(counted.length, setup.params.target ?? 8, unit), details: { counted } };
    }
    case "story": {
      const words = setup.words ?? [];
      const used = words.filter((w) => usedWord(rawTokens, w));
      const vol = summarizeVolume(m.volume, 300);
      const span = vol.speechStartMs != null && vol.speechEndMs != null ? vol.speechEndMs - vol.speechStartMs : m.speakingMs;
      const spokeRatio = span / ((setup.seconds ?? 60) * 1000);
      return {
        outcome: scoreStory(used.length, words.length, spokeRatio),
        details: { usedWords: used, missingWords: words.filter((w) => !used.includes(w)) },
      };
    }
    case "free": {
      const vol = summarizeVolume(m.volume, HESITATION_MS);
      const span = vol.speechStartMs != null && vol.speechEndMs != null ? vol.speechEndMs - vol.speechStartMs : m.speakingMs;
      const spokeRatio = span / ((setup.seconds ?? 60) * 1000);
      return {
        outcome: scoreJustAMinute(vol.pauses.length, heard.fillerCount, setup.params.allowedHesitations ?? 1, spokeRatio),
        details: { hesitations: vol.pauses.length, fillers: heard.fillerCount },
      };
    }
    case "chain": {
      const seeds = m.seedWords ?? setup.words ?? [];
      const resets = Math.max(0, seeds.length - 1);
      const counted = chainWords(rawTokens, seeds);
      const target = setup.params.target ?? 8;
      if (setup.type === "chain_bridge") {
        const bridges = countBridges(m.transcript);
        return { outcome: scoreBridges(bridges, target, resets, m.penalizeResets), details: { counted, bridges, resets } };
      }
      return { outcome: scoreChain(counted.length, target, resets, m.penalizeResets), details: { counted, resets } };
    }
    case "volume": {
      const vol = summarizeVolume(m.volume, 300, setup.params.volumeTarget ?? 4);
      const fraction = vol.fractionAtTarget ?? 0;
      return { outcome: scoreProjection(fraction), details: { fractionAtTarget: Math.round(fraction * 100) / 100 } };
    }
  }
}
