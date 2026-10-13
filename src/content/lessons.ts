import type { SkillId } from "../theme/tokens";
import type { DrillType } from "../domain/drills/drillSpecs";
import type { FrameworkId } from "../domain/coach/structureHeuristics";

// The curriculum: 4 skill tracks -> units -> lessons. A lesson is a short
// teach card, a couple of drills, and usually one impromptu "apply" rep
// that puts the skill to work. All lessons are open; the daily plan and a
// "Next up" marker recommend the order.

export interface TeachCard {
  why: string; // <= ~60 words
  how: string[]; // 3 concrete moves
  source: string;
}

export type LessonStep =
  | { kind: "warmup"; warmupId: string }
  | { kind: "drill"; drill: Exclude<DrillType, "rep" | "guided" | "warmup">; contentId?: string }
  | { kind: "guided"; guidedId: string }
  // `prepSeconds` overrides the level's prep window — 0 for a rep that is
  // meant to be a surprise.
  | { kind: "rep"; framework?: FrameworkId; focus: string; seconds?: number; prepSeconds?: number };

export interface Lesson {
  id: string;
  skill: SkillId;
  unitId: string;
  title: string;
  minutes: number;
  teach: TeachCard;
  steps: LessonStep[];
}

export interface Unit {
  id: string;
  skill: SkillId;
  title: string;
  summary: string;
}

export const UNITS: Unit[] = [
  { id: "art_wake", skill: "articulation", title: "Wake the articulators", summary: "Lips, tongue and jaw doing their job — and finishing every word." },
  { id: "art_sounds", skill: "articulation", title: "Tricky sounds", summary: "The pairs people blur most: s/sh, r/l and th." },
  { id: "art_speed", skill: "articulation", title: "Speed with clarity", summary: "Stay crisp as the pace goes up." },
  { id: "cad_pace", skill: "cadence", title: "Find your pace", summary: "A speed people can follow — and the control to change it." },
  { id: "cad_pause", skill: "cadence", title: "The power of the pause", summary: "Silence as a tool, not a gap to fill." },
  { id: "cad_pitch", skill: "cadence", title: "Pitch", summary: "Where your voice goes at the end of a phrase — and using all of it." },
  { id: "cad_rhythm", skill: "cadence", title: "Rhythm", summary: "Short and long, fast and slow — the beat that keeps people listening." },
  { id: "cad_melody", skill: "cadence", title: "Emphasis", summary: "Stress the word that carries the meaning." },
  { id: "cad_score", skill: "cadence", title: "Put it together", summary: "Mark a line yourself — pause, pace, pitch, rhythm, stress — then say it." },
  { id: "imp_start", skill: "impromptu", title: "Just start talking", summary: "Faster word retrieval and fewer stalls — the mind-mouth link." },
  { id: "imp_structure", skill: "impromptu", title: "Structure on the fly", summary: "Frameworks that organize an answer as you give it." },
  { id: "imp_feet", skill: "impromptu", title: "Think on your feet", summary: "Stories out of nowhere, and points you find as you go." },
  { id: "con_nerves", skill: "confidence", title: "Work with the nerves", summary: "Settle your body with a long out-breath, then turn what's left into energy." },
  { id: "con_breath", skill: "confidence", title: "Breath support", summary: "Breath that steadies your pace, carries your volume and keeps your voice even." },
  { id: "con_authority", skill: "confidence", title: "Voice of authority", summary: "Volume, statements, and endings that land." },
  { id: "con_presence", skill: "confidence", title: "Eye contact and face", summary: "Talk to a person, not a phone." },
  { id: "conv_attention", skill: "conversation", title: "Outward attention", summary: "Spend your attention on them, not on watching yourself." },
  { id: "conv_moves", skill: "conversation", title: "Moves", summary: "Small, reliable replies — so you're never stuck for something to say." },
  { id: "conv_edges", skill: "conversation", title: "Starting and leaving", summary: "A plain way in, and a warm way out." },
  { id: "conv_straight", skill: "conversation", title: "Say it straight", summary: "Point first, one reason, then stop — no more rambling." },
  { id: "conv_wit", skill: "conversation", title: "Wit and warmth", summary: "Reactions, callbacks and play — the parts of humor anyone can learn." },
];

