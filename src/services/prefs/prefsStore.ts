import { createMMKV } from "react-native-mmkv";
import {
  DEFAULT_CONCISE_DURATION_SECONDS,
  DEFAULT_PREP_PHASE_SETTINGS,
  DEFAULT_RECORDING_DURATION_SETTINGS,
  type PrepPhaseSettings,
  type RecordingDurationSettings,
} from "../../domain/recordingSettings";
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from "../../domain/reminderSettings";
import { DEFAULT_CURRICULUM_LEVEL } from "../../domain/curriculum";
import type { DailyGoal } from "../../domain/dailyGoal";
import type { UserProfile } from "../../domain/profile";
import { DEFAULT_RUN, type RunState } from "../../domain/innerVoice/run";
import type { ProviderId } from "../cloud/providers";

const storage = createMMKV({ id: "speech-coach-prefs" });

const KEYS = {
  recordBlind: "recordBlind",
  recordingDurationSettings: "recordingDurationSettings",
  prepPhaseSettings: "prepPhaseSettings",
  reminderSettings: "reminderSettings",
  planYourPointEnabled: "planYourPointEnabled",
  conciseModeSeconds: "conciseModeSeconds",
  warmUpEnabled: "warmUpEnabled",
  curriculumOverride: "curriculumOverride",
  curriculumAutoLevel: "curriculumAutoLevel",
  recordingDurationManuallySet: "recordingDurationManuallySet",
  prepSettingsManuallySet: "prepSettingsManuallySet",
  dailySessionGoal: "dailySessionGoal",
  practiceAnchor: "practiceAnchor",
  userProfile: "userProfile",
  skillCheckPending: "skillCheckPending",
  cloudReviewDefault: "cloudReviewDefault",
  cloudProvider: "cloudProvider",
  cloudModels: "cloudModels",
  cloudConsent: "cloudConsent",
  videoRetentionDays: "videoRetentionDays",
  lastAutoCleanup: "lastAutoCleanup",
  guideSeen: "guideSeen",
  guideOff: "guideOff",
  cloudCalls: "cloudCalls",
  freezeAnnouncedThrough: "freezeAnnouncedThrough",
  selfLikesRun: "selfLikesRun",
  rewindReminder: "rewindReminder",
  rewindCloudConsent: "rewindCloudConsent",
  rewindNotificationsAsked: "rewindNotificationsAsked",
  shareProfileWithReviews: "shareProfileWithReviews",
  audioRetentionDays: "audioRetentionDays",
} as const;

export function getRecordBlindPref(): boolean {
  return storage.getBoolean(KEYS.recordBlind) ?? false;
}

export function setRecordBlindPref(value: boolean): void {
  storage.set(KEYS.recordBlind, value);
}

