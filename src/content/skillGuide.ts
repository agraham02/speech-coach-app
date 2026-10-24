import type { SkillId } from "../theme/tokens";

// What each skill rating measures, what feeds it, and what moves it — the
// skill detail screen. Keep in step with DRILL_SKILL (drillSpecs.ts), the
// rule coach's observations (ruleCoach.ts) and the review mapping
// (repEvidence.ts).

export interface SkillGuide {
  what: string;
  feeds: string[];
  raises: string[];
  lowers: string[];
}

export const HOW_RATINGS_WORK =
  "Your rating runs from 0 to 100. Every scored drill or take compares how you did with what your rating predicted at that difficulty. Do better than predicted and it rises; do worse and it falls. A bigger surprise moves it further, and moves get smaller as your history grows, so one off day can't sink it. Drills get harder as you pass them, so holding steady at a higher level is still progress.";

export const SKILL_GUIDE: Record<SkillId, SkillGuide> = {
  articulation: {
    what: "How clearly your words come through: every sound finished, nothing swallowed.",
    feeds: ["Tongue twisters and minimal pairs: how many words came through as you said them", "The read-aloud passage in your skill check"],
    raises: ["Finishing word endings, like the t in \"that\" and the d in \"and\"", "Opening your mouth a little more on vowels", "Passing a drill your level said you'd find hard"],
    lowers: ["Words that run together or get swallowed", "Missing a drill that should have been comfortable"],
  },
  cadence: {
    what: "The music of your speech: pace, pauses and pitch.",
    feeds: [
      "Pace and pause reading, Mark it up, Move it and shadowing",
      "Every recorded take: your pace, pauses at full stops and pitch range",
      "Tono AI's scores for pace, pauses, pitch variety and emphasis, which lead when a take is judged",
    ],
    raises: ["A pace of 130 to 160 words a minute", "A beat of silence at most full stops", "A voice that rises and falls instead of staying level"],
    lowers: ["Racing past about 175 words a minute", "Sentences that run into each other", "A flat, narrow pitch"],
  },
  impromptu: {
    what: "Thinking on your feet: finding words quickly and giving an answer a shape.",
    feeds: [
      "Category and letter sprints, word chains, random-word stories and Sixty seconds",
      "Every recorded take: filler words and mid-sentence stalls",
      "Tono AI's scores for structure, staying on the point and clarity, which lead when a take is judged",
    ],
    raises: ["Leading with your point, then a reason or an example", "A closed-mouth pause in place of \"um\"", "Finishing each sentence before pausing"],
    lowers: ["More than a few filler words a minute", "Long gaps in the middle of a phrase", "Answers that circle without a clear point"],
  },
  confidence: {
    what: "How sure you come across: eye contact, a face that moves, a voice that carries.",
    feeds: [
      "Projection and one-breath drills, guided exercises and warm-ups",
      "Every recorded take with video: eye contact, expression and head position",
      "Tono AI's scores for eye contact, expression and conviction, which lead when a take is judged",
    ],
    raises: ["Looking at the lens most of the time", "Letting your face move with what you say", "Ending on a clear statement, then stopping"],
    lowers: ["Looking away for long stretches", "Hedges like \"I think\" and \"kind of\"", "Trailing off at the end"],
  },
  conversation: {
    what: "Keeping a back-and-forth going: replying, asking and adding.",
    feeds: ["Conversation drills, such as Reply window, Ask about it and Echo – Ask – Add", "It's scored on what you did, like replying and asking back, never on finding the perfect answer"],
    raises: ["Starting your reply within a couple of seconds", "Asking something back", "Adding a little of yourself"],
    lowers: ["Long silences before you reply", "Short answers that close the conversation down"],
  },
};