export const LESSONS: Lesson[] = [
  // ---------------- Articulation ----------------
  {
    id: "art_1_wake",
    skill: "articulation",
    unitId: "art_wake",
    title: "Lips, tongue, jaw",
    minutes: 4,
    teach: {
      why: "Mumbling usually isn't a voice problem — it's a lazy-mouth problem. Your lips, tongue and jaw shape every consonant; when they barely move, words blur together, especially when you're nervous or fast.",
      how: ["Warm the articulators up before you speak", "Open your jaw more than feels natural", "Exaggerate first, then dial back to 'natural but crisp'"],
      source: "Standard voice-and-speech warm-up practice",
    },
    steps: [
      { kind: "warmup", warmupId: "wu_articulators" },
      { kind: "drill", drill: "twister" },
    ],
  },
  {
    id: "art_2_finish",
    skill: "articulation",
    unitId: "art_wake",
    title: "Finish your words",
    minutes: 5,
    teach: {
      why: "The ends of words carry a surprising amount of meaning — 'cap' vs 'cab', 'right' vs 'ride', 'walk' vs 'walked'. Dropped endings are one of the most common reasons a clear speaker still sounds unclear.",
      how: ["Land the last sound of every word", "Feel the release on t, d, k, p", "Slow down slightly on the last word of each sentence"],
      source: "Ladefoged & Johnson, phonetics; minimal pairs",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_final" },
      { kind: "drill", drill: "twister" },
      { kind: "rep", focus: "Land the last sound of every word.", seconds: 60 },
    ],
  },
  {
    id: "art_3_s_sh",
    skill: "articulation",
    unitId: "art_sounds",
    title: "S and SH",
    minutes: 4,
    teach: {
      why: "S is made with the tongue tip just behind the teeth; SH pulls the tongue back and rounds the lips. Rush them and 'sell' becomes 'shell'. The microphone hears the difference — so does your listener.",
      how: ["S: smile slightly, tongue tip forward", "SH: round the lips, tongue pulled back", "Practice the pair slowly before the twister"],
      source: "Ladefoged & Johnson, phonetics; minimal-pair training",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_s_sh" },
      { kind: "drill", drill: "twister", contentId: "tt_e01" },
    ],
  },
  {
    id: "art_4_r_l",
    skill: "articulation",
    unitId: "art_sounds",
    title: "R and L",
    minutes: 4,
    teach: {
      why: "For L, the tongue tip touches the ridge just behind your top teeth. For R, the tip touches nothing — the tongue pulls back and bunches up, and the lips round a little. Mixing them up is common under speed.",
      how: ["L: tongue tip up and touching", "R: tongue pulled back, tip touching nothing", "Alternate slowly: right–light, rock–lock"],
      source: "Ladefoged & Johnson, phonetics; minimal-pair training",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_r_l" },
      { kind: "drill", drill: "twister", contentId: "tt_e08" },
    ],
  },
  {
    id: "art_5_th",
    skill: "articulation",
    unitId: "art_sounds",
    title: "The TH sound",
    minutes: 4,
    teach: {
      why: "TH is the only English sound made with the tongue between the teeth — and there are two: the soft one in 'thin' and the buzzy one in 'this'. Skip the tongue and 'three' becomes 'tree' or 'free', and 'they' becomes 'day'.",
      how: ["Let the tongue tip peek between your teeth", "Push air over it: a soft hiss for 'thin', add your voice for 'this'", "Then move straight to the next sound"],
      source: "Ladefoged & Johnson, phonetics; minimal-pair training",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_th" },
      { kind: "drill", drill: "twister", contentId: "tt_e07" },
    ],
  },
  {
    id: "art_6b_clusters",
    skill: "articulation",
    unitId: "art_speed",
    title: "Long words and clusters",
    minutes: 5,
    teach: {
      why: "Clusters — several consonants in a row, like the end of “months” or the start of “strength” — are where careful speakers still blur things: “mumths”, “strenth”. Long words go the same way, with the middle syllables swallowed. Both come back with slow, deliberate practice.",
      how: ["Say every consonant in the cluster, slowly: m-o-n-th-s", "Break a long word into beats — spe-ci-fi-cal-ly — then run it together", "Keep the final sound even when the next word starts"],
      source: "Ladefoged & Johnson, phonetics; minimal-pair training",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_clusters" },
      { kind: "drill", drill: "twister", contentId: "tt_m01" },
    ],
  },
  {
    id: "art_6_speed",
    skill: "articulation",
    unitId: "art_speed",
    title: "Speed ladder",
    minutes: 5,
    teach: {
      why: "Clarity that only exists at slow speed won't survive a real conversation. Building speed gradually — while staying accurate — trains the muscles to keep up with your thoughts.",
      how: ["Nail it slowly first", "Speed up one notch at a time", "Back off the moment words start to blur"],
      source: "Schmidt & Lee, motor learning — accuracy before speed",
    },
    steps: [
      { kind: "warmup", warmupId: "wu_articulators" },
      { kind: "drill", drill: "twister" },
      { kind: "rep", focus: "Talk at your normal speed — every word still crisp.", seconds: 60 },
    ],
  },

  // ---------------- Cadence ----------------
  {
    id: "cad_1_pace",
    skill: "cadence",
    unitId: "cad_pace",
    title: "Your natural pace",
    minutes: 4,
    teach: {
      why: "Most listeners follow 140–160 words a minute comfortably. Nerves push most people faster. Knowing what your target pace feels like is the first step to controlling it.",
      how: ["Read at a pace that feels slightly slow", "Breathe at the commas, not mid-phrase", "Watch the gauge, then try without looking"],
      source: "Vinh Giang — rate of speech",
    },
    steps: [{ kind: "drill", drill: "pace_reading" }, { kind: "rep", focus: "Keep a steady, unhurried pace.", seconds: 60 }],
  },
  {
    id: "cad_2_slow",
    skill: "cadence",
    unitId: "cad_pace",
    title: "Slow down to land it",
    minutes: 4,
    teach: {
      why: "Speed signals excitement; slowing down signals importance. Great speakers vary their pace on purpose — fast through the setup, slow on the line that matters.",
      how: ["Find the one key sentence", "Drop your pace by a third on it", "Then return to normal speed"],
      source: "Vinh Giang — rate of speech",
    },
    steps: [{ kind: "guided", guidedId: "gd_rate_contrast" }, { kind: "drill", drill: "pace_reading" }],
  },
  {
    id: "cad_3_pause",
    skill: "cadence",
    unitId: "cad_pause",
    title: "Pause at full stops",
    minutes: 4,
    teach: {
      why: "A pause at the end of a sentence lets the idea land and makes you sound certain. Without them, sentences run together and the listener can't keep up.",
      how: ["At every full stop, close your mouth", "Count 'one' silently", "Then start the next sentence"],
      source: "Vinh Giang — the power of the pause",
    },
    steps: [{ kind: "drill", drill: "pause_reading" }, { kind: "rep", focus: "Pause at the end of every sentence.", seconds: 60 }],
  },
  {
    id: "cad_4_power_pause",
    skill: "cadence",
    unitId: "cad_pause",
    title: "Pause before the point",
    minutes: 4,
    teach: {
      why: "Silence right before your key point builds anticipation — people lean in. It also replaces filler words: the gap you'd fill with 'um' becomes a deliberate beat.",
      how: ["Start with a two-second silence", "Pause just before your main point", "When you feel an 'um' coming, close your mouth"],
      source: "Vinh Giang; Toastmasters pausing practice",
    },
    steps: [{ kind: "guided", guidedId: "gd_power_pause" }, { kind: "drill", drill: "pause_reading" }],
  },
  {
    id: "cad_12_fillers",
    skill: "cadence",
    unitId: "cad_pause",
    title: "Pause instead of um",
    minutes: 4,
    teach: {
      why: "A few ums are normal — listeners barely notice them, and an 'um' can even tell them you're still thinking. It's the steady stream that distracts. What works in studies is simple: catch each one as it happens, then close your mouth for a beat instead.",
      how: ["Notice each um the moment you say it", "Next time one's coming, close your lips and pause", "Aim for fewer, not zero"],
      source: "Mancuso & Miltenberger (2016), habit reversal for filler words; Clark & Fox Tree (2002)",
    },
    steps: [{ kind: "guided", guidedId: "gd_catch_um" }, { kind: "rep", focus: "When you feel an um coming, close your mouth and pause.", seconds: 60 }],
  },
  {
    id: "cad_7_inflection",
    skill: "cadence",
    unitId: "cad_pitch",
    title: "Up or down?",
    minutes: 4,
    teach: {
      why: "Where your pitch goes at the end of a phrase tells people what you mean. Falling sounds finished and sure; rising asks for a reply or says there's more coming. Rising at the end of statements — upspeak — turns every point into a question.",
      how: ["End statements with a fall ↘", "Let yes/no questions rise ↗ (wh- questions fall)", "In a list, rise on every item but the last"],
      source: "Wells, English Intonation; Vinh Giang — pitch and melody",
    },
    steps: [{ kind: "guided", guidedId: "gd_inflection" }, { kind: "drill", drill: "marked_reading", contentId: "cat:questions" }],
  },
  {
    id: "cad_8_range",
    skill: "cadence",
    unitId: "cad_pitch",
    title: "Use your whole range",
    minutes: 5,
    teach: {
      why: "Most 'monotone' voices have plenty of range — it just goes unused. A siren shows you how much is there. Big physical movement pushes your pitch and loudness around without you thinking about it, so you hear what more range sounds like — then you can find it standing still.",
      how: ["Exaggerate more than feels natural", "Let the movement land on the key word", "Then say it standing still — and keep the energy"],
      source: "Laban effort actions (actor voice training); Pouw et al. (2020), gesture–speech physics",
    },
    steps: [
      { kind: "warmup", warmupId: "wu_resonance" },
      { kind: "drill", drill: "move_it" },
      { kind: "rep", focus: "Let your pitch move — more than feels natural.", seconds: 60 },
    ],
  },
  {
    id: "cad_9_rhythm",
    skill: "cadence",
    unitId: "cad_rhythm",
    title: "Vary the beat",
    minutes: 4,
    teach: {
      why: "Rhythm is the pattern of short and long. All long sentences drone; all short ones sound like a list being read out. Mixing them — a short line right after a long one — is what makes people keep listening.",
      how: ["Follow a long sentence with a short one", "Group ideas in threes: rise, rise, fall", "Move quickly through the setup, slow down for the point"],
      source: "Classical rhetoric (tricolon); Vinh Giang — rate of speech",
    },
    steps: [{ kind: "guided", guidedId: "gd_rhythm" }, { kind: "drill", drill: "marked_reading", contentId: "cat:lists" }],
  },
  {
    id: "cad_5_emphasis",
    skill: "cadence",
    unitId: "cad_melody",
    title: "Stress the key word",
    minutes: 4,
    teach: {
      why: "Which word you stress changes what a sentence means. A flat delivery hides your meaning; deliberate emphasis tells the listener exactly what matters.",
      how: ["Pick the one word that matters most", "Lift your pitch on it — a little louder and longer helps too", "Keep the rest of the sentence relaxed"],
      source: "Vinh Giang — pitch and melody",
    },
    steps: [{ kind: "guided", guidedId: "gd_emphasis" }, { kind: "drill", drill: "marked_reading", contentId: "cat:contrast" }],
  },
  {
    id: "cad_6_shadow",
    skill: "cadence",
    unitId: "cad_melody",
    title: "Shadowing",
    minutes: 4,
    teach: {
      why: "Echoing a line right after you hear it makes you copy its rhythm and melody, not just its words. The phone's voice is a steady guide to the beat and the pauses, not a model of natural expression — copy its timing, then make the line your own. In an eight-week study, language learners who shadowed for ten minutes, four times a week, became easier to follow and more fluent when they spoke off the cuff.",
      how: ["Listen to the whole line once", "Repeat it immediately, copying the rhythm", "Match the pauses, not just the words"],
      source: "Foote & McDonough (2017), shadowing",
    },
    steps: [{ kind: "drill", drill: "shadowing" }, { kind: "drill", drill: "shadowing" }],
  },
  {
    id: "cad_10_move",
    skill: "cadence",
    unitId: "cad_melody",
    title: "Move it to mean it",
    minutes: 4,
    teach: {
      why: "Gesture and stress are wired together: when your hand lands on a word, your voice lands on it too. Practice with the movement, then keep the stress without it.",
      how: ["Punch or point on the word that matters", "Keep the rest of the line relaxed", "Then read it still — the stress should stay"],
      source: "Krahmer & Swerts (2007), visual beats and prosodic prominence",
    },
    steps: [{ kind: "drill", drill: "move_it" }, { kind: "drill", drill: "marked_reading", contentId: "cat:everyday" }],
  },
  {
    id: "cad_11_markup",
    skill: "cadence",
    unitId: "cad_score",
    title: "Score your own lines",
    minutes: 5,
    teach: {
      why: "Actors and newsreaders mark their scripts before they read them: where to pause, what to stress, where the pitch goes. Marking a line yourself makes you decide what it means — and then saying it well is easy. Bring your own from Library → Mark it up → Mine.",
      how: ["A pause at every comma and full stop", "One stressed word per phrase — the news", "Read it marked, then without the marks"],
      source: "Script marking in broadcast and stage training",
    },
    steps: [{ kind: "drill", drill: "marked_reading" }, { kind: "drill", drill: "marked_reading", contentId: "cat:quotes" }],
  },

  // ---------------- Impromptu ----------------
  {
    id: "imp_1_retrieval",
    skill: "impromptu",
    unitId: "imp_start",
    title: "Word retrieval",
    minutes: 3,
    teach: {
      why: "Blanking mid-sentence is often a word-retrieval problem, not a thinking problem. Naming things in a category, fast, exercises that same jump from idea to word.",
      how: ["Say the first word that comes — no editing", "Jump to a sub-group when you stall (pets → farm animals)", "Keep your mouth moving"],
      source: "Verbal-fluency training (category naming)",
    },
    steps: [{ kind: "drill", drill: "category_fluency" }, { kind: "drill", drill: "letter_fluency" }, { kind: "drill", drill: "word_chain" }],
  },
  {
    id: "imp_chain",
    skill: "impromptu",
    unitId: "imp_start",
    title: "Keep the thread",
    minutes: 4,
    teach: {
      why: "In conversation every reply has to connect to what was just said — that's where blanks happen. A word chain trains exactly that jump: from this word to the next related one, fast, without editing.",
      how: ["Say the first link that comes — weird ones count", "If you blank, take the fresh word and keep going", "Then say why each link connects"],
      source: "Verbal-fluency and free-association training",
    },
    steps: [{ kind: "drill", drill: "word_chain" }, { kind: "drill", drill: "chain_bridge" }, { kind: "rep", focus: "Make every sentence connect to the one before it." }],
  },
  {
    id: "imp_2_minute",
    skill: "impromptu",
    unitId: "imp_start",
    title: "No-hesitation minute",
    minutes: 4,
    teach: {
      why: "Fluency is a habit of continuing. Speaking for a set time without stalling trains you to keep a sentence going while your brain finds the next idea.",
      how: ["Start before you feel ready", "Use short sentences — they're easier to finish", "Pause between thoughts, never inside one"],
      source: "Inspired by BBC Radio 4's 'Just a Minute'; fluency practice",
    },
    steps: [{ kind: "drill", drill: "just_a_minute" }, { kind: "drill", drill: "category_fluency" }],
  },
  {
    id: "imp_3_prep",
    skill: "impromptu",
    unitId: "imp_structure",
    title: "PREP",
    minutes: 5,
    teach: {
      why: "A simple structure frees your brain to find content instead of organizing it. PREP — Point, Reason, Example, Point — works for almost any opinion question.",
      how: ["Point: say your answer in one sentence", "Reason + Example: why, and one concrete case", "Point again: restate it to close"],
      source: "A widely taught business-speaking structure; Toastmasters Table Topics",
    },
    steps: [{ kind: "rep", framework: "PREP", focus: "Hit all four beats: Point, Reason, Example, Point." }],
  },
  {
    id: "imp_4_wsn",
    skill: "impromptu",
    unitId: "imp_structure",
    title: "What – So what – Now what",
    minutes: 5,
    teach: {
      why: "When you need to explain or update, this is the fastest shape: what it is, why it matters, what happens next. It keeps you from rambling through background.",
      how: ["What: the situation in a sentence", "So what: why the listener should care", "Now what: the next step or ask"],
      source: "Matt Abrahams — Think Faster, Talk Smarter",
    },
    steps: [{ kind: "rep", framework: "WhatSoWhatNowWhat", focus: "What, so what, now what — in that order." }],
  },
  {
    id: "imp_8_psb",
    skill: "impromptu",
    unitId: "imp_structure",
    title: "Problem – Solution – Benefit",
    minutes: 5,
    teach: {
      why: "When you want someone to agree to something — a change, a plan, a purchase — start with the problem they already feel. Then your fix, then what it gets them. Most good pitches have this shape, and it keeps you from opening with the details of your idea.",
      how: ["Problem: name the pain in a sentence", "Solution: what you'd do about it", "Benefit: what changes for them"],
      source: "Matt Abrahams — Think Faster, Talk Smarter",
    },
    steps: [{ kind: "rep", framework: "ProblemSolutionBenefit", focus: "Problem, solution, benefit — in that order." }],
  },
  {
    id: "imp_5_ppf",
    skill: "impromptu",
    unitId: "imp_structure",
    title: "Past – Present – Future",
    minutes: 5,
    teach: {
      why: "Any 'tell me about…' question can be answered by walking through time: how it was, how it is, where it's going. It's nearly impossible to blank with a timeline in your head.",
      how: ["Past: how it used to be", "Present: how it is now", "Future: where it's heading or what you'd change"],
      source: "Impromptu speaking frameworks (Toastmasters Table Topics)",
    },
    steps: [{ kind: "rep", framework: "PastPresentFuture", focus: "Walk from past to present to future." }],
  },
  {
    id: "imp_9_star",
    skill: "impromptu",
    unitId: "imp_structure",
    title: "Tell me about a time…",
    minutes: 5,
    teach: {
      why: "“Tell me about a time when…” is a staple of job interviews, and one of the easiest questions to ramble through. STAR keeps it tight: set the scene quickly, then spend most of your time on what you did and how it turned out.",
      how: ["Situation and task: the setup, in two sentences", "Action: what you did — say “I”, not “we”", "Result: how it ended, and what you learned"],
      source: "STAR — the standard structure for behavioral interview answers",
    },
    steps: [{ kind: "rep", framework: "STAR", focus: "Situation, task, action, result — most of your time on the action." }],
  },
  {
    id: "imp_6_story",
    skill: "impromptu",
    unitId: "imp_feet",
    title: "Random-word story",
    minutes: 4,
    teach: {
      why: "Forcing unrelated words into a story trains your brain to connect ideas on the spot — the core of thinking on your feet. 'Yes, and' instead of 'wait, let me think'.",
      how: ["Start the story immediately", "Introduce each word as soon as it fits", "Give it an ending, even a silly one"],
      source: "Johnstone, Impro ('yes, and')",
    },
    steps: [{ kind: "drill", drill: "random_word_story" }, { kind: "rep", framework: "StoryArc", focus: "Tell it as a story: setup, turn, ending." }],
  },
  {
    id: "imp_7_three",
    skill: "impromptu",
    unitId: "imp_feet",
    title: "The rule of three",
    minutes: 4,
    teach: {
      why: "Three points feel complete and are easy to remember — for you and the listener. Announce three, and your brain will go find them.",
      how: ["Say 'There are three reasons…' before you know them all", "Number them out loud", "Close with the strongest one"],
      source: "Classical rhetoric (tricolon); Toastmasters",
    },
    steps: [{ kind: "drill", drill: "letter_fluency" }, { kind: "rep", framework: "ListOfThree", focus: "Give exactly three points, numbered out loud." }],
  },
  {
    id: "imp_10_surprise",
    skill: "impromptu",
    unitId: "imp_feet",
    title: "The question you didn't expect",
    minutes: 4,
    teach: {
      why: "A question out of nowhere is where blanks happen. Saying it back in your own words is easy for your brain — you're repeating, not inventing — so it buys a couple of seconds while you decide where to land. It also shows you were listening, and checks you heard it right.",
      how: ["Say the question back in your own words", "Pick one point and say it first", "Stop when you've made it — you don't have to fill the time"],
      source: "Matt Abrahams — Think Faster, Talk Smarter (paraphrasing to buy time)",
    },
    steps: [
      { kind: "guided", guidedId: "gd_buy_time" },
      { kind: "rep", focus: "No prep: say the question back in your own words, then answer.", seconds: 60, prepSeconds: 0 },
    ],
  },

  // ---------------- Confidence ----------------
  {
    id: "con_b5_calm",
    skill: "confidence",
    unitId: "con_nerves",
    title: "Calm in a minute",
    minutes: 4,
    teach: {
      why: "Slow breaths with long out-breaths settle a racing heart before you speak. In a month-long study, five minutes a day of “cyclic sighing” — two breaths in, one long breath out — improved mood more than mindfulness meditation did.",
      how: ["Breathe in through your nose, then sip in a little more", "Let it all out slowly — longer than the breath in", "After a few rounds, start your first sentence on an out-breath"],
      source: "Balban et al. (2023), cyclic sighing",
    },
    steps: [
      { kind: "warmup", warmupId: "wu_sigh" },
      { kind: "guided", guidedId: "gd_breath_reset" },
      { kind: "rep", focus: "Start on an out-breath — calm and unhurried.", seconds: 60 },
    ],
  },
  {
    id: "con_1_excited",
    skill: "confidence",
    unitId: "con_nerves",
    title: "\"I'm excited\"",
    minutes: 4,
    teach: {
      why: "Anxiety and excitement feel almost the same in the body, which is why telling yourself to calm down tends not to work. Calling it excitement does: in one study, people who said “I'm excited” before a speech spoke longer and came across as more confident. The calming breath takes the edge off; this puts the rest to work.",
      how: ["Notice the nerves — don't fight them", "Say out loud: 'I'm excited'", "Use the energy: start a little louder than feels natural"],
      source: "Brooks (2014), anxiety reappraisal",
    },
    steps: [{ kind: "guided", guidedId: "gd_reappraisal" }, { kind: "rep", focus: "Start with energy. Use the adrenaline.", seconds: 60 }],
  },
  {
    id: "con_2_breath",
    skill: "confidence",
    unitId: "con_breath",
    title: "Breathe low",
    minutes: 4,
    teach: {
      why: "A thin or shaky voice usually starts with shallow breaths high in the chest. Breathing low — belly and lower ribs moving, shoulders still — gives your voice a steady supply of air, and the belly muscles that power speech something to work with.",
      how: ["Feet planted, shoulders down and loose", "Breathe in through your nose — belly out, chest still", "Start speaking on the out-breath, not after holding it"],
      source: "Hoit et al. (1988), the belly muscles in speech; Linklater, Freeing the Natural Voice",
    },
    steps: [{ kind: "warmup", warmupId: "wu_low_breath" }, { kind: "drill", drill: "breath_count" }],
  },
  {
    id: "con_b2_phrase",
    skill: "confidence",
    unitId: "con_breath",
    title: "One breath, one phrase",
    minutes: 4,
    teach: {
      why: "Natural speakers breathe at the ends of phrases and sentences, not in the middle of them. Run out of air mid-thought and you rush the end; top up at every pause and your pace evens out, and every sentence gets a full finish.",
      how: ["Breathe at full stops and commas — that's where pauses go anyway", "Take a quick, quiet sip through your mouth — it's faster than your nose", "Top up early instead of pushing to the last drop"],
      source: "Winkworth et al. (1995), breathing in spontaneous speech; Vinh Giang — the power of the pause",
    },
    steps: [{ kind: "guided", guidedId: "gd_phrase_breath" }, { kind: "drill", drill: "pause_reading" }],
  },
  {
    id: "con_b3_steady",
    skill: "confidence",
    unitId: "con_breath",
    title: "Steady air",
    minutes: 4,
    teach: {
      why: "Breath control is about letting air out slowly and evenly, not about how much you can take in. A steady out-breath keeps your voice even to the end of a long sentence — and stops you speeding up as you run low.",
      how: ["Breathe low, then let it out on a soft, even “sss”", "Keep the hiss the same strength from start to finish", "Count at an easy pace — rushing is cheating"],
      source: "Linklater, Freeing the Natural Voice; voice warm-up practice",
    },
    steps: [{ kind: "warmup", warmupId: "wu_hiss" }, { kind: "drill", drill: "breath_count" }],
  },
  {
    id: "con_b4_volume",
    skill: "confidence",
    unitId: "con_breath",
    title: "Breath behind the volume",
    minutes: 4,
    teach: {
      why: "Louder speech is powered by breath, not by squeezing your throat. When people speak up, they take bigger breaths and use more of them. Support the volume from below and your voice carries without sounding strained.",
      how: ["Take a fuller, low breath before a loud sentence", "Feel your belly firm up as you speak, like a gentle cough", "Keep your throat and jaw loose — let the air do the work"],
      source: "Winkworth & Davis (1997), speech breathing and loudness; Vinh Giang — volume",
    },
    steps: [{ kind: "guided", guidedId: "gd_breath_volume" }, { kind: "drill", drill: "projection" }],
  },
  {
    id: "con_3_project",
    skill: "confidence",
    unitId: "con_authority",
    title: "Projection",
    minutes: 4,
    teach: {
      why: "Volume reads as confidence. Projecting isn't shouting — it's the breath support from the last unit, aimed at someone across the room. The hard part is keeping it up: most voices fade on the last few words, which is where the point usually is.",
      how: ["Pick a spot across the room and talk to it", "Keep the volume up through the last word of each sentence", "Go quieter only on purpose, never by fading"],
      source: "Vinh Giang — volume",
    },
    steps: [{ kind: "drill", drill: "projection" }, { kind: "rep", focus: "Keep your volume up to the last word.", seconds: 60 }],
  },
  {
    id: "con_4_hedges",
    skill: "confidence",
    unitId: "con_authority",
    title: "Hedge-free answers",
    minutes: 4,
    teach: {
      why: "'I think', 'kind of', 'maybe' and 'just' soften every claim until nothing lands. Say it as a statement — you can add nuance once, on purpose.",
      how: ["Cut 'I think' from the start of sentences", "Replace 'kind of' with the precise word", "End on the claim, not a qualifier"],
      source: "Blankenship & Holtgraves (2005), powerless speech",
    },
    steps: [{ kind: "rep", framework: "PREP", focus: "No hedges: state your view plainly." }],
  },
  {
    id: "con_5_endings",
    skill: "confidence",
    unitId: "con_authority",
    title: "Strong endings",
    minutes: 4,
    teach: {
      why: "People remember the last thing you say. 'So yeah' or a trailing 'and stuff' throws that away. A clear final line — then silence — sounds like you meant every word.",
      how: ["Know your last sentence before you start", "Restate your point as the close", "Stop. Hold eye contact for a beat."],
      source: "Toastmasters; Matt Abrahams",
    },
    steps: [{ kind: "rep", focus: "End on a clear statement — then stop." }],
  },
  {
    id: "con_6_lens",
    skill: "confidence",
    unitId: "con_presence",
    title: "Talk to the lens",
    minutes: 4,
    teach: {
      why: "On camera, the lens is your listener's eyes. Looking at your own face on screen reads as looking away. Finishing sentences on the lens is what builds trust.",
      how: ["Put the phone at eye level", "Imagine one specific person behind the lens", "Finish every sentence looking at it"],
      source: "Vinh Giang — eye contact and congruence",
    },
    steps: [{ kind: "rep", focus: "Keep eye contact with the lens.", seconds: 60 }],
  },
  {
    id: "con_7_face",
    skill: "confidence",
    unitId: "con_presence",
    title: "Let your face talk",
    minutes: 4,
    teach: {
      why: "Tonality lives in the face as much as the voice: a flat face produces a flat voice. When your expression matches your words, you sound more engaging — and more believable.",
      how: ["Smile with your eyes on good news", "Raise your eyebrows on questions", "Watch pass 1 (sound off) to check yourself"],
      source: "Vinh Giang — face-voice congruence",
    },
    steps: [{ kind: "guided", guidedId: "gd_emotion_read" }, { kind: "rep", focus: "Let your expression match your words.", seconds: 60 }],
  },

  // ---------------- Conversation ----------------
  // Scored on process only (did you reply, ask, pick up their words, stop),
  // never on how good the reply was — see domain/conversation.
  {
    id: "conv_1_check",
    skill: "conversation",
    unitId: "conv_attention",
    title: "Where's my attention?",
    minutes: 4,
    teach: {
      why: "When you watch yourself mid-conversation — judging how you sound, rehearsing the next line — there's less of you left to listen, and blanks get more likely. You can't stop it by force, but you can notice it, and noticing is the first win.",
      how: ["Name it: “I'm watching myself”", "Move your attention to one thing about them", "Rate it again afterwards — that number is what we're moving"],
      source: "Clark & Wells cognitive model of social anxiety; self-focused attention studies",
    },
    steps: [{ kind: "guided", guidedId: "gd_attention_check" }, { kind: "drill", drill: "conv_reply" }],
  },
  {
    id: "conv_2_spark",
    skill: "conversation",
    unitId: "conv_attention",
    title: "Listen for the spark",
    minutes: 4,
    teach: {
      why: "Your job isn't to be impressive — it's to find the most interesting thing they said and be curious about it. People who ask follow-up questions are consistently better liked, and most of us don't realize it.",
      how: ["Catch the one word that lights them up", "Make it your thread", "Ask about it"],
      source: "Huang et al. (2017), question-asking and liking; Van Edwards, conversation sparks",
    },
    steps: [{ kind: "guided", guidedId: "gd_spark" }, { kind: "drill", drill: "conv_thread" }],
  },
  {
    id: "conv_3_safety",
    skill: "conversation",
    unitId: "conv_attention",
    title: "Set down the rehearsal",
    minutes: 4,
    teach: {
      why: "Silently scripting your next line feels safe, but it keeps your attention on you — you miss what they're saying, and the line you prepared often no longer fits. Listening to the end of their sentence gives you better material than any script.",
      how: ["Notice when you start scripting", "Let the script go", "Listen to the very end of their sentence"],
      source: "Safety behaviours in social anxiety (Clark & Wells)",
    },
    steps: [{ kind: "guided", guidedId: "gd_drop_rehearsal" }, { kind: "drill", drill: "conv_reply" }],
  },
  {
    id: "conv_4_gap",
    skill: "conversation",
    unitId: "conv_attention",
    title: "People like you more than you think",
    minutes: 3,
    teach: {
      why: "After a conversation, people reliably underestimate how much the other person liked them. Observers watching the same conversation can see the liking — we're just too busy judging ourselves to notice it.",
      how: ["Before: predict how awkward it'll be", "Have the conversation", "After: rate how it went, and compare"],
      source: "Boothby, Cooney, Sandstrom & Clark (2018), the liking gap",
    },
    steps: [{ kind: "guided", guidedId: "gd_liking_gap" }, { kind: "drill", drill: "conv_beat" }],
  },
  {
    id: "conv_5_enough",
    skill: "conversation",
    unitId: "conv_attention",
    title: "Good enough is the goal",
    minutes: 3,
    teach: {
      why: "A small, honest reply beats a perfect line you never say. Conversations are built from ordinary sentences — “No way, how did that happen?” is a complete, excellent contribution.",
      how: ["Aim for a real reply, not a great one", "Say the plain thing out loud", "Let the other person carry some of it"],
      source: "Matt Abrahams — connection over perfection",
    },
    steps: [{ kind: "guided", guidedId: "gd_good_enough" }, { kind: "drill", drill: "conv_reply" }],
  },
  {
    id: "conv_6_echo",
    skill: "conversation",
    unitId: "conv_moves",
    title: "Echo – Ask – Add",
    minutes: 4,
    teach: {
      why: "When your mind goes blank, you don't need an idea — you need a move. Repeating their key words, asking one thing, and adding a line of your own works in almost any conversation.",
      how: ["Echo: “Portugal, huh?”", "Ask: “What was the best thing you ate?”", "Add: one sentence of your own"],
      source: "Active-listening practice; Huang et al. (2017)",
    },
    steps: [{ kind: "drill", drill: "conv_echo" }, { kind: "drill", drill: "conv_thread" }],
  },
  {
    id: "conv_7_thread",
    skill: "conversation",
    unitId: "conv_moves",
    title: "Ask about the last thing",
    minutes: 4,
    teach: {
      why: "The last thing someone said is always a valid place to go next. Asking about it means there's nothing to plan and nothing to remember — the material is right there.",
      how: ["Listen to the end", "Grab a word from their last sentence", "Ask how, what or why about it"],
      source: "Huang et al. (2017), follow-up questions",
    },
    steps: [{ kind: "drill", drill: "conv_thread" }, { kind: "drill", drill: "conv_thread" }],
  },
  {
    id: "conv_8_story",
    skill: "conversation",
    unitId: "conv_moves",
    title: "Questions that bring out a story",
    minutes: 4,
    teach: {
      why: "“Did you like it?” gets a yes. “What was the best part?” gets a story — and stories give you threads to follow. Ask for the story behind the fact.",
      how: ["Swap yes/no questions for “what” and “how”", "Ask for the best, worst or most surprising part", "Follow up on the story you get"],
      source: "Vanessa Van Edwards — conversation sparks",
    },
    steps: [{ kind: "guided", guidedId: "gd_story_questions" }, { kind: "drill", drill: "conv_thread" }],
  },
  {
    id: "conv_9_metoo",
    skill: "conversation",
    unitId: "conv_moves",
    title: "The one-sentence “me too”",
    minutes: 4,
    teach: {
      why: "Relating builds connection — but a long story of your own can take the conversation away from them. One sentence of “me too”, then hand it back with a question.",
      how: ["Relate in one sentence", "Hand it back: “What about you?”", "Let them keep the spotlight"],
      source: "Van Edwards — 'me too' moments; active listening",
    },
    steps: [{ kind: "guided", guidedId: "gd_me_too" }, { kind: "drill", drill: "conv_echo" }],
  },
  {
    id: "conv_10_hold",
    skill: "conversation",
    unitId: "conv_moves",
    title: "Hold one word",
    minutes: 4,
    teach: {
      why: "Thinking of a question while they talk, then losing it on your turn, is a working-memory problem — worry takes up the space. Carry one keyword instead of a whole sentence, and go back to listening.",
      how: ["Pick one word to ask about", "Let the rest of the sentence go", "When it's your turn, build the question from the word"],
      source: "Attentional control theory (Eysenck et al., 2007)",
    },
    steps: [{ kind: "drill", drill: "conv_held" }, { kind: "drill", drill: "conv_held" }],
  },
  {
    id: "conv_11_recover",
    skill: "conversation",
    unitId: "conv_moves",
    title: "When you blank",
    minutes: 3,
    teach: {
      why: "Everyone blanks sometimes. The fix isn't to never blank — it's having a plain way through it. Buying a second, or saying you lost the thought, costs far less than it feels like it does.",
      how: ["Buy time: “Good question — give me a second.”", "Lost it: “I lost my thought — go on.”", "Or take a breath and ask about the last thing"],
      source: "Liking-gap research; Abrahams on reducing the pressure to perform",
    },
    steps: [{ kind: "guided", guidedId: "gd_recover" }, { kind: "drill", drill: "conv_beat" }],
  },
  {
    id: "conv_12_outsider",
    skill: "conversation",
    unitId: "conv_moves",
    title: "The curious outsider",
    minutes: 4,
    teach: {
      why: "When people talk about a field you don't know, it's easy to go quiet. But not knowing is an advantage: people love explaining their work to someone genuinely curious.",
      how: ["Don't fake knowing", "Ask how it works, or what's hard about it", "Follow the answer with another why"],
      source: "Huang et al. (2017); Van Edwards — ask for the story",
    },
    steps: [{ kind: "drill", drill: "conv_outsider" }, { kind: "drill", drill: "conv_outsider" }],
  },
  {
    id: "conv_13_group",
    skill: "conversation",
    unitId: "conv_moves",
    title: "Join the group",
    minutes: 5,
    teach: {
      why: "Groups move fast, and waiting for the perfect moment means waiting forever. A short reaction or one question is enough to be part of it — you don't need a speech.",
      how: ["React first: a laugh, a “no way”", "Then one question or one line", "It's fine to overlap a little — that's how groups talk"],
      source: "Turn-taking research (Stivers et al., 2009)",
    },
    steps: [{ kind: "drill", drill: "conv_group" }],
  },
  {
    id: "conv_23_open",
    skill: "conversation",
    unitId: "conv_edges",
    title: "Open with what's here",
    minutes: 4,
    teach: {
      why: "The easiest way to start talking to someone is to say something plain about what you can both see — the room, the food, the wait — and then ask a question about it. It needs no clever line, and a plain opener goes over better than a flippant one: in field experiments, direct and everyday openers got warmer responses than cute ones.",
      how: ["Notice something you share: the room, the food, the event", "Say it plainly, then ask a question about it", "Let their answer be the next thing you pick up"],
      source: "Cunningham (1989), opening lines; Huang et al. (2017), question-asking",
    },
    steps: [{ kind: "guided", guidedId: "gd_opener" }, { kind: "drill", drill: "conv_thread" }],
  },
  {
    id: "conv_24_exit",
    skill: "conversation",
    unitId: "conv_edges",
    title: "Leaving gracefully",
    minutes: 3,
    teach: {
      why: "Conversations rarely end when either person wants them to, because each side is guessing what the other wants. Ending one yourself is usually a kindness, not rudeness — the other person is probably as unsure as you are. A good exit has three parts: something warm, a reason or a plan, and a clear goodbye.",
      how: ["Say something specific you enjoyed: “I liked hearing about the trip”", "Give a simple reason or next step: “I'm going to grab a drink — talk soon?”", "Then actually go — don't reopen the conversation on the way out"],
      source: "Mastroianni et al. (2021), how conversations end",
    },
    steps: [{ kind: "guided", guidedId: "gd_exit" }],
  },
  {
    id: "conv_14_headline",
    skill: "conversation",
    unitId: "conv_straight",
    title: "Headline first",
    minutes: 4,
    teach: {
      why: "Rambling usually means you found your point while talking. Say the point first — in one sentence — and everything after it has somewhere to go.",
      how: ["Answer in your first sentence", "Add one reason or example", "Stop"],
      source: "Bottom-line-up-front; Abrahams, structured spontaneity",
    },
    steps: [{ kind: "drill", drill: "land_plane" }, { kind: "drill", drill: "land_plane" }],
  },
  {
    id: "conv_15_land",
    skill: "conversation",
    unitId: "conv_straight",
    title: "Land the plane",
    minutes: 4,
    teach: {
      why: "Endings that trail off — “so yeah, I don't know” — make a clear answer sound unsure, and leave the other person guessing whether it's their turn. A clear last line, then quiet, hands the conversation back. The pause that follows is normal; it's not yours to fill.",
      how: ["Know your last line", "Say it", "Stop, and let the silence sit for a beat"],
      source: "Toastmasters; Abrahams; turn-taking research (Stivers et al., 2009)",
    },
    steps: [{ kind: "drill", drill: "land_plane" }],
  },
  {
    id: "conv_16_squeeze",
    skill: "conversation",
    unitId: "conv_straight",
    title: "Squeeze it",
    minutes: 5,
    teach: {
      why: "Telling the same story in sixty, thirty, then fifteen seconds shows you which parts are the heart and which are detours. Do it a few times and your everyday stories get tighter on their own.",
      how: ["Tell it long", "Tell it in half the time", "Then the fifteen-second version"],
      source: "Speaking-coach compression drills",
    },
    steps: [{ kind: "drill", drill: "squeeze" }],
  },
  {
    id: "conv_17_detours",
    skill: "conversation",
    unitId: "conv_straight",
    title: "Cut the detours",
    minutes: 4,
    teach: {
      why: "“By the way…”, “that reminds me…”, “anyway…” — each usually marks a side trip. Noticing them is most of the cure.",
      how: ["Hear yourself say “by the way”", "Skip the side trip, or save it", "Get back to the point in one sentence"],
      source: "Speaking-coach practice",
    },
    steps: [{ kind: "guided", guidedId: "gd_detours" }, { kind: "drill", drill: "land_plane" }],
  },
  {
    id: "conv_18_offer",
    skill: "conversation",
    unitId: "conv_straight",
    title: "Offer more, don't add more",
    minutes: 3,
    teach: {
      why: "When you're not sure if you've said enough, the urge is to keep going. Instead, give the short version and offer the rest — they'll ask if they want it.",
      how: ["Give the short version", "Offer: “Want the long version?”", "Let them choose"],
      source: "Speaking-coach practice",
    },
    steps: [{ kind: "guided", guidedId: "gd_offer_more" }, { kind: "drill", drill: "land_plane" }],
  },
  {
    id: "conv_19_react",
    skill: "conversation",
    unitId: "conv_wit",
    title: "React out loud",
    minutes: 3,
    teach: {
      why: "Most laughter in conversation doesn't follow jokes at all — it follows ordinary remarks, between people reacting to each other. Showing you heard something is most of what makes talk feel fun, and you don't need to be funny to do it.",
      how: ["Let the reaction out: a laugh, a “no way”", "Say what struck you", "Don't hunt for a punchline"],
      source: "Provine (2000), Laughter; Brooks, Talk (levity)",
    },
    steps: [{ kind: "drill", drill: "conv_react" }, { kind: "drill", drill: "conv_react" }],
  },
  {
    id: "conv_20_callback",
    skill: "conversation",
    unitId: "conv_wit",
    title: "Notice and call back",
    minutes: 4,
    teach: {
      why: "A callback — bringing back something said earlier — is the easiest kind of wit. It doesn't need a clever line, only attention: you noticed, you remembered, you brought it back.",
      how: ["Notice a vivid detail", "Hold onto it", "Bring it back later in a new context"],
      source: "Johnstone, Impro; improv and comedy craft",
    },
    steps: [{ kind: "drill", drill: "callback" }],
  },
  {
    id: "conv_21_exaggerate",
    skill: "conversation",
    unitId: "conv_wit",
    title: "Playful exaggeration",
    minutes: 3,
    teach: {
      why: "Taking something ordinary and blowing it up a little — “so your cat is planning a heist” — is a gentle, low-risk kind of humor. It shows you're playing along.",
      how: ["Find the odd detail", "Make it a little bigger", "Keep it kind"],
      source: "Johnstone, Impro ('yes, and'); Tagalidou et al. (2018), humor training",
    },
    steps: [{ kind: "guided", guidedId: "gd_exaggerate" }, { kind: "drill", drill: "conv_react" }],
  },
  {
    id: "conv_22_tease",
    skill: "conversation",
    unitId: "conv_wit",
    title: "Kind teasing, real curiosity",
    minutes: 3,
    teach: {
      why: "Flirting isn't a script — people's styles vary a lot, so there's no line that works on everyone. What works is the same as good conversation: real curiosity, warmth, and a little play.",
      how: ["Be curious about them, specifically", "Tease the situation, never the person's insecurities", "Say what you actually enjoy about talking to them"],
      source: "Hall et al. (2010), styles of flirting",
    },
    steps: [{ kind: "guided", guidedId: "gd_kind_tease" }, { kind: "drill", drill: "conv_react" }],
  },
];

