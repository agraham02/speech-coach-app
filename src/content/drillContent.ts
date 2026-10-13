// Practice material for the curriculum's drills. Original passages written
// for this app; minimal pairs and fluency categories are standard
// speech-practice material.

export interface Passage {
  id: string;
  title: string;
  // "/" marks a short pause, "//" a long pause. Stripped before display in
  // pace drills; shown as visual marks in pause drills.
  text: string;
  difficulty: 1 | 2 | 3;
}

export const PACE_PASSAGES: Passage[] = [
  {
    id: "pace_coffee",
    title: "The first coffee",
    difficulty: 1,
    text: "Every morning starts the same way. / I fill the kettle, / grind the beans, / and wait. // Those four minutes are the only part of the day / that nobody can interrupt. // I don't check my phone. / I just listen to the water / and decide what kind of day it's going to be.",
  },
  {
    id: "pace_bridge",
    title: "The old bridge",
    difficulty: 1,
    text: "The bridge in our town is older than anyone living in it. / It has survived floods, / storms, / and one very confused delivery truck. // People complain that it's narrow, / but I think that's the point. // You have to slow down / and let someone else go first.",
  },
  {
    id: "pace_feedback",
    title: "Asking for feedback",
    difficulty: 2,
    text: "Most people say they want honest feedback, / but they ask for it in a way that guarantees they won't get it. // \"Any thoughts?\" is too easy to wave away. // Instead, / ask one specific question: / what is the one thing I should change next time? // Then stop talking, / and let the silence do the work.",
  },
  {
    id: "pace_maps",
    title: "Paper maps",
    difficulty: 2,
    text: "Before phones, / getting lost was part of every trip. // You unfolded a paper map / that never folded back the same way, / and you argued about which road was which. // It was slower, / and sometimes frustrating, / but you remembered the places you found by accident / far longer than the ones you planned.",
  },
  {
    id: "pace_habit",
    title: "Small habits",
    difficulty: 3,
    text: "Big changes rarely come from big decisions. // They come from small habits / repeated so often that they stop feeling like effort. // Reading ten pages, / walking after dinner, / writing one honest sentence before bed. // None of these look impressive on any single day. // But give them a year, / and they quietly rebuild the person doing them.",
  },
  {
    id: "pace_storm",
    title: "Before the storm",
    difficulty: 3,
    text: "You can feel a storm before you see it. // The air goes still, / the birds stop talking, / and the light turns a strange shade of yellow. // Then the first heavy drops hit the pavement, / one at a time, / like someone tapping on a table / waiting for your full attention. // And then, / all at once, / it arrives.",
  },
];

export interface MinimalPairSet {
  id: string;
  title: string;
  focus: string;
  pairs: [string, string][];
}

export const MINIMAL_PAIRS: MinimalPairSet[] = [
  { id: "mp_s_sh", title: "S vs SH", focus: "s / sh", pairs: [["sip", "ship"], ["sell", "shell"], ["sort", "short"], ["seat", "sheet"], ["sock", "shock"], ["same", "shame"], ["sign", "shine"], ["mass", "mash"]] },
  { id: "mp_r_l", title: "R vs L", focus: "r / l", pairs: [["right", "light"], ["rock", "lock"], ["rate", "late"], ["road", "load"], ["grass", "glass"], ["pray", "play"], ["fry", "fly"], ["crowd", "cloud"]] },
  { id: "mp_th", title: "TH vs T and F", focus: "th", pairs: [["thin", "tin"], ["three", "tree"], ["thought", "taught"], ["thank", "tank"], ["three", "free"], ["thirst", "first"], ["math", "mat"], ["both", "boat"]] },
  { id: "mp_final", title: "Finish the word", focus: "final consonants", pairs: [["bet", "bed"], ["cap", "cab"], ["back", "bag"], ["right", "ride"], ["half", "have"], ["fine", "find"], ["send", "sent"], ["card", "car"]] },
  { id: "mp_v_w", title: "V vs W", focus: "v / w", pairs: [["vest", "west"], ["vine", "wine"], ["veil", "whale"], ["vent", "went"], ["verse", "worse"], ["vow", "wow"], ["vary", "wary"], ["veal", "wheel"]] },
  { id: "mp_b_p", title: "B vs P", focus: "b / p", pairs: [["bat", "pat"], ["bear", "pear"], ["big", "pig"], ["bin", "pin"], ["bull", "pull"], ["buy", "pie"], ["cab", "cap"], ["rib", "rip"]] },
];

