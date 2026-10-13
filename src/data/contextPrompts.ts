import type { SpeakingContext } from "../domain/profile";

// Prompts for the situations you said you want to speak better in
// (onboarding 1.2). Reps lean toward these, and toward an upcoming event's
// kind in its last two weeks. Used as ad-hoc prompts, not seeded into the
// prompt library.
export const CONTEXT_PROMPTS: Record<SpeakingContext, string[]> = {
  meetings: [
    "Give a 60-second update on something you're working on — what it is, where it stands, what's next.",
    "Disagree, politely, with a decision your team is about to make.",
    "Summarize the last meeting you were in for someone who missed it.",
    "Ask for a deadline to move, and say why.",
    "Explain a problem you found before anyone else noticed it.",
    "Pitch one change that would make your team's meetings shorter.",
    "Push back on a request without saying no outright.",
    "Close a meeting: recap what was decided and who does what.",
  ],
  presentations: [
    "Open a talk on a topic you know well with a story, not an agenda.",
    "Explain the one idea you'd want an audience to remember from you.",
    "Present a number that matters and make the room feel it.",
    "Answer a tough question from the audience you didn't see coming.",
    "Give the last minute of a talk — the part people will remember.",
    "Explain a complicated process to people who've never seen it.",
    "Introduce yourself to a room of strangers before you speak.",
    "Make the case for something people are skeptical about.",
  ],
  interviews: [
    "Tell me about yourself.",
    "Describe a time you failed and what you did next.",
    "Why do you want this role?",
    "Tell me about a conflict with a coworker and how it ended.",
    "What's a weakness you're actively working on?",
    "Describe a project you're proud of — your part specifically.",
    "Where do you see yourself in a few years?",
    "Do you have any questions for us?",
  ],
  social: [
    "Someone at a party asks what you do. Make it interesting.",
    "Tell a funny thing that happened to you this month.",
    "Introduce two friends to each other and give them something to talk about.",
    "Someone mentions they just got back from a trip. Keep the conversation going.",
    "Tell someone about a show or book you can't stop thinking about.",
    "Talk about the best meal you've had and why it stuck.",
    "Describe your ideal weekend to someone you just met.",
    "Someone asks what you're into lately. Tell them.",
  ],
  everyday: [
    "Explain to a friend why you changed your mind about something.",
    "Give directions to your favorite spot without using a map.",
    "Recommend something you love to someone who'd never pick it.",
    "Tell someone about your day, so it actually sounds interesting.",
    "Ask a neighbor for a favor.",
    "Explain a hobby to someone who's never tried it.",
    "Return something to a store and explain what went wrong.",
    "Talk about a habit you're trying to build.",
  ],
  camera: [
    "Record the opening 30 seconds of a video about something you know well.",
    "Explain one tip in your field in under a minute.",
    "React to a piece of news in your area — what it means for people.",
    "Tell your audience about a mistake you made and what it taught you.",
    "Introduce yourself to people who've never heard of you.",
    "Review something you bought recently — honestly.",
    "Walk through how you'd solve a common problem in your field.",
    "End a video with a reason to come back.",
  ],
  leading: [
    "Give your team hard news without losing them.",
    "Thank someone on your team in front of everyone — specifically.",
    "Explain a decision you made that not everyone agreed with.",
    "Set the direction for the next quarter in two minutes.",
    "Give someone feedback they won't want to hear.",
    "Rally a tired team before a deadline.",
    "Explain why something failed without blaming anyone.",
    "Welcome a new person to the team.",
  ],
  school: [
    "Explain the main idea of something you're studying to a classmate.",
    "Make an argument in a class discussion — and back it up.",
    "Present a project's findings in two minutes.",
    "Answer a question you only half know the answer to.",
    "Ask a professor for help with something you're stuck on.",
    "Summarize a reading you just finished.",
    "Disagree with a classmate respectfully.",
    "Explain why your topic matters to people outside the class.",
  ],
};

export const CONTEXT_LABELS: Record<SpeakingContext, string> = {
  meetings: "Meetings",
  presentations: "Presentations",
  interviews: "Interviews",
  social: "Social",
  everyday: "Everyday",
  camera: "On camera",
  leading: "Leading",
  school: "School",
};
