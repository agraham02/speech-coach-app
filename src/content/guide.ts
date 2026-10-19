// The app guide: the first time you reach each tab or feature after
// onboarding, a short tour of it — never a tour of the whole app up front.
// A step with a `target` scrolls that part of the screen into view, dims
// everything else and points at it; a step without one is a plain card.
// Steps whose target isn't on screen (a card that only shows some days) are
// skipped. Keep tours to four steps or fewer.

export type TourTargetId =
  | "today.plan"
  | "today.path"
  | "today.skills"
  | "learn.skills"
  | "learn.path"
  | "learn.mode"
  | "you.progress"
  | "you.innerVoice"
  | "progress.streak"
  | "progress.skills"
  | "progress.bySkill"
  | "practice.start"
  | "library.videos"
  | "lesson.teach"
  | "lesson.practice"
  | "recording.blind"
  | "recording.record"
  | "result.score"
  | "result.breakdown"
  | "result.steps"
  | "lineRep.text"
  | "lineRep.legend"
  | "lineRep.record"
  | "speech.legend";

export interface GuideStep {
  title: string;
  body: string;
  target?: TourTargetId;
  // Untargeted steps only: where the card sits. Screens with a button at
  // the bottom take theirs at the top.
  placement?: "top" | "bottom";
}

export const GUIDES = {
  today: [
    { title: "This is Today", body: "Everything for today in one place: your plan, your skills, and anything that's due.", placement: "bottom" },
    {
      title: "Your plan for today",
      body: "Start session runs a 5–12 minute plan: a warm-up, a line to say with feeling, then the next lesson on your path. Change the length here.",
      target: "today.plan",
    },
    { title: "This week", body: "Your path has two units on the go, from different skills, and days take turns between them. Each says why it's there for you.", target: "today.path" },
    { title: "Your five skills", body: "Each climbs five stages, Foundations to Polished, and together they make your speaker level. Tap one to see what moved it.", target: "today.skills" },
  ],
  learn: [
    { title: "Your path", body: "Every unit, in the order that fits what you told us and what the skill check heard, with the reason for each. It shifts when your goals do.", target: "learn.path" },
    { title: "All skills", body: "Every lesson, grouped by skill. Each one explains a move, then has you practice it. Everything is open, so jump anywhere.", target: "learn.mode" },
  ],
  you: [
    { title: "You", body: "Your streak, skills and progress. A freeze covers a missed day, so one slip doesn't end a streak.", target: "you.progress" },
    { title: "Just for you", body: "Rewind your day out loud, note three things you like about yourself, and talk back to your inner critic. Nobody else sees these.", target: "you.innerVoice" },
  ],
  progress: [
    { title: "Your streak", body: "Every day you practiced, and the days a freeze covered. Every 7 practice days earns a freeze, and you can hold two.", target: "progress.streak" },
    { title: "Skill mastery", body: "Tap any skill to see how its number works and what moved it.", target: "progress.skills" },
    { title: "One skill at a time", body: "Pick a skill to see its drill scores and levels. Drills get harder as you pass them, so a steady score means you're climbing.", target: "progress.bySkill" },
  ],
  library: [
    { title: "Library", body: "Every take you've recorded, newest first. Open one to rewatch it and see its scores.", placement: "bottom" },
    { title: "Progress videos", body: "The best and the toughest take of each month are kept here, so you can see how far you've come.", target: "library.videos" },
  ],
  practice: [
    { title: "Practice anything", body: "Outside today's plan: answer a prompt, record freely, mark up a line, or run a drill.", target: "practice.start" },
  ],
  lesson: [
    { title: "How lessons work", body: "First the why and the how, in a minute or two. Read it once; it's here whenever you want it again.", target: "lesson.teach" },
    { title: "Then practice it", body: "Do the steps in order. Drills adapt: pass and the next one is a little harder; miss and it eases off.", target: "lesson.practice" },
  ],
  drill: [
    { title: "Drills listen live", body: "Just speak. It follows along as you go, and keeps your score, not your audio.", placement: "top" },
  ],
  recording: [
    { title: "Recording a take", body: "Talk to the lens like it's a person. Your phone measures the take, and your AI coach reviews it if you've turned that on.", placement: "top" },
    {
      title: "Hide yourself",
      body: "Turn this on to record without watching yourself. Tap the screen to see the question and time left; you'll feel two taps at 30 seconds and three at 10.",
      target: "recording.blind",
    },
    { title: "Start when you're ready", body: "Tap to start, and tap again to stop. Restart throws a bad start away.", target: "recording.record" },
  ],
  result: [
    { title: "Your score", body: "Built from what your phone measured and, once it's in, your AI coach's review — which leads where it could see more.", target: "result.score" },
    { title: "Why it's this number", body: "Tap any part to see what raised it, what took points away, and what would earn them back.", target: "result.breakdown" },
    { title: "What's still working", body: "Each part of the analysis, and a retry if one didn't finish. Add a deep review here if this take doesn't have one.", target: "result.steps" },
  ],
  markItUp: [
    { title: "Mark it up", body: "Mark where to pause, which word to stress, and where your voice rises or falls. Then read the line the way you marked it.", placement: "top" },
  ],
  lineRep: [
    {
      title: "Read the marks",
      body: "Bold, underlined words get the stress. ↗ means your voice goes up, ↘ means it comes down, | is a short pause and ‖ a long one.",
      target: "lineRep.text",
    },
    { title: "The key", body: "Tap a mark to hide it and practice one thing at a time. \"What do the marks mean?\" explains each one.", target: "lineRep.legend" },
    { title: "Hear yourself", body: "Record each read, then play it back. It's the fastest way to hear whether the marks came through.", target: "lineRep.record" },
  ],
  speech: [
    { title: "Study the marks first", body: "Read through with the marks before you record. Tap a mark below to hide it, or open the key to see what each one means.", target: "speech.legend" },
  ],
  guided: [
    { title: "Guided exercises", body: "Follow each step out loud, at your own pace. At the end you rate how it went; there's no wrong answer.", placement: "top" },
  ],
  conversation: [
    { title: "Conversation drills", body: "Someone says a line; reply when it's your turn. What counts is replying and keeping it going, not finding the perfect answer.", placement: "top" },
  ],
} satisfies Record<string, GuideStep[]>;

export type GuideId = keyof typeof GUIDES;
