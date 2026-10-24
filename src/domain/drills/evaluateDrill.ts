import { tokenizeHeard } from "../speech/normalize";
import { alignFinal, buildTarget, scoreAlignment, type DrillMiss } from "../speech/speechAlignment";
import { summarizeVolume, uniqueContentWords, usedWord, type VolumeReading } from "../dsp/volumePauses";
import {
  scoreAccuracy,
  scoreBreathCount,
  scoreBridges,
  scoreBridgesJudged,
  scoreChain,
  scoreChainJudged,
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
import {
  bridgeSegments,
  chainPairs,
  chainSegments,
  tallyBridges,
  tallyLinks,
  type BridgeChainJudgement,
  type BridgeSegment,
  type BridgeStep,
  type ChainPair,
  type ChainSegment,
  type JudgedLink,
  type WordChainJudgement,
} from "./chainJudging";
import { countRate, countReached } from "./breathCount";

// Scores one live drill attempt from what the screen measured. Pure.

export interface DrillMeasurements {
  transcript: string;
  // first recognized speech -> last recognized word (ms); 0 if unknown
  speakingMs: number;
  volume: VolumeReading[];
  // Word chain: every seed word shown (the first plus one per fresh start).
  seedWords?: string[];
  // Word chain: where in the heard words each start word's run begins.
  chainStarts?: number[];
  // Tono AI's verdict on each link (Word Chain) or reason (Bridge Chain),
  // when it was available. Without it the phone only counts.
  wordChainJudgement?: WordChainJudgement;
  bridgeChainJudgement?: BridgeChainJudgement;
  // Word chain: off for people who stutter, so blocks never cost points.
  penalizeResets?: boolean;
  // Stuttering: hesitations and fillers never count as slips (Just a Minute).
  ignoreSlips?: boolean;
  // Non-native speakers: word-following drills pass at 70% instead of 80%.
  relaxedAccuracy?: boolean;
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
  // Judged by Tono AI: each link, or each explained step.
  links?: JudgedLink[];
  steps?: BridgeStep[];
  // One-breath count: how far, and how fast.
  count?: number;
  perSecond?: number | null;
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
      return { outcome: scoreAccuracy(score.accuracyPercent, undefined, undefined, m.relaxedAccuracy ? 0.7 : undefined), details };
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
        outcome: m.ignoreSlips
          ? scoreJustAMinute(0, 0, 0, spokeRatio)
          : scoreJustAMinute(vol.pauses.length, heard.fillerCount, setup.params.allowedHesitations ?? 1, spokeRatio),
        details: { hesitations: vol.pauses.length, fillers: heard.fillerCount },
      };
    }
    case "chain": {
      const seeds = m.seedWords ?? setup.words ?? [];
      const resets = Math.max(0, seeds.length - 1);
      const counted = chainWords(rawTokens, seeds);
      const target = setup.params.target ?? 8;
      if (setup.type === "chain_bridge") {
        if (m.bridgeChainJudgement) {
          const steps = m.bridgeChainJudgement.steps;
          return { outcome: scoreBridgesJudged(tallyBridges(steps), target, resets, m.penalizeResets), details: { counted, steps, resets } };
        }
        const bridges = countBridges(m.transcript);
        return { outcome: scoreBridges(bridges, target, resets, m.penalizeResets), details: { counted, bridges, resets } };
      }
      if (m.wordChainJudgement) {
        const links = m.wordChainJudgement.links;
        return { outcome: scoreChainJudged(tallyLinks(links), target, resets, m.penalizeResets), details: { counted, links, resets } };
      }
      return { outcome: scoreChain(counted.length, target, resets, m.penalizeResets), details: { counted, resets } };
    }
    case "breath": {
      const count = countReached(rawTokens);
      const perSecond = countRate(count, m.speakingMs);
      return { outcome: scoreBreathCount(count, setup.params.target ?? 10, perSecond), details: { count, perSecond } };
    }
    case "volume": {
      const vol = summarizeVolume(m.volume, 300, setup.params.volumeTarget ?? 4);
      const fraction = vol.fractionAtTarget ?? 0;
      return { outcome: scoreProjection(fraction), details: { fractionAtTarget: Math.round(fraction * 100) / 100 } };
    }
  }
}

// What a judge is asked about after a chain attempt: the words split into the
// runs between start words. Null when there is too little to judge.
export type ChainJudgeRequest =
  | { kind: "word_chain"; input: { segments: ChainSegment[] }; pairs: ChainPair[] }
  | { kind: "bridge_chain"; input: { segments: BridgeSegment[] } };

const MIN_BRIDGE_WORDS = 4;

export function chainJudgeRequest(setup: DrillSetup, m: Pick<DrillMeasurements, "transcript" | "seedWords" | "chainStarts">): ChainJudgeRequest | null {
  if (setup.live !== "chain") return null;
  const tokens = tokenizeHeard(m.transcript).tokens.map((t) => t.raw);
  const seeds = m.seedWords ?? setup.words ?? [];
  const starts = m.chainStarts ?? [0];
  if (setup.type === "chain_bridge") {
    const segments = bridgeSegments(tokens, starts, seeds);
    return segments.reduce((n, s) => n + s.said.split(" ").length, 0) >= MIN_BRIDGE_WORDS ? { kind: "bridge_chain", input: { segments } } : null;
  }
  const segments = chainSegments(tokens, starts, seeds);
  const pairs = chainPairs(segments);
  return pairs.length ? { kind: "word_chain", input: { segments }, pairs } : null;
}
