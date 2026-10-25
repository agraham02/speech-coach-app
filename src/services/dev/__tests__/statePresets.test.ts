// The state presets write what the real onboarding and Settings write, and
// nothing in a production build. The preference store is replaced with a
// plain object here so the test can see every write.

const mockPrefs: Record<string, unknown> = {};
const mockCalls: string[] = [];

jest.mock("../../notifications/reminderScheduler", () => ({ syncDailyReminder: async () => void mockCalls.push("syncReminders") }));
jest.mock("../../data/resetApp", () => ({ resetApp: async () => void mockCalls.push("resetApp") }));
jest.mock("../../db/database", () => ({ getDatabase: async () => ({}) }));
jest.mock("../skipModel", () => ({ setSkipModelDownload: (on: boolean) => void (mockPrefs.skipModel = on) }));
jest.mock("../../prefs/prefsStore", () => {
  const set = (key: string) => (value: unknown) => void (mockPrefs[key] = value);
  return {
    getUserProfile: () => mockPrefs.profile ?? null,
    setUserProfile: set("profile"),
    isOnboardingComplete: () => !!(mockPrefs.profile as { onboardingCompletedAt?: string } | undefined)?.onboardingCompletedAt,
    setSkillCheckPending: set("skillCheckPending"),
    setDailySessionGoal: set("goal"),
    setPlanMinutes: set("minutes"),
    setPracticeAnchor: (anchor: string | null, hour: number | null = null) => void (mockPrefs.anchor = { anchor, hour }),
    setReminderSettings: set("reminders"),
    getReminderSettings: () => mockPrefs.reminders ?? { enabled: true, hour: 19 },
    setVideoRetentionDays: set("retention"),
    setTonoConsent: set("consent"),
    hasTonoConsent: () => mockPrefs.consent === true,
    setCloudReviewDefault: set("judgeEvery"),
    getCloudReviewDefault: () => mockPrefs.judgeEvery ?? true,
    setGuideOff: set("tipsOff"),
    isGuideOff: () => mockPrefs.tipsOff === true,
    resetGuide: () => void (mockPrefs.tipsOff = false),
    markRewindNotificationAsked: () => void (mockPrefs.rewindAsked = true),
    setRecordBlindPref: set("recordBlind"),
    setWarmUpEnabled: set("warmUp"),
  };
});

import { Appearance } from "react-native";
import { applyOnboardedPreset, presetSummary, resetToFreshInstall, setAgeAnswer, setConsent, setRemindersOff, setTheme, setTips } from "../statePresets";
import { isAdultFromAge } from "../../../domain/profile";
import { QUESTIONS } from "../../../content/onboarding";

beforeEach(() => {
  jest.spyOn(Appearance, "setColorScheme").mockImplementation((v) => void mockCalls.push(`theme:${v}`));
  for (const key of Object.keys(mockPrefs)) delete mockPrefs[key];
  mockCalls.length = 0;
});

describe("state presets", () => {
  it("finishes onboarding the way the last questions and the setup check do", async () => {
    await applyOnboardedPreset({ age: "adult" });
    const profile = mockPrefs.profile as { onboardingCompletedAt: string; onboardingStep: number; ageRange: string };
    expect(profile.onboardingCompletedAt).toEqual(expect.any(String));
    expect(profile.onboardingStep).toBe(QUESTIONS.length);
    expect(profile.ageRange).toBe("25_34");
    expect(mockPrefs).toMatchObject({
      goal: 1,
      minutes: 5,
      anchor: { anchor: "After work", hour: 18 },
      reminders: { enabled: false },
      retention: 30,
      consent: false,
      tipsOff: true,
      skillCheckPending: true,
      rewindAsked: true,
      skipModel: true,
      recordBlind: false,
      warmUp: false,
    });
    expect(mockCalls).toContain("syncReminders");
    expect(presetSummary()).toMatchObject({ onboarded: true, consent: false, remindersOn: false, tipsOff: true });
  });

  it("can be finished as an under-18", async () => {
    await applyOnboardedPreset({ age: "under_18" });
    expect(isAdultFromAge((mockPrefs.profile as { ageRange: never }).ageRange)).toBe(false);
  });

  it("changes the age answer alone, and can take it away", () => {
    setAgeAnswer("under_18");
    expect((mockPrefs.profile as { ageRange?: string }).ageRange).toBe("13_17");
    setAgeAnswer("unsaid");
    expect((mockPrefs.profile as { ageRange?: string }).ageRange).toBe("unsaid");
    setAgeAnswer("skipped");
    expect("ageRange" in (mockPrefs.profile as object)).toBe(false);
  });

  it("sets consent the way Allow Tono AI does, and turns it off", () => {
    setConsent(true);
    expect(mockPrefs).toMatchObject({ consent: true, judgeEvery: true });
    setConsent(false);
    expect(mockPrefs.consent).toBe(false);
  });

  it("turns reminders off, tips off and on, and sets the theme", async () => {
    await setRemindersOff();
    expect(presetSummary().remindersOn).toBe(false);
    setTips(false);
    expect(mockPrefs.tipsOff).toBe(true);
    setTips(true);
    expect(mockPrefs.tipsOff).toBe(false);
    setTheme("dark");
    setTheme("system");
    expect(mockCalls).toEqual(expect.arrayContaining(["theme:dark", "theme:unspecified"]));
  });

  it("resets through the app's own reset", async () => {
    await resetToFreshInstall();
    expect(mockCalls).toContain("resetApp");
  });
});

describe("in a production build", () => {
  it("refuses every preset", async () => {
    jest.resetModules();
    jest.doMock("../../../config/devTools", () => ({ SHOW_DEV_TOOLS: false }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const presets = require("../statePresets") as typeof import("../statePresets");
    await expect(presets.applyOnboardedPreset({ age: "adult" })).rejects.toThrow(/only available in development/);
    await expect(presets.resetToFreshInstall()).rejects.toThrow(/only available in development/);
    expect(() => presets.setConsent(true)).toThrow();
    expect(() => presets.setAgeAnswer("adult")).toThrow();
    expect(() => presets.setTheme("dark")).toThrow();
    expect(mockPrefs.profile).toBeUndefined();
  });
});
