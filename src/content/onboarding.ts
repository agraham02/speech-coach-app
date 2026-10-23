import type { EventKind, Obstacle, PracticePlace, SpeakingContext } from "../domain/profile";

// Onboarding questions (docs/history/practice-expansion-plan.md §8). One question per
// screen, most answered with a tap. Every question changes something — see
// the "changes" note on each, and domain/profile.ts for how.

export type QuestionId =
  | "name"
  | "contexts"
  | "obstacles"
  | "event"
  | "comfort"
  | "video"
  | "experience"
  | "english"
  | "speech"
  | "voiceNote"
  | "innerCritic"
  | "goal"
  | "minutes"
  | "days"
  | "anchor"
  | "place"
  | "reminders"
  | "transcription"
  | "cloud"
  | "retention"
  | "why";

export interface Option<T extends string = string> {
  key: T;
  label: string;
  detail?: string;
}

export interface Question {
  id: QuestionId;
  chapter: 0 | 1 | 2;
  title: string;
  subtitle?: string;
  optional?: boolean;
  // what the answer changes — shown as a small footnote, so nothing feels arbitrary
  changes: string;
}

export const CHAPTERS = ["About you", "How you speak", "Your practice"] as const;

export const QUESTIONS: Question[] = [
  { id: "name", chapter: 0, title: "What should we call you?", optional: true, changes: "Used in the app's messages to you." },
  {
    id: "contexts",
    chapter: 0,
    title: "Where do you most want to speak better?",
    subtitle: "Pick any that fit.",
    changes: "Your practice prompts and partner scenarios lean toward these situations.",
  },
  {
    id: "obstacles",
    chapter: 0,
    title: "What gets in your way?",
    subtitle: "Pick any that fit — be honest, this is just for you.",
    changes: "Your first weeks lean toward the skills that fix these.",
  },
  {
    id: "event",
    chapter: 0,
    title: "Is anything coming up?",
    subtitle: "An interview, a talk, a toast — something with a date.",
    optional: true,
    changes: "Your plan builds toward it, prompts shift toward it in the last two weeks, and Today counts down. You can add more events later.",
  },
  {
    id: "comfort",
    chapter: 0,
    title: "How do you feel about speaking in front of people right now?",
    changes: "Sets how gently the app starts. We'll ask again monthly, so you can see it change.",
  },
  {
    id: "video",
    chapter: 0,
    title: "How do you feel about seeing yourself on video?",
    changes: "Whether recordings start with your face hidden, and whether results open on the video.",
  },
  {
    id: "experience",
    chapter: 0,
    title: "Have you done speaking training before?",
    changes: "Lesson explainers start collapsed if you've done a lot. Your starting level stays the same either way.",
  },
  {
    id: "english",
    chapter: 1,
    title: "Is English your first language?",
    optional: true,
    changes: "We coach clarity, never accent. Reading drills ask a little less of speech recognition.",
  },
  {
    id: "speech",
    chapter: 1,
    title: "Do you stutter, or have another speech difference you'd like us to know about?",
    optional: true,
    changes: "With stuttering, repetitions, blocks and pauses never count as fillers or slips anywhere in the app.",
  },
  { id: "voiceNote", chapter: 1, title: "Anything about your voice we should know?", optional: true, changes: "Kept on your profile so it's there when you need it." },
  {
    id: "innerCritic",
    chapter: 1,
    title: "What does your inner critic say when you speak?",
    subtitle: "Pick any that sound familiar, or add your own. Nobody else sees these.",
    optional: true,
    changes: "They go in Talk back, where you can look at each one fairly — what's true, what isn't, and a fairer way to say it.",
  },
  {
    id: "goal",
    chapter: 2,
    title: "How many times a day do you want to practice?",
    changes: "The first is your daily plan; the rest are 4-minute top-ups. Your streak only ever needs one.",
  },
  { id: "minutes", chapter: 2, title: "How long is a session?", changes: "The length of your daily plan. Change it any day on Today." },
  { id: "days", chapter: 2, title: "Which days?", changes: "Reminders only on these days — and a day off never breaks your streak." },
  {
    id: "anchor",
    chapter: 2,
    title: "When will you practice?",
    subtitle: "Tie it to something you already do every day.",
    changes: "“After I ___, I practice” — a plan tied to a habit is far more likely to happen. It shows on Today and in your reminders.",
  },
  { id: "place", chapter: 2, title: "Where will you usually practice?", changes: "Somewhere shared? Top-ups skip the loud drills, and camera checks are skipped in the car." },
  { id: "reminders", chapter: 2, title: "Want a reminder?", changes: "One nudge per session, skipped once it's done." },
  {
    id: "transcription",
    chapter: 2,
    title: "Get the transcription model",
    subtitle: "Tono turns what you say into text on your phone. The model that does it is too big to ship inside the app, so it downloads once.",
    changes: "Start the download and carry on: it keeps going in the background. Until it finishes, a banner shows its progress, and takes you save are transcribed afterwards.",
  },
  {
    id: "cloud",
    chapter: 2,
    title: "Turn on your AI coach",
    subtitle: "Your phone can count. It can't tell whether your answer made sense or your tone landed — an AI coach can, so Tono leans on it for your scores, your starting point and your plan.",
    optional: true,
    changes: "Skip it and everything runs on this phone. Turn it on any time in Settings → Deep reviews.",
  },
  { id: "retention", chapter: 2, title: "How long should full videos be kept?", changes: "Older videos are cleared automatically; the best and the toughest take from each month are always kept." },
  {
    id: "why",
    chapter: 2,
    title: "What will be different when this works?",
    subtitle: "In your own words. We'll show it back to you on the hard days.",
    optional: true,
    changes: "Shown back to you when a streak breaks, and at your 30-day check-in.",
  },
];