export function getRecordingDurationSettings(): RecordingDurationSettings {
  const raw = storage.getString(KEYS.recordingDurationSettings);
  if (!raw) return DEFAULT_RECORDING_DURATION_SETTINGS;
  try {
    return { ...DEFAULT_RECORDING_DURATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RECORDING_DURATION_SETTINGS;
  }
}

export function setRecordingDurationSettings(settings: RecordingDurationSettings): void {
  storage.set(KEYS.recordingDurationSettings, JSON.stringify(settings));
}

export function getPrepPhaseSettings(): PrepPhaseSettings {
  const raw = storage.getString(KEYS.prepPhaseSettings);
  if (!raw) return DEFAULT_PREP_PHASE_SETTINGS;
  try {
    return { ...DEFAULT_PREP_PHASE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREP_PHASE_SETTINGS;
  }
}

export function setPrepPhaseSettings(settings: PrepPhaseSettings): void {
  storage.set(KEYS.prepPhaseSettings, JSON.stringify(settings));
}

export function getReminderSettings(): ReminderSettings {
  const raw = storage.getString(KEYS.reminderSettings);
  if (!raw) return DEFAULT_REMINDER_SETTINGS;
  try {
    return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function setReminderSettings(settings: ReminderSettings): void {
  storage.set(KEYS.reminderSettings, JSON.stringify(settings));
}

export function getPlanYourPointEnabled(): boolean {
  return storage.getBoolean(KEYS.planYourPointEnabled) ?? false;
}

export function setPlanYourPointEnabled(value: boolean): void {
  storage.set(KEYS.planYourPointEnabled, value);
}

export function getConciseModeSeconds(): number {
  return storage.getNumber(KEYS.conciseModeSeconds) ?? DEFAULT_CONCISE_DURATION_SECONDS;
}

export function setConciseModeSeconds(value: number): void {
  storage.set(KEYS.conciseModeSeconds, value);
}

// Off by default, same as Prep phase — an opt-in extra step, not a
// surprise addition to the recording flow.
export function getWarmUpEnabled(): boolean {
  return storage.getBoolean(KEYS.warmUpEnabled) ?? false;
}

export function setWarmUpEnabled(value: boolean): void {
  storage.set(KEYS.warmUpEnabled, value);
}

// The manual curriculum pin — `null` means "Auto" (the computed level
// applies). Distinct from curriculumAutoLevel below: this is a user choice,
// that's a read-through cache of the engine's own computation. See
// curriculum.ts / curriculumRepo.ts's getEffectiveCurriculumLevel().
export function getCurriculumOverride(): number | null {
  return storage.contains(KEYS.curriculumOverride) ? (storage.getNumber(KEYS.curriculumOverride) ?? null) : null;
}

export function setCurriculumOverride(level: number | null): void {
  if (level === null) {
    storage.remove(KEYS.curriculumOverride);
  } else {
    storage.set(KEYS.curriculumOverride, level);
  }
}

// Cache of the last computed auto (non-override) curriculum level — written
// only by curriculumRepo.ts's recomputeCurriculumLevel() after it reads the
// DB, read synchronously everywhere else (RecordingScreen's mount,
// DrillsScreen's default tier, HomeScreen's prompt filter) that needs
// "today's level" without a DB round-trip on every read. curriculum_state
// in SQLite stays the source of truth for history; this is purely a
// read-through cache of its latest value.
export function getCurriculumAutoLevel(): number {
  return storage.getNumber(KEYS.curriculumAutoLevel) ?? DEFAULT_CURRICULUM_LEVEL;
}

export function setCurriculumAutoLevel(level: number): void {
  storage.set(KEYS.curriculumAutoLevel, level);
}

// Whether the user has ever explicitly touched the recording-length control
// in the Session Options sheet — distinguishes "never touched, so the
// curriculum's level-driven duration applies" from "explicitly set to
// something (even if it happens to match a curriculum value)." See
// RecordingScreen.tsx's duration resolution.
export function getRecordingDurationManuallySet(): boolean {
  return storage.getBoolean(KEYS.recordingDurationManuallySet) ?? false;
}

export function setRecordingDurationManuallySet(value: boolean): void {
  storage.set(KEYS.recordingDurationManuallySet, value);
}

// Same "never touched, so the curriculum's level-driven value applies"
// precedent as recordingDurationManuallySet above, but for the Prep phase
// controls — see curriculum.ts's curriculumLevelToPrepMode/Seconds and
// RecordingScreen.tsx's prep resolution.
export function getPrepSettingsManuallySet(): boolean {
  return storage.getBoolean(KEYS.prepSettingsManuallySet) ?? false;
}

export function setPrepSettingsManuallySet(value: boolean): void {
  storage.set(KEYS.prepSettingsManuallySet, value);
}

// Daily plan length (Today screen): 5 / 8 / 12 minutes.
const PLAN_MINUTES_KEY = "plan_minutes";

export function getPlanMinutes(): 5 | 8 | 12 {
  const value = storage.getNumber(PLAN_MINUTES_KEY);
  return value === 5 || value === 12 ? value : 8;
}

export function setPlanMinutes(minutes: 5 | 8 | 12): void {
  storage.set(PLAN_MINUTES_KEY, minutes);
}

// How many practice sessions a day you're aiming for (1-3). The first is the
// daily plan; the rest are short top-ups. See domain/dailyGoal.ts.
export function getDailySessionGoal(): DailyGoal {
  const n = storage.getNumber(KEYS.dailySessionGoal);
  return n === 2 || n === 3 ? n : 1;
}

export function setDailySessionGoal(goal: DailyGoal): void {
  storage.set(KEYS.dailySessionGoal, goal);
}

// The habit practice is tied to ("After my morning coffee"), from onboarding
// — used in reminder copy and on Today. null when not set.
export function getPracticeAnchor(): string | null {
  return storage.getString(KEYS.practiceAnchor) ?? null;
}

export function setPracticeAnchor(anchor: string | null): void {
  if (anchor) storage.set(KEYS.practiceAnchor, anchor);
  else storage.remove(KEYS.practiceAnchor);
}

// What onboarding learned (domain/profile.ts). Kept here rather than in
// SQLite because many screens read it synchronously (recording, drills,
// preview defaults). null until onboarding has started.
export function getUserProfile(): UserProfile | null {
  const raw = storage.getString(KEYS.userProfile);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function setUserProfile(profile: UserProfile): void {
  storage.set(KEYS.userProfile, JSON.stringify(profile));
}

export function isOnboardingComplete(): boolean {
  return !!getUserProfile()?.onboardingCompletedAt;
}

// The skill check was put off until "tomorrow, as Day 1".
export function getSkillCheckPending(): boolean {
  return storage.getBoolean(KEYS.skillCheckPending) ?? false;
}

export function setSkillCheckPending(value: boolean): void {
  storage.set(KEYS.skillCheckPending, value);
}

// Defaults for the Preview screen's switches (onboarding 3.7). Cloud review
// is the paid/uploading path, so it's off unless chosen.
export function getCloudReviewDefault(): boolean {
  return storage.getBoolean(KEYS.cloudReviewDefault) ?? false;
}

export function setCloudReviewDefault(value: boolean): void {
  storage.set(KEYS.cloudReviewDefault, value);
}

const PROVIDER_IDS: ProviderId[] = ["gemini", "openai", "anthropic", "openrouter"];

// Which bring-your-own-key provider runs deep reviews (Gemini until chosen).
export function getCloudProvider(): ProviderId {
  const id = storage.getString(KEYS.cloudProvider);
  return id && (PROVIDER_IDS as string[]).includes(id) ? (id as ProviderId) : "gemini";
}

export function setCloudProvider(id: ProviderId): void {
  storage.set(KEYS.cloudProvider, id);
}

function readJson<T>(key: string, fallback: T): T {
  const raw = storage.getString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// A model ID typed in Settings for a provider; null means its default.
export function getCloudModel(id: ProviderId): string | null {
  return readJson<Partial<Record<ProviderId, string>>>(KEYS.cloudModels, {})[id]?.trim() || null;
}

export function setCloudModel(id: ProviderId, model: string): void {
  const models = readJson<Partial<Record<ProviderId, string>>>(KEYS.cloudModels, {});
  if (model.trim()) models[id] = model.trim();
  else delete models[id];
  storage.set(KEYS.cloudModels, JSON.stringify(models));
}

// Providers the user has explicitly allowed to receive their data — asked
// once per provider before the first deep review (App Review 5.1.2(i):
// say where personal data goes, including third-party AI, and get
// permission first).
export function getCloudConsent(): ProviderId[] {
  return readJson<ProviderId[]>(KEYS.cloudConsent, []);
}

export function setCloudConsent(id: ProviderId, allowed: boolean): void {
  const current = getCloudConsent().filter((p) => p !== id);
  storage.set(KEYS.cloudConsent, JSON.stringify(allowed ? [...current, id] : current));
}


// Days to keep full videos before the monthly-keepsake cleanup runs on its
// own (onboarding 3.8). 0 = keep forever; null = never chosen (cleanup only
// runs when you ask for it in Settings).
export function getVideoRetentionDays(): number | null {
  return storage.contains(KEYS.videoRetentionDays) ? (storage.getNumber(KEYS.videoRetentionDays) ?? null) : null;
}

export function setVideoRetentionDays(days: number): void {
  storage.set(KEYS.videoRetentionDays, days);
}

export function getLastAutoCleanup(): string | null {
  return storage.getString(KEYS.lastAutoCleanup) ?? null;
}

export function setLastAutoCleanup(date: string): void {
  storage.set(KEYS.lastAutoCleanup, date);
}

// Prefs for features that no longer exist (both removed 2026-10-12): the
// Notion journal's default and the AssemblyAI cloud-transcription switch.
const REMOVED_KEYS = ["notionDefault", "assemblyAiEnabled"];

export function removeObsoletePrefs(): void {
  for (const key of REMOVED_KEYS) storage.remove(key);
}

// Every preference, gone (Reset app): the profile, onboarding, goals,
// reminders, recording settings — back to first-launch defaults.
// Deep-review calls made today (local date), for the daily limit.
export function getCloudCallsToday(today: string): number {
  const stored = readJson<{ date: string; count: number }>(KEYS.cloudCalls, { date: today, count: 0 });
  return stored.date === today ? stored.count : 0;
}

export function noteCloudCall(today: string): void {
  storage.set(KEYS.cloudCalls, JSON.stringify({ date: today, count: getCloudCallsToday(today) + 1 }));
}

// The app guide: a tip the first time you reach each tab or feature.
export function getGuideSeen(): string[] {
  return readJson<string[]>(KEYS.guideSeen, []);
}

export function markGuideSeen(id: string): void {
  const seen = getGuideSeen();
  if (!seen.includes(id)) storage.set(KEYS.guideSeen, JSON.stringify([...seen, id]));
}

export function isGuideOff(): boolean {
  return storage.getBoolean(KEYS.guideOff) ?? false;
}

export function setGuideOff(off: boolean): void {
  storage.set(KEYS.guideOff, off);
}

// Every tip shows again, as you reach it.
export function resetGuide(): void {
  storage.remove(KEYS.guideSeen);
  storage.set(KEYS.guideOff, false);
}

// The latest covered day (YYYY-MM-DD) a streak freeze was announced for, so
// each freeze is mentioned once.
export function getFreezeAnnouncedThrough(): string {
  return storage.getString(KEYS.freezeAnnouncedThrough) ?? "";
}

export function setFreezeAnnouncedThrough(date: string): void {
  storage.set(KEYS.freezeAnnouncedThrough, date);
}

// Where you are in Three things: the round, and whether it's running,
// being kept light, or paused (domain/innerVoice/run.ts).
export function getSelfLikesRun(): RunState {
  const raw = storage.getString(KEYS.selfLikesRun);
  if (!raw) return DEFAULT_RUN;
  try {
    const parsed = JSON.parse(raw) as Partial<RunState>;
    const mode = parsed.mode === "light" || parsed.mode === "paused" ? parsed.mode : "run";
    return { round: typeof parsed.round === "number" && parsed.round >= 1 ? Math.floor(parsed.round) : 1, mode };
  } catch {
    return DEFAULT_RUN;
  }
}

export function setSelfLikesRun(state: RunState): void {
  storage.set(KEYS.selfLikesRun, JSON.stringify(state));
}

// The evening nudge to tell your day (Rewind). On by default at 9 PM; it only
// fires if notifications are allowed.
export interface RewindReminder {
  enabled: boolean;
  hour: number; // 0-23, local, on the hour
}

export const DEFAULT_REWIND_REMINDER: RewindReminder = { enabled: true, hour: 21 };

export function getRewindReminder(): RewindReminder {
  const stored = readJson<Partial<RewindReminder>>(KEYS.rewindReminder, {});
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_REWIND_REMINDER.enabled,
    hour: typeof stored.hour === "number" && stored.hour >= 0 && stored.hour <= 23 ? Math.floor(stored.hour) : DEFAULT_REWIND_REMINDER.hour,
  };
}

export function setRewindReminder(value: RewindReminder): void {
  storage.set(KEYS.rewindReminder, JSON.stringify(value));
}

// Providers you've said may read a Rewind transcript. Separate from the
// deep-review consent, which for Gemini also covers uploading video — a
// transcript-only OK must not stretch to that.
export function getRewindCloudConsent(): string[] {
  return readJson<string[]>(KEYS.rewindCloudConsent, []);
}

export function setRewindCloudConsent(provider: string): void {
  const current = getRewindCloudConsent();
  if (!current.includes(provider)) storage.set(KEYS.rewindCloudConsent, JSON.stringify([...current, provider]));
}

// The first finished Rewind asks about notifications once, so the evening
// nudge can work; never again if the answer was no.
export function wasRewindNotificationAsked(): boolean {
  return storage.getBoolean(KEYS.rewindNotificationsAsked) ?? false;
}

export function markRewindNotificationAsked(): void {
  storage.set(KEYS.rewindNotificationsAsked, true);
}

// Whether a deep review is told what you answered in onboarding (goals,
// what gets in your way…) so its feedback is relevant. On by default; the
// exact text is shown in Settings → Deep reviews.
export function getShareProfileWithReviews(): boolean {
  return storage.getBoolean(KEYS.shareProfileWithReviews) ?? true;
}

export function setShareProfileWithReviews(value: boolean): void {
  storage.set(KEYS.shareProfileWithReviews, value);
}

// How long Rewind recordings are kept before the audio is deleted (the
// transcript and notes stay). 0 = forever.
export const DEFAULT_AUDIO_RETENTION_DAYS = 90;

export function getAudioRetentionDays(): number {
  return storage.contains(KEYS.audioRetentionDays) ? (storage.getNumber(KEYS.audioRetentionDays) ?? DEFAULT_AUDIO_RETENTION_DAYS) : DEFAULT_AUDIO_RETENTION_DAYS;
}

export function setAudioRetentionDays(days: number): void {
  storage.set(KEYS.audioRetentionDays, days);
}

export function clearAllPrefs(): void {
  storage.clearAll();
}
