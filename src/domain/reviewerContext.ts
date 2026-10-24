import { CONTEXT_OPTIONS, OBSTACLE_OPTIONS } from "../content/onboarding";
import { daysUntilEvent, type UserProfile } from "./profile";
import type { UpcomingEvent } from "./events";

// What Tono AI is told about the speaker, from what they answered in
// onboarding, so its feedback can speak to what they're actually working on
// ("you said you ramble: here's where it happened"). Only what helps a judge:
// where they want to speak, what gets in their way, anything coming up, how
// much training they've had, how they feel about speaking, and a note about
// their voice. Left out on purpose: their name, their age, their reasons
// ("why"), the worries in Talk back, and speech differences (stuttering has
// its own flag that changes how a take is judged). Shown to the person in
// Settings, and sent only with their say-so.
//
// The phone sends these as facts; the server writes them into the prompt
// (supabase/functions/_shared/prompts/common.ts speakerSection). Pure.

const MAX_NOTE = 160;

// Free text from the person, cut short and stripped of control characters
// and quote marks (the server cleans it again).
function clean(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F"“”]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
}

const labelOf = <T extends string>(options: { key: T; label: string }[], key: T): string => options.find((o) => o.key === key)?.label ?? key;

const EVENT_NAMES: Record<string, string> = {
  interview: "a job interview",
  talk: "a talk or presentation",
  toast: "a toast or speech",
  pitch: "a pitch",
  date: "a date",
  other: "something they want to speak well at",
};

const TRAINING: Record<string, string> = {
  none: "none",
  little: "a little (videos, books)",
  course: "a course or Toastmasters",
  lots: "a lot",
};

// The shape the server reads (prompts/common.ts speakerSchema).
export interface SpeakerFacts {
  contexts: string[];
  obstacles: string[];
  event: { kind: string; title: string | null; daysAway: number } | null;
  experience: string | null;
  comfort: number | null;
  englishFirst: boolean | null;
  voiceNote: string | null;
}

export function speakerFacts(profile: UserProfile | null, today: string, event: UpcomingEvent | null = null): SpeakerFacts | null {
  if (!profile) return null;
  const days = daysUntilEvent(event, today);
  const facts: SpeakerFacts = {
    contexts: profile.contexts.map((c) => labelOf(CONTEXT_OPTIONS, c)),
    obstacles: profile.obstacles.map((o) => labelOf(OBSTACLE_OPTIONS, o)),
    event: event && days != null ? { kind: EVENT_NAMES[event.kind] ?? "an event", title: event.title ? clean(event.title) || null : null, daysAway: days } : null,
    experience: profile.experience ? (TRAINING[profile.experience] ?? profile.experience) : null,
    comfort: profile.speakingComfort ?? null,
    englishFirst: profile.englishFirst === "no" ? false : profile.englishFirst === "yes" ? true : null,
    voiceNote: profile.voiceNote ? clean(profile.voiceNote) || null : null,
  };
  const empty =
    !facts.contexts.length && !facts.obstacles.length && !facts.event && !facts.experience && facts.comfort == null && facts.englishFirst !== false && !facts.voiceNote;
  return empty ? null : facts;
}

// What Settings shows, one line per fact: exactly what goes to Tono AI.
export function speakerLines(facts: SpeakerFacts | null): string[] {
  if (!facts) return [];
  const lines: string[] = [];
  if (facts.contexts.length) lines.push(`They most want to speak better in: ${facts.contexts.map((c) => c.toLowerCase()).join(", ")}.`);
  if (facts.obstacles.length) lines.push(`What they say gets in their way: ${facts.obstacles.join("; ")}.`);
  if (facts.event) {
    lines.push(`Coming up in about ${facts.event.daysAway} ${facts.event.daysAway === 1 ? "day" : "days"}: ${facts.event.kind}${facts.event.title ? ` (“${facts.event.title}”)` : ""}.`);
  }
  if (facts.experience) lines.push(`Speaking training so far: ${facts.experience}.`);
  if (facts.comfort != null) lines.push(`How comfortable they feel speaking in front of people: ${facts.comfort} out of 5.`);
  if (facts.englishFirst === false) lines.push("English isn't their first language.");
  if (facts.voiceNote) lines.push(`About their voice, in their words: “${facts.voiceNote}”.`);
  return lines;
}