export const CONTEXT_OPTIONS: Option<SpeakingContext>[] = [
  { key: "meetings", label: "Work meetings" },
  { key: "presentations", label: "Presentations" },
  { key: "interviews", label: "Job interviews" },
  { key: "social", label: "Dating & social" },
  { key: "everyday", label: "Everyday conversation" },
  { key: "camera", label: "On camera" },
  { key: "leading", label: "Leading a team" },
  { key: "school", label: "School" },
];

export const OBSTACLE_OPTIONS: Option<Obstacle>[] = [
  { key: "ramble", label: "I ramble" },
  { key: "blank", label: "I blank / don't know what to say" },
  { key: "fillers", label: "Filler words" },
  { key: "nerves", label: "Nerves" },
  { key: "monotone", label: "Flat or monotone voice" },
  { key: "fast", label: "I talk too fast" },
  { key: "mumble", label: "I mumble / words run together" },
  { key: "quiet", label: "My voice is too quiet" },
  { key: "unsure", label: "I sound unsure" },
  { key: "eye_contact", label: "Eye contact" },
  { key: "feelings", label: "Putting feelings into words" },
];

export const EVENT_OPTIONS: Option<EventKind>[] = [
  { key: "interview", label: "Interview" },
  { key: "talk", label: "Talk or presentation" },
  { key: "toast", label: "Toast or speech" },
  { key: "pitch", label: "Pitch" },
  { key: "date", label: "A date" },
  { key: "other", label: "Something else" },
];

export const EVENT_WHEN: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "This week", days: 5 },
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
  { label: "In 2–3 months", days: 75 },
];

export const VIDEO_OPTIONS: Option<"fine" | "awkward" | "rather_not">[] = [
  { key: "fine", label: "It's fine" },
  { key: "awkward", label: "A bit awkward" },
  { key: "rather_not", label: "I'd rather not" },
];

export const EXPERIENCE_OPTIONS: Option<"none" | "little" | "course" | "lots">[] = [
  { key: "none", label: "None" },
  { key: "little", label: "A little — videos, books" },
  { key: "course", label: "A course or Toastmasters" },
  { key: "lots", label: "Lots" },
];

export const ENGLISH_OPTIONS: Option<"yes" | "no" | "unsaid">[] = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "unsaid", label: "Prefer not to say" },
];

export const SPEECH_OPTIONS: Option<"none" | "stutter" | "other" | "unsaid">[] = [
  { key: "none", label: "No" },
  { key: "stutter", label: "Yes, I stutter" },
  { key: "other", label: "Yes, something else" },
  { key: "unsaid", label: "Prefer not to say" },
];

export const PLACE_OPTIONS: Option<PracticePlace>[] = [
  { key: "private", label: "A room to myself" },
  { key: "car", label: "In the car (parked)" },
  { key: "shared", label: "Office or shared space" },
  { key: "walking", label: "Walking outside" },
];

// The habit to tie practice to, and the hour it suggests for the reminder.
export const ANCHOR_OPTIONS: { key: string; label: string; anchor: string; hour: number }[] = [
  { key: "coffee", label: "After my morning coffee", anchor: "After your morning coffee", hour: 8 },
  { key: "commute", label: "On my commute", anchor: "On your commute", hour: 8 },
  { key: "lunch", label: "On my lunch break", anchor: "On your lunch break", hour: 12 },
  { key: "work", label: "After work", anchor: "After work", hour: 18 },
  { key: "bed", label: "Before bed", anchor: "Before bed", hour: 21 },
];

export const RETENTION_OPTIONS: { key: string; label: string; days: number }[] = [
  { key: "30", label: "30 days, plus two keepsakes each month", days: 30 },
  { key: "7", label: "7 days, plus two keepsakes each month", days: 7 },
  { key: "0", label: "Keep everything", days: 0 },
];
