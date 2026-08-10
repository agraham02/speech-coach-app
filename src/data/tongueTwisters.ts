import type { DifficultyTier } from "../domain/sessionTypes";

export interface TongueTwister {
  id: string;
  text: string;
  difficulty: DifficultyTier;
  // Sounds this twister drills — shown as a hint, not scored against.
  focusSounds: string[];
  // How many times to repeat the phrase in one attempt — mirrors the
  // clinical daily-practice protocols' "short reps, not one long read".
  repeatCount: number;
}

// 24 public-domain tongue twisters, 8 per tier. Difficulty is driven by
// syllable density, alliteration overlap (sounds that are easy to swap:
// s/sh, r/w), and sentence length — not by obscurity of vocabulary.
export const TONGUE_TWISTERS: TongueTwister[] = [
  // Easy — short, single dominant sound, minimal sound-swapping risk.
  {
    id: "tt_e01",
    text: "She sells seashells by the seashore.",
    difficulty: "easy",
    focusSounds: ["s", "sh"],
    repeatCount: 3,
  },
  {
    id: "tt_e02",
    text: "Peter Piper picked a peck of pickled peppers.",
    difficulty: "easy",
    focusSounds: ["p"],
    repeatCount: 3,
  },
  {
    id: "tt_e03",
    text: "How much wood would a woodchuck chuck.",
    difficulty: "easy",
    focusSounds: ["w", "ch"],
    repeatCount: 3,
  },
  {
    id: "tt_e04",
    text: "Fuzzy Wuzzy was a bear, Fuzzy Wuzzy had no hair.",
    difficulty: "easy",
    focusSounds: ["z", "w"],
    repeatCount: 3,
  },
  {
    id: "tt_e05",
    text: "Betty Botter bought some butter.",
    difficulty: "easy",
    focusSounds: ["b", "t"],
    repeatCount: 3,
  },
  {
    id: "tt_e06",
    text: "A big black bug bit a big black bear.",
    difficulty: "easy",
    focusSounds: ["b"],
    repeatCount: 3,
  },
  {
    id: "tt_e07",
    text: "Six thick thistle sticks.",
    difficulty: "easy",
    focusSounds: ["th", "s"],
    repeatCount: 3,
  },
  {
    id: "tt_e08",
    text: "Red lorry, yellow lorry.",
    difficulty: "easy",
    focusSounds: ["r", "l"],
    repeatCount: 3,
  },

  // Medium — longer, two competing sounds, faster natural cadence.
  {
    id: "tt_m01",
    text: "How can a clam cram in a clean cream can?",
    difficulty: "medium",
    focusSounds: ["cl", "cr"],
    repeatCount: 3,
  },
  {
    id: "tt_m02",
    text: "I scream, you scream, we all scream for ice cream.",
    difficulty: "medium",
    focusSounds: ["scr", "cr"],
    repeatCount: 3,
  },
  {
    id: "tt_m03",
    text: "Fred fed Ted bread, and Ted fed Fred bread.",
    difficulty: "medium",
    focusSounds: ["f", "t", "d"],
    repeatCount: 3,
  },
  {
    id: "tt_m04",
    text: "A proper copper coffee pot.",
    difficulty: "medium",
    focusSounds: ["p", "c"],
    repeatCount: 4,
  },
  {
    id: "tt_m05",
    text: "Which wristwatches are Swiss wristwatches?",
    difficulty: "medium",
    focusSounds: ["w", "s", "sw"],
    repeatCount: 3,
  },
  {
    id: "tt_m06",
    text: "Greek grapes, Greek grapes, Greek grapes.",
    difficulty: "medium",
    focusSounds: ["gr", "k"],
    repeatCount: 4,
  },
  {
    id: "tt_m07",
    text: "The great Greek grape growers grow great Greek grapes.",
    difficulty: "medium",
    focusSounds: ["gr", "k"],
    repeatCount: 3,
  },
  {
    id: "tt_m08",
    text: "Can you can a can as a canner can can a can?",
    difficulty: "medium",
    focusSounds: ["c", "k"],
    repeatCount: 3,
  },

  // Hard — dense alliteration overlap, near-homophone traps, longest lines.
  {
    id: "tt_h01",
    text: "The sixth sick sheikh's sixth sheep's sick.",
    difficulty: "hard",
    focusSounds: ["s", "sh"],
    repeatCount: 3,
  },
  {
    id: "tt_h02",
    text: "Irish wristwatch, Swiss wristwatch.",
    difficulty: "hard",
    focusSounds: ["r", "s", "w"],
    repeatCount: 4,
  },
  {
    id: "tt_h03",
    text: "Toy boat, toy boat, toy boat.",
    difficulty: "hard",
    focusSounds: ["t", "b", "oy"],
    repeatCount: 5,
  },
  {
    id: "tt_h04",
    text: "Unique New York, unique New York, you know you need unique New York.",
    difficulty: "hard",
    focusSounds: ["n", "y", "u"],
    repeatCount: 3,
  },
  {
    id: "tt_h05",
    text: "Lesser leather never weathered wetter weather better.",
    difficulty: "hard",
    focusSounds: ["l", "w", "th"],
    repeatCount: 3,
  },
  {
    id: "tt_h06",
    text: "Six slippery snails slid slowly seaward.",
    difficulty: "hard",
    focusSounds: ["s", "sl"],
    repeatCount: 3,
  },
  {
    id: "tt_h07",
    text: "A skunk sat on a stump and thunk the stump stunk, but the stump thunk the skunk stunk.",
    difficulty: "hard",
    focusSounds: ["sk", "st", "th"],
    repeatCount: 2,
  },
  {
    id: "tt_h08",
    text: "Imagine an imaginary menagerie manager managing an imaginary menagerie.",
    difficulty: "hard",
    focusSounds: ["m", "n", "g"],
    repeatCount: 2,
  },
];

export function getTongueTwister(id: string): TongueTwister | undefined {
  return TONGUE_TWISTERS.find((t) => t.id === id);
}
