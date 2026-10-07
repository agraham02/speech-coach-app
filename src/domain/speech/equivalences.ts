// Words that sound identical, so a recognizer picking one spelling over
// another is never an articulation mistake. All entries are normalized keys
// (lowercase, letters/digits only — see normalize.ts's normalizeWord).
const HOMOPHONE_CLASSES: string[][] = [
  ["to", "too", "two", "2"],
  ["for", "four", "fore", "4"],
  ["one", "won", "1"],
  ["eight", "ate", "8"],
  ["which", "witch"],
  ["wood", "would"],
  ["sea", "see"],
  ["sells", "cells"],
  ["there", "their", "theyre"],
  ["new", "knew", "gnu"],
  ["no", "know"],
  ["weather", "whether"],
  ["bear", "bare"],
  ["i", "eye"],
  ["lorry", "laurie", "lori"],
  ["sheikh", "sheik", "chic"],
  ["sheikhs", "sheiks"],
  ["blue", "blew"],
  ["red", "read"],
  ["great", "grate"],
  ["by", "buy", "bye"],
  ["hair", "hare"],
  ["you", "u"],
  ["sheep", "sheeps"],
  ["whose", "who's", "whos"],
  ["its", "it's"],
];

// Multi-word phrases a recognizer may legitimately split or join
// differently. Compared on the concatenated form (no spaces).
const PHRASE_CLASSES: string[][] = [["iscream", "icecream"]];

function buildIndex(classes: string[][]): Map<string, string> {
  const index = new Map<string, string>();
  for (const cls of classes) {
    if (cls.length === 0) continue;
    for (const word of cls) index.set(word.replace(/[^a-z0-9]/g, ""), cls[0]);
  }
  return index;
}

const WORD_INDEX = buildIndex(HOMOPHONE_CLASSES);
const PHRASE_INDEX = buildIndex(PHRASE_CLASSES);

export function canonicalWord(norm: string): string {
  return WORD_INDEX.get(norm) ?? norm;
}

export function canonicalPhrase(concatenated: string): string {
  return PHRASE_INDEX.get(concatenated) ?? canonicalWord(concatenated);
}