export interface GuidedExercise {
  id: string;
  title: string;
  steps: string[];
  ratingQuestion: string;
  // The skill the self-rating feeds (defaults to the guided drill's skill,
  // confidence).
  skill?: SkillId;
}

// Exercises that can't be measured reliably on-device, so they finish with
// an honest self-rating instead.
export const GUIDED: GuidedExercise[] = [
  {
    id: "gd_reappraisal",
    title: "Reframe it",
    steps: [
      "Think of the next time you have to speak and notice what your body does — heart rate, hands, stomach.",
      "Say out loud, with energy: \"I'm excited.\"",
      "Say it once more, louder, standing tall.",
    ],
    ratingQuestion: "How energized (vs anxious) do you feel now?",
  },
  {
    id: "gd_phrase_breath",
    title: "One breath, one phrase",
    steps: [
      "Read this out loud: “When you speak, | breathe at the pauses, | not in the middle of a thought. || Each phrase gets its own breath, | and each sentence gets a full finish.”",
      "At every bar, take a quick, quiet sip of air through your mouth.",
      "Read it again a little slower, making sure no phrase runs out of air before its last word.",
    ],
    ratingQuestion: "How easily did each phrase finish on its own breath?",
  },
  {
    id: "gd_breath_volume",
    title: "Breath behind the volume",
    steps: [
      "Put a hand on your belly. Say “Hey!” as if calling someone across a room — feel your belly firm up under your hand.",
      "Now say a whole sentence at that volume: “I'd like to start with the most important part.” Keep the push going to the last word.",
      "Once more, louder, with a bigger breath first — throat loose, no straining.",
    ],
    ratingQuestion: "How well did your volume hold up to the end of the sentence?",
  },
  {
    id: "gd_breath_reset",
    title: "Reset before you speak",
    steps: [
      "Two calming sighs: breathe in, sip in a little more, then one long breath out.",
      "Feel your feet on the floor and let your shoulders drop.",
      "On your next out-breath, say an opening line out loud: “Thanks for having me — let me start with a quick story.”",
    ],
    ratingQuestion: "How steady did your voice feel on that first line?",
  },
  {
    id: "gd_power_pause",
    title: "The power pause",
    skill: "cadence",
    steps: [
      "Pick any opinion you hold.",
      "Look at the lens and hold a full two seconds of silence.",
      "Then say your point in one sentence. Pause again. Then give one reason.",
      "Repeat three times, each time making the opening silence feel more natural.",
    ],
    ratingQuestion: "How comfortable did the silence feel by the third try?",
  },
  {
    id: "gd_rate_contrast",
    title: "Rate contrast",
    skill: "cadence",
    steps: [
      "Tell a 3-sentence story about your morning, quickly, like you're excited.",
      "Now say the last sentence again, slowly, as if it's the most important thing you'll say today.",
      "Do it twice more, making the contrast bigger each time.",
    ],
    ratingQuestion: "How clearly could you hear the change in pace?",
  },
  {
    id: "gd_emphasis",
    title: "Emphasis shift",
    skill: "cadence",
    steps: [
      "Read this sentence seven times, stressing a different word each time: \"I didn't say she stole the money.\"",
      "Notice how the meaning changes with each version.",
      "Then try: \"We need to finish this today.\" — stress 'need', then 'this', then 'today'.",
    ],
    ratingQuestion: "How distinct did each version sound?",
  },
  {
    id: "gd_catch_um",
    title: "Catch the um",
    skill: "cadence",
    steps: [
      "Talk out loud for 30 seconds about your morning. Every time you hear yourself say “um” or “uh”, tap the table.",
      "Now 30 seconds on your plans for the weekend. When you feel an um coming, close your lips and pause instead.",
      "Notice the pause felt longer to you than it would sound to anyone listening.",
    ],
    ratingQuestion: "How well did you catch the ums as they happened?",
  },
  {
    id: "gd_inflection",
    title: "Statement or question?",
    skill: "cadence",
    steps: [
      "Say “You finished it.” with your pitch falling at the end — a statement. Then again rising — now it's a question.",
      "Say “We're meeting at six.” both ways. Notice how the rising one sounds unsure.",
      "Now a list: “Bread, milk, and eggs.” Rise on bread, rise on milk, fall on eggs.",
    ],
    ratingQuestion: "How clearly could you hear the difference between up and down?",
  },
  {
    id: "gd_rhythm",
    title: "Choppy, flowing, mixed",
    skill: "cadence",
    steps: [
      "Say this in short, choppy bursts: “I woke up. It was raining. I missed the bus. I walked.”",
      "Now as one long flowing sentence: “I woke up to rain, missed the bus, and ended up walking the whole way in.”",
      "Now mix them: “I woke up to rain, missed the bus, and walked the whole way in. Soaked. Completely soaked.”",
    ],
    ratingQuestion: "How much did the mixed version beat the other two?",
  },
  {
    id: "gd_emotion_read",
    title: "Same line, different feeling",
    steps: [
      "Say \"I can't believe you did that\" as if you're delighted.",
      "Now furious. Now heartbroken. Now amused.",
      "Let your face lead each one — eyebrows, eyes, mouth.",
    ],
    ratingQuestion: "How different did your face and voice feel across the four?",
  },

  // --- Conversation ---
  {
    id: "gd_attention_check",
    title: "Where's my attention?",
    skill: "conversation",
    steps: [
      "Think of the last conversation where you went quiet. Picture it for a moment.",
      "Where was your attention — on them, or on how you were coming across? Just notice; there's no wrong answer.",
      "Now look around wherever you are and name three things you can see, out loud. That's what moving attention outward feels like.",
      "Next time you notice yourself watching yourself, do the same: pick one thing about the other person and look at it.",
    ],
    ratingQuestion: "How easy was it to move your attention outward?",
  },
  {
    id: "gd_spark",
    title: "Listen for the spark",
    skill: "conversation",
    steps: [
      "Play a short video or podcast clip of someone talking — or remember a friend telling you about their day.",
      "Listen for the one word or moment where their energy went up. That's the spark.",
      "Say out loud the question you'd ask about it: “Wait — what happened with ___?”",
    ],
    ratingQuestion: "How clearly could you hear where the spark was?",
  },
  {
    id: "gd_drop_rehearsal",
    title: "Set down the rehearsal",
    skill: "conversation",
    steps: [
      "Remember a moment you were rehearsing what to say while someone else was talking.",
      "What did you miss while you were rehearsing? Name one thing.",
      "Make a plan in one sentence: “When I notice I'm scripting, I'll go back to their last word.”",
    ],
    ratingQuestion: "How confident are you that you'll notice the next time you're scripting?",
  },
  {
    id: "gd_liking_gap",
    title: "Predict, then check",
    skill: "conversation",
    steps: [
      "Think of a conversation coming up — today or this week.",
      "Predict, 0 to 10, how awkward it will be. Say the number out loud.",
      "Afterwards, open Today → Debrief and rate how it actually went. Most people find their prediction was worse than reality.",
    ],
    ratingQuestion: "How willing are you to test your prediction?",
  },
  {
    id: "gd_good_enough",
    title: "Say the plain thing",
    skill: "conversation",
    steps: [
      "Imagine a friend says: “I finally finished that huge project.”",
      "Say three plain replies out loud: “Nice, how does it feel?”, “What was the hardest part?”, “You must be relieved.”",
      "Notice none of them were clever, and all of them were good.",
    ],
    ratingQuestion: "How okay does a plain reply feel to you now?",
  },
  {
    id: "gd_story_questions",
    title: "Turn facts into stories",
    skill: "conversation",
    steps: [
      "Take the question “What do you do?” and turn it into a story question out loud — e.g. “What's the most surprising part of your job?”",
      "Do the same for “How was your weekend?” — e.g. “What was the best part of your weekend?”",
      "And “Where are you from?” — e.g. “What do you miss most about growing up there?”",
    ],
    ratingQuestion: "How natural did the story questions feel?",
  },
  {
    id: "gd_me_too",
    title: "One sentence, then hand it back",
    skill: "conversation",
    steps: [
      "Imagine someone says: “I just started learning guitar.”",
      "Say one sentence of your own — “I tried piano once and quit after a month” — then hand it back: “What made you pick guitar?”",
      "Try it again with: “I've been getting into running.”",
    ],
    ratingQuestion: "How easy was it to stop at one sentence?",
  },
  {
    id: "gd_recover",
    title: "Practice the blank",
    skill: "conversation",
    steps: [
      "Say this out loud, calmly, like it's no big deal: “Good question — give me a second.”",
      "Now: “I totally lost my thought. Go on.”",
      "Now take one slow breath and say: “Wait, tell me more about that.” These three lines will get you through almost any blank.",
    ],
    ratingQuestion: "How comfortable would you feel using one of these for real?",
  },
  {
    id: "gd_detours",
    title: "Catch the detour",
    skill: "conversation",
    steps: [
      "Tell yourself, out loud, how your morning went — but every time you hear “by the way”, “anyway” or “that reminds me”, stop.",
      "Back up and say the main point in one sentence instead.",
      "Do it once more, aiming for no detours at all.",
    ],
    ratingQuestion: "How often did you catch the detour before you took it?",
  },
  {
    id: "gd_offer_more",
    title: "The short version",
    skill: "conversation",
    steps: [
      "Answer out loud in one or two sentences: “What do you do?”",
      "End with an offer: “It's a long story if you ever want it.”",
      "Do it again for: “How was your trip?”",
    ],
    ratingQuestion: "How natural did stopping early feel?",
  },
  {
    id: "gd_exaggerate",
    title: "Make it bigger",
    skill: "conversation",
    steps: [
      "Someone says: “My cat knocked my coffee off the table again.” Say a playful exaggeration out loud — e.g. “So it's a war now.”",
      "Try: “I've been on hold with the bank for an hour.”",
      "Try: “My roommate labels everything in the fridge.”",
    ],
    ratingQuestion: "How playful did you let yourself be?",
  },
  {
    id: "gd_kind_tease",
    title: "Curious and kind",
    skill: "conversation",
    steps: [
      "Imagine someone tells you they're terrible at cooking but make one great pasta. Say something curious out loud: “Okay, what's the one pasta?”",
      "Now a light, kind tease about the situation, not them: “So if I come over, it's pasta. Every time.”",
      "Then something genuine: “I like that you know exactly what you're good at.”",
    ],
    ratingQuestion: "How warm (not performed) did that feel?",
  },
  {
    id: "gd_buy_time",
    title: "Say it back",
    skill: "impromptu",
    steps: [
      "Imagine a friend asks, out of nowhere: “What's the most overrated food?” Before answering, say it back in your own words: “So, which food do people hype too much?”",
      "Now answer in one sentence, point first: “Avocado toast — it's mostly the price.”",
      "Try it with: “Would you rather be famous or rich?” — say it back, then answer.",
      "And: “What's something you've changed your mind about?”",
    ],
    ratingQuestion: "How natural did saying the question back feel?",
  },
  {
    id: "gd_opener",
    title: "Something plain, then a question",
    skill: "conversation",
    steps: [
      "Look around wherever you are and find one thing anyone nearby could also see — the room, the weather, something on the table.",
      "Say a plain comment about it out loud, then ask a question: “This place is packed tonight — have you been here before?”",
      "Do it again with something else: “The line for coffee is huge. What are you having?” Notice neither line was clever, and neither needed to be.",
      "Now pick a place from your week where you'd have to start a conversation — a meeting, a party, a queue — and say your opener for it.",
    ],
    ratingQuestion: "How easy was it to start with something plain?",
  },
  {
    id: "gd_exit",
    title: "Warm, reason, goodbye",
    skill: "conversation",
    steps: [
      "Say something specific you enjoyed about a conversation: “I loved hearing about your trip.”",
      "Add a reason or a plan: “I'm going to grab some water — it was great talking.”",
      "Finish with a clear goodbye, and imagine walking away: “Talk soon!”",
      "Now the harder one — someone who keeps talking. Say all three again, a little firmer and still warm: “I've got to run — I'll catch you later.”",
    ],
    ratingQuestion: "How okay did it feel to be the one who ends it?",
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function getGuided(id: string): GuidedExercise | undefined {
  return GUIDED.find((g) => g.id === id);
}

export function lessonsForSkill(skill: SkillId): Lesson[] {
  return LESSONS.filter((l) => l.skill === skill);
}
