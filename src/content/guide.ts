// The app guide: one short tip the first time you reach each tab or feature
// after onboarding — never a tour up front. Tips at the bottom sit above
// the tab bar; screens with a button at the bottom take theirs at the top.

export interface GuideTipContent {
  title: string;
  body: string;
  placement: "top" | "bottom";
}

export const GUIDE_TIPS = {
  today: {
    title: "This is Today",
    body: "Start session runs a 5–12 minute plan — warm-up, a line, then a lesson picked for what you need next. Conversation missions and the feeling of the week live here too.",
    placement: "bottom",
  },
  learn: {
    title: "Learn",
    body: "Every lesson, grouped by skill. Each one explains a move, then has you practice it. Next up marks where you are, but every lesson is open.",
    placement: "bottom",
  },
  progress: {
    title: "Progress",
    body: "Your five skills, your streak, and the numbers behind them — pace, fillers, eye contact and drill levels. Drills get harder as you pass them.",
    placement: "bottom",
  },
  library: {
    title: "Library",
    body: "Every take you've recorded, newest first. Open one to rewatch it and see its scores.",
    placement: "bottom",
  },
  practice: {
    title: "Practice anything",
    body: "Outside today's plan: answer a prompt, record freely, mark up a line, or run a drill.",
    placement: "bottom",
  },
  lesson: {
    title: "How lessons work",
    body: "Read why it matters, then do the practice steps in order. Drills adapt — pass and the next one's a little harder; miss and it eases off.",
    placement: "top",
  },
  drill: {
    title: "Drills listen live",
    body: "Just speak — it follows along as you go. Drills keep your score, not your audio.",
    placement: "top",
  },
  recording: {
    title: "Recording a take",
    body: "Talk to the lens like it's a person. Everything is measured on this phone; the video only leaves it if you send it for a deep review.",
    placement: "top",
  },
  result: {
    title: "Your result",
    body: "These numbers come from the phone listening and watching: pace, pauses, fillers, pitch and eye contact. Start with the one thing under Focus on.",
    placement: "top",
  },
  markItUp: {
    title: "Mark it up",
    body: "Mark where to pause, which word to stress and where your voice rises or falls — then read the line the way you marked it.",
    placement: "top",
  },
  conversation: {
    title: "Conversation drills",
    body: "Someone says a line; reply when it's your turn. What counts is replying and keeping it going — not finding the perfect answer.",
    placement: "top",
  },
  settings: {
    title: "Settings",
    body: "Reminders, practice days, and optional AI deep reviews with your own key. Everything else works without one.",
    placement: "top",
  },
} satisfies Record<string, GuideTipContent>;

export type GuideId = keyof typeof GUIDE_TIPS;