// Category fluency ("name as many ... as you can") — semantic word
// retrieval, from the verbal-fluency literature.
export const FLUENCY_CATEGORIES: { id: string; label: string; level: 1 | 2 | 3 }[] = [
  { id: "animals", label: "animals", level: 1 },
  { id: "foods", label: "foods", level: 1 },
  { id: "clothes", label: "things you can wear", level: 1 },
  { id: "kitchen", label: "things in a kitchen", level: 1 },
  { id: "jobs", label: "jobs", level: 1 },
  { id: "sports", label: "sports and games", level: 1 },
  { id: "countries", label: "countries", level: 2 },
  { id: "verbs_move", label: "ways to move (verbs)", level: 2 },
  { id: "emotions", label: "emotions", level: 2 },
  { id: "tools", label: "tools", level: 2 },
  { id: "weather", label: "words about weather", level: 2 },
  { id: "instruments", label: "musical instruments", level: 2 },
  { id: "adjectives_people", label: "words to describe a person", level: 3 },
  { id: "red", label: "things that are red", level: 3 },
  { id: "round", label: "things that are round", level: 3 },
  { id: "abstract", label: "things you can't touch", level: 3 },
  { id: "verbs_speak", label: "ways to say 'said'", level: 3 },
  { id: "office", label: "things in an office", level: 3 },
];

// Letter (phonemic) fluency: words starting with a letter.
export const FLUENCY_LETTERS = ["s", "b", "m", "t", "p", "c", "f", "d", "r", "l", "h", "g"];

export const RANDOM_WORDS = [
  "umbrella", "volcano", "grandmother", "bicycle", "lighthouse", "pineapple", "library", "astronaut", "sandwich",
  "thunder", "passport", "violin", "elevator", "garden", "penguin", "mirror", "candle", "train", "dragon",
  "keyboard", "river", "ladder", "spoon", "museum", "carpet", "snowstorm", "magnet", "pirate", "teacup",
  "satellite", "backpack", "orchestra", "desert", "lemon", "helmet", "compass", "cactus", "balloon", "bridge",
  "jacket", "whistle", "honey", "anchor", "castle", "skateboard", "notebook", "rainbow", "chimney", "ticket",
];

// Word chain seeds: everyday, concrete words with lots of associations, so
// the first link is easy and the chain can wander anywhere from there.
export const CHAIN_SEEDS = [
  "pen", "coffee", "ocean", "winter", "kitchen", "guitar", "airport", "forest", "candle", "bread",
  "football", "moon", "school", "garden", "phone", "rain", "city", "dog", "mountain", "birthday",
  "music", "train", "fire", "beach", "money", "doctor", "book", "window", "summer", "bicycle",
  "chocolate", "storm", "camera", "island", "clock", "festival", "river", "office", "hat", "paint",
  "tree", "market", "ice", "cinema", "bridge", "horse", "letter", "salt", "rocket", "mirror",
];

// Same sentence, stress a different word each time — each version means
// something different. Classic emphasis drill.
export const EMPHASIS_SENTENCES = [
  "I didn't say she stole the money.",
  "We need to finish this today.",
  "You should call him back now.",
  "This is the best idea we've had.",
  "I never promised you a perfect plan.",
];

