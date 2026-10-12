import {
  CHAIN_SEEDS,
  FLUENCY_CATEGORIES,
  FLUENCY_LETTERS,
  MINIMAL_PAIRS,
  PACE_PASSAGES,
  RANDOM_WORDS,
  SHADOWING_LINES,
} from "../../content/drillContent";
import { contentLevel, paramsFor, type DrillParams, type DrillType } from "./drillSpecs";

// Turns (drill type, difficulty level, optional content id, seed) into
// everything the drill screen needs to show and score. Pure.

export type LiveMode = "follow" | "count" | "story" | "free" | "volume" | "chain" | "breath";

export interface DrillSetup {
  type: DrillType;
  level: number;
  params: DrillParams;
  contentId: string;
  title: string;
  instructions: string;
  live: LiveMode;
  // Text the speaker reads (follow mode); scored by alignment.
  targetText?: string;
  // What's shown on screen (pause drills show the marks).
  displayText?: string;
  pauseMarks?: number;
  words?: string[];
  letter?: string;
  category?: string;
  line?: string;
  seconds?: number; // timed drills end on their own
  prepSeconds?: number;
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

export function stripPauseMarks(text: string): string {
  return text.replace(/\s*\/\/?\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function countPauseMarks(text: string): number {
  return (text.match(/\/\/?/g) ?? []).length;
}

export function prepareDrill(type: DrillType, level: number, seed: number, contentId?: string): DrillSetup {
  const params = paramsFor(type, level);
  const cl = contentLevel(level);
  const base = { type, level, params };

  switch (type) {
    case "pace_reading": {
      const pool = PACE_PASSAGES.filter((p) => p.difficulty <= cl);
      const passage = PACE_PASSAGES.find((p) => p.id === contentId) ?? pick(pool, seed);
      return {
        ...base,
        contentId: passage.id,
        title: passage.title,
        instructions: `Read it aloud at ${params.wpmMin}–${params.wpmMax} words a minute. Keep an eye on the pace gauge.`,
        live: "follow",
        targetText: stripPauseMarks(passage.text),
        displayText: stripPauseMarks(passage.text),
      };
    }
    case "pause_reading": {
      const pool = PACE_PASSAGES.filter((p) => p.difficulty <= cl);
      const passage = PACE_PASSAGES.find((p) => p.id === contentId) ?? pick(pool, seed + 1);
      return {
        ...base,
        contentId: passage.id,
        title: passage.title,
        instructions: `Read it aloud and hold a real pause at every mark (at least ${((params.minPauseMs ?? 400) / 1000).toFixed(1)} s). Close your mouth during the pause.`,
        live: "follow",
        targetText: stripPauseMarks(passage.text),
        displayText: passage.text.replace(/\s*\/\/\s*/g, "  ‖  ").replace(/\s*\/\s*/g, "  |  "),
        pauseMarks: countPauseMarks(passage.text),
      };
    }
    case "minimal_pairs": {
      const set = MINIMAL_PAIRS.find((m) => m.id === contentId) ?? pick(MINIMAL_PAIRS, seed);
      const count = params.target ?? 8;
      const words: string[] = [];
      for (let i = 0; i < count; i++) {
        const pair = set.pairs[i % set.pairs.length];
        // Pseudo-random choice of which word of the pair to say.
        words.push(pair[(seed + i * 7 + Math.floor(i / set.pairs.length)) % 2]);
      }
      return {
        ...base,
        contentId: set.id,
        title: set.title,
        instructions: `Read the words slowly and crisply (${set.focus}). The mic only gets it right if you do.`,
        live: "follow",
        targetText: words.join(" "),
        displayText: words.join("   ·   "),
      };
    }
    case "category_fluency": {
      const pool = FLUENCY_CATEGORIES.filter((c) => c.level <= cl);
      const category = FLUENCY_CATEGORIES.find((c) => c.id === contentId) ?? pick(pool, seed);
      return {
        ...base,
        contentId: category.id,
        title: `Name ${category.label}`,
        instructions: `Name as many ${category.label} as you can in ${params.seconds} seconds. Target: ${params.target}. Don't edit — just say them.`,
        live: "count",
        category: category.label,
        seconds: params.seconds,
      };
    }
    case "letter_fluency": {
      const letter = contentId && contentId.length === 1 ? contentId : pick(FLUENCY_LETTERS, seed);
      return {
        ...base,
        contentId: letter,
        title: `Words starting with “${letter.toUpperCase()}”`,
        instructions: `Say as many different words starting with “${letter.toUpperCase()}” as you can in ${params.seconds} seconds. Target: ${params.target}.`,
        live: "count",
        letter,
        seconds: params.seconds,
      };
    }
    case "random_word_story": {
      const n = params.target ?? 3;
      const words: string[] = [];
      for (let i = 0; words.length < n && i < 50; i++) {
        const w = RANDOM_WORDS[Math.abs(seed * 31 + i * 17) % RANDOM_WORDS.length];
        if (!words.includes(w)) words.push(w);
      }
      return {
        ...base,
        contentId: words.join(","),
        title: "Random-word story",
        instructions: `Tell a story for ${params.seconds} seconds that uses all ${n} words. Start immediately — “yes, and”.`,
        live: "story",
        words,
        seconds: params.seconds,
        prepSeconds: params.prepSeconds,
      };
    }
    case "word_chain":
    case "chain_bridge": {
      const start = contentId ?? pick(CHAIN_SEEDS, seed);
      const bridge = type === "chain_bridge";
      return {
        ...base,
        contentId: start,
        title: bridge ? "Bridge chain" : "Word chain",
        instructions: bridge
          ? `Start from “${start}”. Say the next word and why it connects — “pen… ink, because pens need ink… octopus, because octopuses squirt ink.” Target: ${params.target} links with a reason in ${params.seconds} seconds.`
          : `Start from “${start}”. Say a word it makes you think of, then a word that one makes you think of, and keep going — pen, ink, octopus, aquarium. Target: ${params.target} links in ${params.seconds} seconds. Go quiet for ${params.stallSeconds} seconds and a fresh word appears; just pick up from there.`,
        live: "chain",
        words: [start],
        seconds: params.seconds,
      };
    }
    case "just_a_minute": {
      const topics = ["your favorite season", "a skill everyone should learn", "the best meal you've had", "mornings", "a place you'd love to visit", "why people procrastinate", "the perfect weekend", "something you changed your mind about"];
      const topic = contentId ?? pick(topics, seed);
      return {
        ...base,
        contentId: topic,
        title: "Just a Minute",
        instructions: `Talk about “${topic}” for ${params.seconds} seconds without long hesitations (over 2 s) or filler words. Allowed slips: ${params.allowedHesitations}.`,
        live: "free",
        category: topic,
        seconds: params.seconds,
      };
    }
    case "shadowing": {
      const pool = SHADOWING_LINES.filter((l) => l.level <= cl);
      const line = SHADOWING_LINES.find((l) => l.id === contentId) ?? pick(pool, seed);
      return {
        ...base,
        contentId: line.id,
        title: "Shadowing",
        instructions: "Listen to the line, then repeat it right away — same rhythm, same pauses, same melody.",
        live: "follow",
        targetText: line.text,
        displayText: line.text,
        line: line.text,
      };
    }
    case "projection": {
      return {
        ...base,
        contentId: "projection",
        title: "Projection",
        instructions: `Talk about anything for ${params.seconds} seconds, keeping the meter in the green zone. Support it with breath — don't shout.`,
        live: "volume",
        seconds: params.seconds,
      };
    }
    case "breath_count": {
      return {
        ...base,
        contentId: "breath_count",
        title: "Count on one breath",
        instructions: `Breathe in low — belly, not shoulders. Then count out loud, “one, two, three…”, at an easy, even pace until you'd need another breath. Don't squeeze out the last few. Target: ${params.target}. It stops when you do.`,
        live: "breath",
        seconds: params.seconds,
      };
    }
    default:
      throw new Error(`prepareDrill: ${type} isn't a live drill`);
  }
}
