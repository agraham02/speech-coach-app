import { daysUntil, firstName, reminderText, rewindReminderText, sessionReadyText, type ReminderContext, anchorFits, anchorHour, anchorOption } from "../notificationCopy";

const base: ReminderContext = { name: "Sam Rivera", slot: 0, anchor: null, streak: 0, atRiskToday: false, when: new Date(2026, 9, 20, 8, 0) };

describe("firstName", () => {
  it("takes the first word and ignores blanks and absurd lengths", () => {
    expect(firstName("Sam Rivera")).toBe("Sam");
    expect(firstName("  ")).toBeNull();
    expect(firstName(undefined)).toBeNull();
    expect(firstName("x".repeat(40))).toBeNull();
  });
});

describe("reminderText", () => {
  it("greets by name and time of day", () => {
    expect(reminderText(base).title).toBe("Morning, Sam");
    expect(reminderText({ ...base, when: new Date(2026, 9, 20, 13) }).title).toBe("Afternoon, Sam");
    expect(reminderText({ ...base, when: new Date(2026, 9, 20, 19) }).title).toBe("Evening, Sam");
    expect(reminderText({ ...base, name: null }).title).toBe("Tono");
  });

  it("says when a streak is at risk, once it is worth protecting", () => {
    expect(reminderText({ ...base, streak: 12, atRiskToday: true, when: new Date(2026, 9, 20, 19) }).body).toBe("Your 12-day streak is waiting on today's rep. A short one counts.");
    expect(reminderText({ ...base, streak: 2, atRiskToday: true }).body).not.toMatch(/streak/);
  });

  it("looks forward on a streak that is safe", () => {
    expect(reminderText({ ...base, streak: 6 }).body).toMatch(/^Day 7 is ready\./);
  });

  it("counts down to an event, and names only its kind", () => {
    expect(reminderText({ ...base, event: { daysLeft: 6, kind: "interview" } }).body).toBe("6 days until your interview. Every rep counts toward it.");
    expect(reminderText({ ...base, event: { daysLeft: 1, kind: "talk" } }).body).toBe("Sam, your talk is tomorrow. One calm run-through tonight.");
    expect(reminderText({ ...base, event: { daysLeft: 0, kind: "other" } }).body).toMatch(/today's the day.*big day/);
    // Too far away, or past: falls through to the ordinary message.
    expect(reminderText({ ...base, event: { daysLeft: 40, kind: "talk" } }).body).not.toMatch(/talk/);
    expect(reminderText({ ...base, event: { daysLeft: -2, kind: "talk" } }).body).not.toMatch(/talk/);
  });

  it("uses the habit the person tied practice to", () => {
    expect(reminderText({ ...base, anchor: "After my morning coffee." }).body).toBe("After my morning coffee: time for today's practice.");
    // ...but only near its own time of day: never "after your morning coffee" at 7 PM.
    const evening = new Date(2026, 9, 20, 19, 0);
    expect(reminderText({ ...base, anchor: "After your morning coffee", when: evening }).body).not.toMatch(/coffee/);
    expect(reminderText({ ...base, anchor: "After your morning coffee", when: evening }).body).toBeTruthy();
    expect(reminderText({ ...base, anchor: "After work", when: evening }).body).toBe("After work: time for today's practice.");
    expect(reminderText({ ...base, anchor: "Before bed", when: new Date(2026, 9, 20, 21, 0) }).body).toBe("Before bed: time for today's practice.");
  });

  it("offers top-ups on later slots", () => {
    expect(reminderText({ ...base, slot: 1 }).body).toMatch(/top-up|second session|four more/i);
  });

  it("is steady for one day and varies across days", () => {
    const day = (d: number) => reminderText({ ...base, when: new Date(2026, 9, d, 8) }).body;
    expect(day(20)).toBe(day(20));
    expect(new Set([20, 21, 22, 23, 24, 25, 26].map(day)).size).toBeGreaterThan(2);
  });

  it("never includes anything but the first name", () => {
    expect(JSON.stringify(reminderText(base))).not.toMatch(/Rivera/);
  });
});

describe("rewindReminderText and sessionReadyText", () => {
  it("personalize when there is a name", () => {
    expect(rewindReminderText("Sam", new Date(2026, 9, 20)).title).toBe("Evening, Sam");
    expect(rewindReminderText(null, new Date(2026, 9, 20)).title).toBe("Tono");
    expect(sessionReadyText("Sam", 8.2)).toMatchObject({ title: "Strong take, Sam", body: expect.stringContaining("8.2/10") });
    expect(sessionReadyText("Sam", 5).title).toBe("Useful take, Sam");
    expect(sessionReadyText(null, null).title).toBe("Your take is ready");
  });
});

describe("daysUntil", () => {
  it("counts local calendar days", () => {
    expect(daysUntil("2026-10-26", new Date(2026, 9, 20, 23, 30))).toBe(6);
    expect(daysUntil("2026-10-20", new Date(2026, 9, 20, 0, 5))).toBe(0);
    expect(daysUntil("2026-10-19", new Date(2026, 9, 20))).toBe(-1);
    expect(daysUntil("soon", new Date())).toBeNaN();
  });
});

describe("a habit only fits near its own time", () => {
  const at = (hour: number) => new Date(2026, 9, 20, hour, 0);

  it("knows the ready-made habits' hours, within two hours either side", () => {
    expect(anchorFits("After your morning coffee", at(8))).toBe(true);
    expect(anchorFits("After my morning coffee.", at(10))).toBe(true);
    expect(anchorFits("After your morning coffee", at(11))).toBe(false);
    expect(anchorFits("After your morning coffee", at(19))).toBe(false);
    expect(anchorFits("Before bed", at(22))).toBe(true);
  });

  it("ties a habit someone wrote to the hour they chose, and never guesses without one", () => {
    expect(anchorFits("After walking the dog", at(19))).toBe(false);
    expect(anchorFits("After walking the dog", at(19), 19)).toBe(true);
    expect(anchorFits("After walking the dog", at(8), 19)).toBe(false);
    expect(anchorHour("After walking the dog", 19)).toBe(19);
    expect(anchorOption("After walking the dog")).toBeUndefined();
    expect(anchorOption("On your lunch break")?.hour).toBe(12);
  });

  it("uses a written habit in the reminder only while the reminder is still at its hour", () => {
    expect(reminderText({ ...base, anchor: "After walking the dog", anchorHour: 19, when: at(19) }).body).toBe("After walking the dog: time for today's practice.");
    expect(reminderText({ ...base, anchor: "After walking the dog", anchorHour: 19, when: at(8) }).body).not.toMatch(/dog/);
  });
});