// Lines read aloud by the phone (expo-speech) for shadowing: listen, then
// repeat with the same rhythm and melody.
export const SHADOWING_LINES = [
  { id: "sh1", text: "The best time to start was yesterday. The next best time is now.", level: 1 },
  { id: "sh2", text: "I'm not asking you to agree with me. I'm asking you to consider it.", level: 1 },
  { id: "sh3", text: "Here's what happened, why it matters, and what we do next.", level: 1 },
  { id: "sh4", text: "If you remember one thing from today, let it be this: keep it simple.", level: 2 },
  { id: "sh5", text: "We didn't fail because the plan was wrong. We failed because we stopped listening.", level: 2 },
  { id: "sh6", text: "Three things matter here: speed, clarity, and trust. Lose one, and you lose all three.", level: 2 },
  { id: "sh7", text: "Some people wait for confidence before they act. Confidence usually shows up after.", level: 3 },
  { id: "sh8", text: "The question isn't whether we can afford to change. It's whether we can afford not to.", level: 3 },
];

export interface WarmUpStepSpec {
  label: string;
  detail: string;
  seconds: number;
  // For breathing: the ring grows on "in", shrinks on "out", holds on "hold".
  phase?: "in" | "hold" | "out";
  // How full an "in" fills the ring (default 1) — a second, topping-up
  // breath needs the first to stop short of full.
  fill?: number;
}

export interface WarmUp {
  id: string;
  title: string;
  // How many times the whole step list runs (default 1).
  rounds?: number;
  steps: WarmUpStepSpec[];
}

export const WARM_UPS: WarmUp[] = [
  {
    id: "wu_breath",
    title: "Box breathing",
    rounds: 3,
    steps: [
      { label: "Breathe in", detail: "Through your nose, belly first.", seconds: 4, phase: "in" },
      { label: "Hold", detail: "Shoulders down, jaw loose.", seconds: 4, phase: "hold" },
      { label: "Breathe out", detail: "Slowly through your mouth.", seconds: 4, phase: "out" },
      { label: "Hold", detail: "Stay relaxed, then go again.", seconds: 4, phase: "hold" },
    ],
  },
  {
    id: "wu_low_breath",
    title: "Low breath",
    rounds: 4,
    steps: [
      { label: "Breathe in", detail: "Through your nose. Belly moves out; shoulders stay still.", seconds: 4, phase: "in" },
      { label: "Breathe out", detail: "Slowly through your mouth, belly softening.", seconds: 6, phase: "out" },
    ],
  },
  {
    // Cyclic sighing (Balban et al., 2023): a long exhale settles nerves.
    id: "wu_sigh",
    title: "Calming sigh",
    rounds: 5,
    steps: [
      { label: "Breathe in", detail: "Through your nose, deep and low.", seconds: 3, phase: "in", fill: 0.8 },
      { label: "Sip in more", detail: "A short second breath on top.", seconds: 1, phase: "in" },
      { label: "Long breath out", detail: "Slowly through your mouth, all the way out.", seconds: 6, phase: "out" },
    ],
  },
  {
    id: "wu_hiss",
    title: "Steady hiss",
    rounds: 3,
    steps: [
      { label: "Breathe in", detail: "Low and quiet, through your nose.", seconds: 3, phase: "in" },
      { label: "Hiss it out", detail: "A soft, even “sss” — the same strength the whole way. Don't push.", seconds: 10, phase: "out" },
      { label: "Rest", detail: "Let the next breath come on its own.", seconds: 3, phase: "hold" },
    ],
  },
  {
    id: "wu_articulators",
    title: "Wake up the articulators",
    steps: [
      { label: "Lip trill", detail: "Blow through loose lips — brrrr — sliding your pitch up and down.", seconds: 15 },
      { label: "Pa-ta-ka", detail: "Repeat 'pa-ta-ka' as fast as you can while staying crisp.", seconds: 15 },
      { label: "Jaw and tongue", detail: "Big chewing motions, then stretch your tongue out and side to side.", seconds: 15 },
    ],
  },
  {
    id: "wu_resonance",
    title: "Hum and siren",
    steps: [
      { label: "Hum", detail: "Lips closed, hum until you feel buzzing in your face.", seconds: 15 },
      { label: "Siren", detail: "Slide on 'ng' from your lowest note to your highest and back.", seconds: 15 },
      { label: "Speak it", detail: "Say 'my mother made marmalade' with that buzzing forward placement.", seconds: 15 },
    ],
  },
];
