import type { SpeakingContext } from "../domain/profile";
import type { PromptTask } from "../domain/promptTask";
import { makeAdhocPrompt, type Prompt } from "../domain/sessionTypes";

// Prompts for the situations you said you want to speak better in
// (onboarding 1.2). Reps lean toward these, and toward an upcoming event's
// kind in its last two weeks. Used as ad-hoc prompts, not seeded into the
// prompt library.
//
// Each one says what to DO and supplies whatever the speaker would otherwise
// have to guess: who they're talking to and about what. Where a prompt asks
// for only a part of a talk ("Closing only"), it says so, names a topic, and
// carries the matching task, so the reviewer doesn't expect a whole talk.
// "Make up the details" means invented specifics are the point.
export interface ContextPrompt {
  text: string;
  task: PromptTask;
}

const p = (task: PromptTask, text: string): ContextPrompt => ({ task, text });

export const CONTEXT_PROMPTS: Record<SpeakingContext, ContextPrompt[]> = {
  meetings: [
    p("scenario", "Give a 60-second update on a project you're working on, or make one up: what it is, where it stands, what's next."),
    p("scenario", "Your team is about to approve a decision you disagree with. Disagree politely and say what you'd do instead. Make up the details."),
    p("scenario", "Summarize a meeting you were just in for a colleague who missed it. Make up the details: what was decided, and what happens next."),
    p("scenario", "Your manager wants a project done by Friday and you can't make it. Ask to move the deadline, and say why. Make up the details."),
    p("scenario", "Tell your team about a problem you spotted before anyone else did: what it is, why it matters, what you suggest. Real or made up."),
    p("persuade", "Pitch your team one change that would make your meetings shorter, and ask them to try it for a month."),
    p("scenario", "A colleague asks you to take on one more project this month. Push back without saying no outright."),
    p("closing", "Closing only: wrap up a meeting about planning a team offsite. Recap what was decided and who does what. Make up the details."),
  ],
  presentations: [
    p("opening", "Opening only: start a talk on something you know well with a short story, not an agenda. Stop once the audience knows what the talk is about."),
    p("explain", "Explain the one idea you'd want an audience to remember from you, and why it matters to them."),
    p("scenario", "Pick one number from your work or life that matters. Say it, then make people feel why it's big."),
    p("scenario", "You've just finished a talk. Someone asks: \"What's the weakest part of your argument?\" Answer them honestly."),
    p("closing", "Closing only: you've just given a talk on why everyone should learn to cook. Sum up the one idea, then end on a line people will remember."),
    p("explain", "Explain a complicated process you know, or pick one, to people who've never seen it: say what it's for, then walk through the steps."),
    p("scenario", "Introduce yourself to a room of strangers before you speak: who you are, and why you're the one talking."),
    p("persuade", "Make the case to a skeptical audience for something you believe in, and ask them to try it."),
  ],
  interviews: [
    p("answer", "Tell me about yourself."),
    p("story", "Describe a time you failed and what you did next."),
    p("answer", "Why do you want this role?"),
    p("story", "Tell me about a conflict with a coworker and how it ended."),
    p("answer", "What's a weakness you're actively working on?"),
    p("story", "Describe a project you're proud of — your part specifically."),
    p("answer", "Where do you see yourself in a few years?"),
    p("answer", "Do you have any questions for us?"),
  ],
  social: [
    p("scenario", "Someone at a party asks what you do. Answer in a way that makes them want to hear more."),
    p("story", "Tell a funny thing that happened to you this month."),
    p("scenario", "Introduce two friends who haven't met, and give them something to talk about. Make up who they are."),
    p("scenario", "A friend just got back from a trip. Keep the conversation going: react, ask, add something of your own. Make up the trip."),
    p("answer", "Tell someone about a show or book you can't stop thinking about."),
    p("story", "Talk about the best meal you've had and why it stuck."),
    p("answer", "Describe your ideal weekend to someone you just met."),
    p("scenario", "Someone asks what you're into lately. Tell them, and make them curious."),
  ],
  everyday: [
    p("answer", "Explain to a friend why you changed your mind about something."),
    p("explain", "Give directions to your favorite spot to someone who's never been, without using a map."),
    p("persuade", "Recommend something you love to a friend who'd never pick it, and say why they'd like it."),
    p("story", "Tell a friend about your day so it actually sounds interesting."),
    p("scenario", "Ask a neighbor for a favor. Make up what it is."),
    p("explain", "Explain a hobby to someone who's never tried it."),
    p("scenario", "Return something to a store and explain what went wrong. Make up the item."),
    p("answer", "Talk about a habit you're trying to build, and what's getting in the way."),
  ],
  camera: [
    p("opening", "Opening only: the first 30 seconds of a video about something you know well. Hook viewers, then tell them what they'll get."),
    p("explain", "Explain one tip from your field in under a minute, as if to a viewer."),
    p("scenario", "React to a piece of news in your field, real or made up: what it means for the people watching."),
    p("story", "Tell your audience about a mistake you made and what it taught you."),
    p("opening", "Opening only: introduce yourself at the start of a video to people who've never heard of you. Who you are, and why they should stay."),
    p("scenario", "Review something you bought recently, honestly. Would you tell a friend to buy it?"),
    p("explain", "Walk through how you'd solve a common problem in your field, step by step, for a viewer."),
    p("closing", "Closing only: end a video about your favorite hobby. Sum it up and give viewers a reason to come back."),
  ],
  leading: [
    p("scenario", "Tell your team their project is being cancelled, without losing them. Make up the details."),
    p("scenario", "Thank someone on your team in front of everyone, and be specific about what they did. Make up who and what."),
    p("scenario", "Explain a decision you made that not everyone agreed with, to the people it affects. Make up the details."),
    p("scenario", "You lead a small team. Set the direction for the next three months: where you're going, why, and the first step. Make up the details."),
    p("scenario", "A teammate's reports keep coming in late. Give them that feedback, kindly and clearly."),
    p("scenario", "Rally a tired team the day before a deadline. Make up the project."),
    p("scenario", "Explain to your team why a launch failed, without blaming anyone. Make up the details."),
    p("scenario", "Welcome a new person to the team in front of everyone, and say what they'll bring. Make up who they are."),
  ],
  school: [
    p("explain", "Explain the main idea of something you're studying to a classmate who missed the lesson."),
    p("debate", "Make an argument in a class discussion on any topic, and back it up with a reason and an example."),
    p("scenario", "Present a project you've done, or make one up, in two minutes: the question, what you found, why it matters."),
    p("scenario", "A teacher asks a question you only half know the answer to. Answer it honestly, without bluffing."),
    p("scenario", "Ask a professor for help with something you're stuck on. Make up the subject."),
    p("explain", "Summarize something you've read recently for a classmate: the main point, and what stayed with you."),
    p("scenario", "A classmate says something you disagree with. Disagree respectfully, and say why. Make up the point."),
    p("explain", "Explain why your topic matters to people outside your class."),
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

// One prompt from a situation, as an ad-hoc prompt that carries its task.
export function randomContextPrompt(context: SpeakingContext, random: () => number = Math.random): Prompt {
  const list = CONTEXT_PROMPTS[context];
  const pick = list[Math.floor(random() * list.length)];
  return makeAdhocPrompt(pick.text, CONTEXT_LABELS[context], pick.task);
}
