import { createMMKV } from "react-native-mmkv";
import {
  DEFAULT_CONCISE_DURATION_SECONDS,
  DEFAULT_PREP_PHASE_SETTINGS,
  DEFAULT_RECORDING_DURATION_SETTINGS,
  type PrepPhaseSettings,
  type RecordingDurationSettings,
} from "../../domain/recordingSettings";
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from "../../domain/reminderSettings";

const storage = createMMKV({ id: "speech-coach-prefs" });

const KEYS = {
  recordBlind: "recordBlind",
  recordingDurationSettings: "recordingDurationSettings",
  prepPhaseSettings: "prepPhaseSettings",
  reminderSettings: "reminderSettings",
  planYourPointEnabled: "planYourPointEnabled",
  conciseModeSeconds: "conciseModeSeconds",
  assemblyAiEnabled: "assemblyAiEnabled",
  warmUpEnabled: "warmUpEnabled",
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

// Off by default — this is the only paid element in the audio pipeline
// (AssemblyAI, ~$0.15-0.21/hr), so it must never turn on silently. See
// SettingsScreen.tsx's "Cloud transcription" card.
export function getAssemblyAiEnabled(): boolean {
  return storage.getBoolean(KEYS.assemblyAiEnabled) ?? false;
}

export function setAssemblyAiEnabled(value: boolean): void {
  storage.set(KEYS.assemblyAiEnabled, value);
}
