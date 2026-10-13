import { contentWordKey } from "../dsp/volumePauses";

// Word chain: say a word related to the last one, then one related to that,
// and keep going (pen → ink → octopus → aquarium). Going quiet brings up a
// fresh seed word instead of ending the attempt — recovering from a blank is
// the skill. Pure.

// The chain heard so far: unique content words in the order said, as said
// (lowercased), minus the seed words themselves — saying the word on screen
// isn't a link.
export function chainWords(tokens: string[], seedWords: string[]): string[] {
  const seen = new Set(seedWords.map((w) => contentWordKey(w)).filter((k): k is string => k !== null));
  const chain: string[] = [];
  for (const t of tokens) {
    const key = contentWordKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chain.push(t.toLowerCase().replace(/[^a-z'-]/g, ""));
  }
  return chain;
}

// Phrases that explain a link ("ink, because pens need ink"). Deliberately
// excludes "so", "like" and "that's" on their own — they're fillers far more
// often than they're bridges.
const BRIDGE_PATTERN = /\b(because|cause|'cause|cuz|since|which means|that's why|reminds me of|makes me think of|leads to|goes with|comes from|is where|is what)\b/gi;

export function countBridges(transcript: string): number {
  return (transcript.match(BRIDGE_PATTERN) ?? []).length;
}

// The next seed after a blank: the first one (from `start`) not used yet.
export function nextSeed(pool: string[], used: string[], start: number): string {
  const taken = new Set(used.map((w) => w.toLowerCase()));
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(Math.abs(start) + i) % pool.length];
    if (!taken.has(candidate)) return candidate;
  }
  return pool[Math.abs(start) % pool.length];
}
