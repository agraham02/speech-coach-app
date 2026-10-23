const calls: string[] = [];

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async (request: { identifier: string }) => {
    calls.push(`schedule:${request.identifier}`);
    return request.identifier;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    calls.push(`cancel:${id}`);
  }),
  dismissNotificationAsync: jest.fn(async (id: string) => {
    calls.push(`dismiss:${id}`);
  }),
}));

jest.mock("../../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

jest.mock("../prepActivity", () => ({
  endPrepActivity: jest.fn(async () => {
    calls.push("end-activity");
  }),
}));

import { armAwayAlert, clearPrepAlert, quietAwayAlert } from "../prepAlert";

beforeEach(() => {
  calls.length = 0;
});

describe("prep away alert", () => {
  it("arming never ends the Dynamic Island timer", async () => {
    await armAwayAlert(Date.now() + 120_000, "Explain tides");
    expect(calls).not.toContain("end-activity");
    expect(calls).toContain("schedule:prep-time-up");
  });

  it("coming back cancels the pending alert and clears one that fired", async () => {
    await quietAwayAlert();
    expect(calls).toEqual(
      expect.arrayContaining(["cancel:prep-time-up", "dismiss:prep-time-up", "cancel:prep-running", "dismiss:prep-running"]),
    );
    expect(calls).not.toContain("end-activity");
  });

  it("leaving and coming straight back ends quiet", async () => {
    const leaving = armAwayAlert(Date.now() + 120_000, "Explain tides");
    const back = quietAwayAlert();
    await Promise.all([leaving, back]);
    expect(calls.lastIndexOf("cancel:prep-time-up")).toBeGreaterThan(calls.lastIndexOf("schedule:prep-time-up"));
  });

  it("doesn't arm for a deadline that has passed", async () => {
    await armAwayAlert(Date.now() - 1000, "Explain tides");
    expect(calls).not.toContain("schedule:prep-time-up");
  });

  it("clearing ends the timer and the alert", async () => {
    await clearPrepAlert();
    expect(calls).toContain("end-activity");
    expect(calls).toContain("cancel:prep-time-up");
  });
});
