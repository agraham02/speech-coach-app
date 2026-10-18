import type { SkillId } from "../theme/tokens";
import { dateFromISODate, daysBetween } from "../utils/dateUtils";
import type { UpcomingEvent } from "./events";

// What onboarding learns about you, and what each answer changes. Every
// question in content/onboarding.ts maps to something here — a question
// that changes nothing doesn't belong in onboarding. Pure.

export type SpeakingContext = "meetings" | "presentations" | "interviews" | "social" | "everyday" | "camera" | "leading" | "school";
export type Obstacle =
  | "ramble"
  | "blank"
  | "fillers"
  | "nerves"
  | "monotone"
  | "fast"
  | "mumble"
  | "quiet"
  | "unsure"
  | "eye_contact"
  | "feelings";
export type EventKind = "interview" | "talk" | "toast" | "pitch" | "date" | "other";
export type PracticePlace = "private" | "car" | "shared" | "walking";

export interface UserProfile {
  name?: string;
  contexts: SpeakingContext[];
  obstacles: Obstacle[];
  // Legacy: the one event onboarding used to keep here. Events live in the
  // speaking_events table now (domain/events.ts); this is read once on
  // launch, imported, and cleared.
  event?: { date: string; kind: EventKind; note?: string } | null;
  // 1 "I avoid it" … 5 "I enjoy it"
  speakingComfort?: number;
  videoComfort?: "fine" | "awkward" | "rather_not";
  experience?: "none" | "little" | "course" | "lots";
  englishFirst?: "yes" | "no" | "unsaid";
  speechDifference?: "none" | "stutter" | "other" | "unsaid";
  voiceNote?: string;
  // What the inner critic says (Talk back): the preset worries picked, and
  // ones written in. Kept in step with the Talk back list.
  innerCritic?: { presets: string[]; custom: string[] };
  practicePlace?: PracticePlace;
  why?: string;
  // When onboarding started (YYYY-MM-DD) — the goal boosts fade from here.
  startedAt: string;
  // Resume point inside the question list.
  onboardingStep?: number;
  onboardingCompletedAt?: string | null;
}

export const EMPTY_PROFILE = (today: string): UserProfile => ({ contexts: [], obstacles: [], startedAt: today });

// --- "What gets in your way" → which skills the plan leans toward -----------

const OBSTACLE_SKILLS: Record<Obstacle, SkillId[]> = {
  ramble: ["conversation", "impromptu"],
  blank: ["impromptu", "conversation"],
  fillers: ["cadence", "impromptu"],
  nerves: ["confidence"],
  monotone: ["cadence"],
  fast: ["cadence"],
  mumble: ["articulation"],
  quiet: ["confidence"],
  unsure: ["confidence", "cadence"],
  eye_contact: ["confidence"],
  feelings: [],
};

const EVENT_SKILLS: Record<EventKind, SkillId[]> = {
  interview: ["impromptu", "confidence"],
  talk: ["cadence", "confidence"],
  toast: ["cadence", "confidence"],
  pitch: ["cadence", "impromptu"],
  date: ["conversation"],
  other: ["confidence"],
};

// The boost each obstacle adds to a skill's focus weight on day one. The
// daily plan's own weights run 0-1, so this is a lean, not an override.
const BOOST_PER_OBSTACLE = 0.12;
const MAX_BOOST = 0.3;
const FADE_DAYS = 28;

// Extra focus weight per skill: from your answers, fading to nothing over
// about four weeks as real practice data takes over — except for the skills
// the next event needs, which hold until the event.
export function priorityFor(profile: UserProfile | null, today: string, event: UpcomingEvent | null = null): Partial<Record<SkillId, number>> {
  const out: Partial<Record<SkillId, number>> = {};
  if (event && event.date >= today) {
    for (const skill of EVENT_SKILLS[event.kind]) out[skill] = 0.2;
  }
  if (!profile) return out;
  const age = daysBetween(dateFromISODate(profile.startedAt), dateFromISODate(today));
  const fade = Math.max(0, 1 - age / FADE_DAYS);
  const fromObstacles: Partial<Record<SkillId, number>> = {};
  for (const o of profile.obstacles) {
    for (const skill of OBSTACLE_SKILLS[o]) fromObstacles[skill] = Math.min(MAX_BOOST, (fromObstacles[skill] ?? 0) + BOOST_PER_OBSTACLE * fade);
  }
  for (const k of Object.keys(fromObstacles) as SkillId[]) out[k] = Math.max(out[k] ?? 0, fromObstacles[k]!);
  for (const k of Object.keys(out) as SkillId[]) out[k] = Math.round(out[k]! * 1000) / 1000;
  return out;
}

export function daysUntilEvent(event: UpcomingEvent | null, today: string): number | null {
  if (!event || event.date < today) return null;
  return daysBetween(dateFromISODate(today), dateFromISODate(event.date));
}

// --- answers → app behavior ---------------------------------------------------

export interface ProfileDefaults {
  // Hide your own face while recording (1.5 low comfort, 1.6 "rather not").
  recordBlind: boolean;
  // Practicing somewhere shared or walking: no projection / Move It in top-ups.
  quiet: boolean;
  // Camera framing checks don't apply (car, walking, or no video wanted).
  audioFirst: boolean;
  // A lot of training already: start lesson explainers collapsed.
  collapseTeach: boolean;
  // Live recognition is less sure of non-native speech: relax word-following targets.
  relaxAccuracy: boolean;
  // Stuttering: hesitations, repetitions and blocks never count as fillers or slips.
  stutterMode: boolean;
  // Low comfort: the warm-up is on by default.
  warmUp: boolean;
  // Feelings were a goal: feature Feeling of the Week on Today.
  featureFeelings: boolean;
}

export function defaultsFromProfile(profile: UserProfile | null): ProfileDefaults {
  const comfort = profile?.speakingComfort ?? 3;
  const place = profile?.practicePlace;
  return {
    recordBlind: comfort <= 2 || profile?.videoComfort === "rather_not",
    quiet: place === "shared" || place === "walking",
    audioFirst: place === "car" || place === "walking" || profile?.videoComfort === "rather_not",
    collapseTeach: profile?.experience === "lots",
    relaxAccuracy: profile?.englishFirst === "no",
    stutterMode: profile?.speechDifference === "stutter",
    warmUp: comfort <= 2 || (profile?.obstacles.includes("nerves") ?? false),
    featureFeelings: profile?.obstacles.includes("feelings") ?? false,
  };
}

// The kind of prompt that rehearses for each kind of event.
export const EVENT_CONTEXT: Record<EventKind, SpeakingContext> = {
  interview: "interviews",
  talk: "presentations",
  toast: "presentations",
  pitch: "presentations",
  date: "social",
  other: "everyday",
};

// Which kinds of prompts to lean toward for reps (1.2), and in event mode,
// the event's own kind for the last two weeks.
export function promptContexts(profile: UserProfile | null, today: string, event: UpcomingEvent | null = null): SpeakingContext[] {
  const days = daysUntilEvent(event, today);
  if (event && days != null && days <= 14) return [EVENT_CONTEXT[event.kind]];
  return profile?.contexts ?? [];
}
