import { ANCHOR_OPTIONS, QUESTIONS } from "../../content/onboarding";
import type { AgeRange, UserProfile } from "../profile";

// Named app states for the Dev tab (Dev, App tools, State presets), described
// as plain data so a test can check them against what onboarding really saves.
// services/dev/statePresets.ts applies them.

export type AgeChoice = "under_18" | "adult" | "unsaid" | "skipped";

export const AGE_CHOICES: { id: AgeChoice; label: string; range: AgeRange | undefined }[] = [
  { id: "under_18", label: "Under 18 (13 to 17)", range: "13_17" },
  { id: "adult", label: "Adult (25 to 34)", range: "25_34" },
  { id: "unsaid", label: "Prefer not to say", range: "unsaid" },
  { id: "skipped", label: "Question skipped", range: undefined },
];

export function ageRangeFor(choice: AgeChoice): AgeRange | undefined {
  return AGE_CHOICES.find((c) => c.id === choice)?.range;
}

// The standard onboarding answers (docs/testing/emulator-test-plan.md, 11.1):
// work meetings, filler words, comfort 4 of 5, fine on video, no training,
// a room to myself. Onboarding is finished: the same profile fields the last
// question and the setup check leave behind.
export function standardProfile(options: { age: AgeChoice; today: string; now?: Date; name?: string }): UserProfile {
  const age = ageRangeFor(options.age);
  const now = options.now ?? new Date();
  return {
    ...(options.name ? { name: options.name } : {}),
    ...(age ? { ageRange: age } : {}),
    contexts: ["meetings"],
    obstacles: ["fillers"],
    speakingComfort: 4,
    videoComfort: "fine",
    experience: "none",
    practicePlace: "private",
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
