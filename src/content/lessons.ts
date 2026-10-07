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
  | { kind: "rep"; framework?: FrameworkId; focus: string; seconds?: number };

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
  { id: "cad_melody", skill: "cadence", title: "Melody and emphasis", summary: "Pitch and stress that carry meaning." },
  { id: "imp_start", skill: "impromptu", title: "Just start talking", summary: "Faster word retrieval and fewer stalls — the mind-mouth link." },
  { id: "imp_structure", skill: "impromptu", title: "Structure on the fly", summary: "Frameworks that organize an answer as you give it." },
  { id: "imp_feet", skill: "impromptu", title: "Think on your feet", summary: "Stories, surprises and follow-up questions." },
  { id: "con_nerves", skill: "confidence", title: "Reframe the nerves", summary: "Turn adrenaline into energy instead of fighting it." },
  { id: "con_authority", skill: "confidence", title: "Voice of authority", summary: "Volume, statements, and endings that land." },
  { id: "con_presence", skill: "confidence", title: "Eye contact and face", summary: "Talk to a person, not a phone." },
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
    minutes: 4,
    teach: {
      why: "The ends of words carry a surprising amount of meaning — 'cap' vs 'cab', 'right' vs 'ride'. Dropping final consonants is the most common reason clear speakers still sound unclear.",
      how: ["Land the last sound of every word", "Feel the release on t, d, k, p", "Slow down slightly on the last word of each sentence"],
      source: "Speech-clarity practice (minimal pairs)",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_final" },
      { kind: "drill", drill: "twister" },
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
      source: "Articulatory phonetics; minimal-pair training",
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
      why: "L touches the tongue tip to the ridge behind your teeth; R never touches anything — the tongue pulls back and the lips round a little. Mixing them is common under speed.",
      how: ["L: tongue tip up and touching", "R: tongue back, touching nothing", "Alternate slowly: right–light, rock–lock"],
      source: "Articulatory phonetics; minimal-pair training",
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
      why: "TH is the only English sound where the tongue comes forward between the teeth. Skip that and 'three' becomes 'tree' or 'free'.",
      how: ["Let the tongue tip peek between your teeth", "Push air over it — it's a soft hiss", "Then move straight to the next sound"],
      source: "Articulatory phonetics; minimal-pair training",
    },
    steps: [
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_th" },
      { kind: "drill", drill: "twister", contentId: "tt_e07" },
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
      source: "Motor-learning principle: accuracy before speed",
    },
    steps: [
      { kind: "warmup", warmupId: "wu_articulators" },
      { kind: "drill", drill: "twister" },
      { kind: "drill", drill: "minimal_pairs", contentId: "mp_v_w" },
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
    steps: [{ kind: "drill", drill: "pace_reading" }, { kind: "guided", guidedId: "gd_rate_contrast" }],
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
    steps: [{ kind: "drill", drill: "pause_reading" }, { kind: "guided", guidedId: "gd_power_pause" }],
  },
  {
    id: "cad_5_emphasis",
    skill: "cadence",
    unitId: "cad_melody",
    title: "Stress the key word",
    minutes: 4,
    teach: {
      why: "Which word you stress changes what a sentence means. A flat delivery hides your meaning; deliberate emphasis tells the listener exactly what matters.",
      how: ["Pick the one word that matters most", "Lift your pitch or volume on it", "Keep the rest of the sentence relaxed"],
      source: "Vinh Giang — pitch and melody",
    },
    steps: [{ kind: "guided", guidedId: "gd_emphasis" }, { kind: "drill", drill: "shadowing" }],
  },
  {
    id: "cad_6_shadow",
    skill: "cadence",
    unitId: "cad_melody",
    title: "Shadowing",
    minutes: 4,
    teach: {
      why: "Echoing a speaker's rhythm and melody right after them trains prosody faster than reading alone — it's one of the best-supported fluency techniques.",
      how: ["Listen to the whole line once", "Repeat it immediately, copying the rhythm", "Match the pauses, not just the words"],
      source: "Shadowing research (prosody and fluency)",
    },
    steps: [{ kind: "drill", drill: "shadowing" }, { kind: "drill", drill: "shadowing" }],
  },

  // ---------------- Impromptu ----------------
  {
    id: "imp_1_retrieval",
    skill: "impromptu",
    unitId: "imp_start",
    title: "Word retrieval",
    minutes: 3,
    teach: {
      why: "Blanking mid-sentence is often a word-retrieval problem, not a thinking problem. Naming things in a category, fast, exercises exactly that mind-mouth connection.",
      how: ["Say the first word that comes — no editing", "Jump to a sub-group when you stall (pets → farm animals)", "Keep your mouth moving"],
      source: "Verbal-fluency training (category naming)",
    },
    steps: [{ kind: "drill", drill: "category_fluency" }, { kind: "drill", drill: "letter_fluency" }],
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
      source: "BBC 'Just a Minute' format; fluency practice",
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
      source: "Matt Abrahams — Think Faster, Talk Smarter",
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
    id: "imp_6_story",
    skill: "impromptu",
    unitId: "imp_feet",
    title: "Random-word story",
    minutes: 4,
    teach: {
      why: "Forcing unrelated words into a story trains your brain to connect ideas on the spot — the core of thinking on your feet. 'Yes, and' instead of 'wait, let me think'.",
      how: ["Start the story immediately", "Introduce each word as soon as it fits", "Give it an ending, even a silly one"],
      source: "Improv training ('yes, and')",
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

  // ---------------- Confidence ----------------
  {
    id: "con_1_excited",
    skill: "confidence",
    unitId: "con_nerves",
    title: "\"I'm excited\"",
    minutes: 4,
    teach: {
      why: "Anxiety and excitement feel almost identical in the body. Trying to calm down rarely works; telling yourself 'I'm excited' does — in studies it made people speak longer and come across as more confident.",
      how: ["Notice the nerves — don't fight them", "Say out loud: 'I'm excited'", "Use the energy: speak a little louder and faster to start"],
      source: "Brooks (2014), anxiety reappraisal",
    },
    steps: [{ kind: "guided", guidedId: "gd_reappraisal" }, { kind: "rep", focus: "Start with energy. Use the adrenaline.", seconds: 60 }],
  },
  {
    id: "con_2_breath",
    skill: "confidence",
    unitId: "con_nerves",
    title: "Breath and posture",
    minutes: 3,
    teach: {
      why: "A shaky voice usually comes from shallow breathing. Slow belly breaths calm the body and give your voice a steady supply of air.",
      how: ["Feet planted, shoulders down", "Breathe low into your belly", "Start your first sentence on an out-breath"],
      source: "Voice training; box breathing",
    },
    steps: [{ kind: "warmup", warmupId: "wu_breath" }, { kind: "warmup", warmupId: "wu_resonance" }],
  },
  {
    id: "con_3_project",
    skill: "confidence",
    unitId: "con_authority",
    title: "Projection",
    minutes: 3,
    teach: {
      why: "Volume reads as confidence. Projecting isn't shouting — it's supporting your voice with breath and aiming it at the back of the room.",
      how: ["Breathe from the belly", "Aim your voice past the phone", "Keep the volume up through the end of each sentence"],
      source: "Vinh Giang — volume",
    },
    steps: [{ kind: "drill", drill: "projection" }, { kind: "drill", drill: "projection" }],
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
      source: "Persuasion and powerful-speech research",
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
];

export interface GuidedExercise {
  id: string;
  title: string;
  steps: string[];
  ratingQuestion: string;
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
    id: "gd_power_pause",
    title: "The power pause",
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
    steps: [
      "Read this sentence seven times, stressing a different word each time: \"I didn't say she stole the money.\"",
      "Notice how the meaning changes with each version.",
      "Then try: \"We need to finish this today.\" — stress 'need', then 'this', then 'today'.",
    ],
    ratingQuestion: "How distinct did each version sound?",
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
