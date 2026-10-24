import { Appearance } from "react-native";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import {
  STANDARD_ANCHOR,
  STANDARD_PLAN_MINUTES,
  STANDARD_RETENTION_DAYS,
  ageRangeFor,
  standardProfile,
  type AgeChoice,
  type ThemeChoice,
} from "../../domain/dev/statePresets";
import { defaultsFromProfile, EMPTY_PROFILE } from "../../domain/profile";
import { todayISODate } from "../../utils/dateUtils";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { completeOnboarding } from "../onboarding/onboarding";
import {
  getCloudReviewDefault,
  getReminderSettings,
  getUserProfile,
  isGuideOff,
  isOnboardingComplete,
  hasTonoConsent,
  markRewindNotificationAsked,
  resetGuide,
  setCloudReviewDefault,
  setDailySessionGoal,
  setGuideOff,
  setPlanMinutes,
  setPracticeAnchor,
  setRecordBlindPref,
  setReminderSettings,
  setTonoConsent,
  setUserProfile,
  setVideoRetentionDays,
  setWarmUpEnabled,
} from "../prefs/prefsStore";
import { resetApp } from "../data/resetApp";
import { setSkipModelDownload } from "./skipModel";

// Dev, App tools, State presets: one tap into a named state, without walking
// the flow. Each preset writes exactly what the real flow writes (the same
// setters onboarding and Settings call), nothing else.

function assertDev(): void {
  if (!SHOW_DEV_TOOLS) throw new Error("State presets are only available in development and preview builds.");
}

// The state a person is in after the standard onboarding answers (see
// docs/testing/emulator-test-plan.md, 11.1): onboarding finished, a daily
// goal of one 5-minute session, "After work", no reminders, videos kept 30
// days, tips off, the skill check put off until tomorrow, Tono AI not
// allowed, and the transcription model step satisfied without the download.
// The OS permissions (camera, microphone, notifications) are the phone's, not
// the app's; grant them with `adb shell pm grant` (the app only remembers that
// the Rewind notification question was asked).
export async function applyOnboardedPreset(options: { age: AgeChoice; name?: string }): Promise<void> {
  assertDev();
  const today = todayISODate();
  const profile = standardProfile({ age: options.age, today, name: options.name });
  // The finishing moves of the last question, as OnboardingScreen.finish() makes them.
  const defaults = defaultsFromProfile(profile);
  setRecordBlindPref(defaults.recordBlind);
  setWarmUpEnabled(defaults.warmUp);
  setUserProfile(profile);
  setDailySessionGoal(1);
  setPlanMinutes(STANDARD_PLAN_MINUTES);
  setPracticeAnchor(STANDARD_ANCHOR.anchor, STANDARD_ANCHOR.hour);
  setReminderSettings({ enabled: false, hour: STANDARD_ANCHOR.hour, extraHours: [], practiceDays: [] });
  setVideoRetentionDays(STANDARD_RETENTION_DAYS);
  setTonoConsent(false);
  setGuideOff(true);
  markRewindNotificationAsked();
  setSkipModelDownload(true);
  // Onboarding finished, the skill check deferred to tomorrow ("Tomorrow").
  completeOnboarding({ deferSkillCheck: true });
  await syncDailyReminder().catch(() => undefined);
}

// The age answer on its own (creating a bare profile when there is none).
export function setAgeAnswer(choice: AgeChoice): void {
  assertDev();
  const current = getUserProfile() ?? EMPTY_PROFILE(todayISODate());
  const range = ageRangeFor(choice);
  const next = { ...current };
  if (range) next.ageRange = range;
  else delete next.ageRange;
  setUserProfile(next);
}

// Tono AI consent as the app keeps it: "Allow Tono AI" sets the consent and
// the judge-every-take default together. Nothing is sent and no account is
// made by setting these; the next judged flow is what would reach the server
// (unless a mock account is on).
export function setConsent(given: boolean): void {
  assertDev();
  setTonoConsent(given);
  if (given) setCloudReviewDefault(true);
}

export async function setRemindersOff(): Promise<void> {
  assertDev();
  setReminderSettings({ ...getReminderSettings(), enabled: false });
  await syncDailyReminder().catch(() => undefined);
}

export function setTips(on: boolean): void {
  assertDev();
  if (on) resetGuide();
  else setGuideOff(true);
}

// The app follows the system appearance; this overrides it for the running
// app (Appearance.setColorScheme), "system" puts the phone's setting back.
export function setTheme(choice: ThemeChoice): void {
  assertDev();
  Appearance.setColorScheme(choice === "system" ? "unspecified" : choice);
}

// The app's own reset (Settings, Help & data, Reset app): the database, every
// preference, videos, Rewind audio, logs and the Dev tab's data. The caller
// then sends the app back to the onboarding gate. The Tono account and
// downloaded models are kept, and so are the dev helpers' own switches (the
// mock account, skip the model download).
export async function resetToFreshInstall(): Promise<void> {
  assertDev();
  await resetApp();
}

export interface PresetSummary {
  onboarded: boolean;
  name: string | null;
  age: string;
  consent: boolean;
  judgeEveryTake: boolean;
  remindersOn: boolean;
  tipsOff: boolean;
}

export function presetSummary(): PresetSummary {
  const profile = getUserProfile();
  return {
    onboarded: isOnboardingComplete(),
    name: profile?.name ?? null,
    age: profile?.ageRange ?? "not answered",
    consent: hasTonoConsent(),
    judgeEveryTake: getCloudReviewDefault(),
    remindersOn: getReminderSettings().enabled,
    tipsOff: isGuideOff(),
  };
}
