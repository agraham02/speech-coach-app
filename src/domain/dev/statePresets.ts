import { ANCHOR_OPTIONS, QUESTIONS } from "../../content/onboarding";
import type { UserProfile } from "../profile";

// Named app states for the Dev tab (Dev, App tools, State presets), described
// as plain data so a test can check them against what onboarding really saves.
// services/dev/statePresets.ts applies them.

export type AgeChoice = "under_18" | "adult" | "skipped";

export const AGE_CHOICES: { id: AgeChoice; label: string; yearsOld: number | undefined }[] = [
  { id: "under_18", label: "Under 18 (15 years old)", yearsOld: 15 },
  { id: "adult", label: "Adult (30 years old)", yearsOld: 30 },
  { id: "skipped", label: "Question skipped", yearsOld: undefined },
];

// The birthday that makes this answer true on `today` (YYYY-MM-DD).
export function birthDateFor(choice: AgeChoice, today: string): string | undefined {
  const yearsOld = AGE_CHOICES.find((c) => c.id === choice)?.yearsOld;
  if (yearsOld === undefined) return undefined;
  return `${Number(today.slice(0, 4)) - yearsOld}${today.slice(4, 10)}`;
}

// The standard onboarding answers (docs/testing/emulator-test-plan.md, 11.1):
// work meetings, filler words, comfort 4 of 5, fine on video, no training,
// a room to myself. Onboarding is finished: the same profile fields the last
// question and the setup check leave behind.
export function standardProfile(options: { age: AgeChoice; today: string; now?: Date; name?: string }): UserProfile {
  const birthDate = birthDateFor(options.age, options.today);
  const now = options.now ?? new Date();
  return {
    ...(options.name ? { name: options.name } : {}),
    ...(birthDate ? { birthDate } : {}),
    contexts: ["meetings"],
    obstacles: ["fillers"],
    speakingComfort: 4,
    videoComfort: "fine",
    experience: "none",
    startedAt: options.today,
    onboardingStep: QUESTIONS.length,
    onboardingCompletedAt: now.toISOString(),
  };
}

// "After work", with its hour, exactly as the anchor question saves it.
export const STANDARD_ANCHOR = (() => {
  const option = ANCHOR_OPTIONS.find((a) => a.key === "work")!;
  return { anchor: option.anchor, hour: option.hour };
})();

export const STANDARD_RETENTION_DAYS = 30;
export const STANDARD_PLAN_MINUTES = 5;

export type ThemeChoice = "light" | "dark" | "system";
