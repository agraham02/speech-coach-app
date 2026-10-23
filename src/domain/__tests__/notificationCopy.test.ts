import {
  anchorFits,
  anchorHour,
  anchorOption,
  checkCopy,
  daysUntil,
  eventAfterText,
  eventDayOfText,
  firstName,
  prepRunningText,
  prepTimeUpText,
  recencyFacts,
  reminderText,
  rewindReminderText,
  sessionReadyText,
  stepFailedText,
  streakToastText,
  type ReminderContext,
} from "../notificationCopy";
import { ANCHOR_OPTIONS } from "../../content/onboarding";
import type { EventKind } from "../profile";

// A regular: practiced yesterday, no streak worth mentioning yet.
const base: ReminderContext = { name: "Sam Rivera", slot: 0, anchor: null, streak: 0, atRiskToday: false, when: new Date(2026, 9, 20, 8, 0), daysSinceLast: 1 };

describe("firstName", () => {
  it("takes the first word and ignores blanks and absurd lengths", () => {
    expect(firstName("Sam Rivera")).toBe("Sam");
    expect(firstName("  ")).toBeNull();
    expect(firstName(undefined)).toBeNull();
    expect(firstName("x".repeat(40))).toBeNull();
  });
});

describe("reminderText", () => {
  it("greets by name and time of day, and still greets without one", () => {
    expect(reminderText(base).title).toBe("Morning, Sam");
    expect(reminderText({ ...base, when: new Date(2026, 9, 20, 13) }).title).toBe("Afternoon, Sam");
    expect(reminderText({ ...base, when: new Date(2026, 9, 20, 19) }).title).toBe("Evening, Sam");
    expect(reminderText({ ...base, name: null }).title).toBe("Good morning");
  });

  it("speaks to the time of day", () => {
    const morning = reminderText({ ...base, when: new Date(2026, 9, 21, 8) }).body;
    const evening = reminderText({ ...base, when: new Date(2026, 9, 21, 20) }).body;
    expect(morning).not.toBe(evening);
  });

  it("says an evening streak is still open, with a way to keep it", () => {
    const text = reminderText({ ...base, streak: 12, atRiskToday: true, when: new Date(2026, 9, 20, 19) });
    expect(text.title).toBe("Day 13 is still open");
    expect(text.body).toMatch(/short rep|one prompt/i);
  });

  it("mentions a freeze when one would cover the day", () => {
    const bodies = [19, 20, 21, 22].map((d) => reminderText({ ...base, streak: 12, atRiskToday: true, freezesHeld: 1, when: new Date(2026, 9, d, 19) }).body);
    expect(bodies.some((b) => /freeze has it covered/.test(b))).toBe(true);
    const none = [19, 20, 21, 22].map((d) => reminderText({ ...base, streak: 12, atRiskToday: true, freezesHeld: 0, when: new Date(2026, 9, d, 19) }).body);
    expect(none.some((b) => /freeze/.test(b))).toBe(false);
  });

  it("doesn't raise the streak in the morning; it's just the next day of the run", () => {
    const text = reminderText({ ...base, streak: 12, atRiskToday: true, when: new Date(2026, 9, 20, 8) });
    expect(text.title).toBe("Morning, Sam");
    expect(text.body).toMatch(/Day 13|12 days running/);
    expect(reminderText({ ...base, streak: 2, atRiskToday: true, when: new Date(2026, 9, 20, 19) }).title).not.toMatch(/still open/);
  });

  it("looks forward on a streak that is safe", () => {
    const bodies = [20, 21, 22, 23].map((d) => reminderText({ ...base, streak: 6, when: new Date(2026, 9, d, 8) }).body);
    expect(bodies.every((b) => /Day 7|6 days running/.test(b))).toBe(true);
  });

  it("counts down to an event, and names only its kind", () => {
    expect(reminderText({ ...base, event: { daysLeft: 6, kind: "interview" } }).title).toBe("6 days until your interview");
    expect(reminderText({ ...base, event: { daysLeft: 2, kind: "pitch" } }).title).toBe("2 days to your pitch");
    expect(reminderText({ ...base, event: { daysLeft: 1, kind: "talk" } }).title).toBe("Your talk is tomorrow");
    expect(reminderText({ ...base, event: { daysLeft: 1, kind: "talk" }, when: new Date(2026, 9, 20, 19) }).body).toMatch(/tonight/);
    expect(reminderText({ ...base, event: { daysLeft: 1, kind: "talk" } }).body).toMatch(/today/);
    expect(reminderText({ ...base, event: { daysLeft: 0, kind: "other" } }).title).toBe("Today's your big day");
    // Too far away, or past: falls through to the ordinary message.
    expect(JSON.stringify(reminderText({ ...base, event: { daysLeft: 40, kind: "talk" } }))).not.toMatch(/talk/);
    expect(JSON.stringify(reminderText({ ...base, event: { daysLeft: -2, kind: "talk" } }))).not.toMatch(/talk/);
  });

  it("welcomes a first rep, and someone back after a gap, without counting", () => {
    expect(reminderText({ ...base, daysSinceLast: null }).body).toMatch(/first|start small/i);
    const back = reminderText({ ...base, daysSinceLast: 5 });
    expect(back.title).toBe("Pick up where you left off");
    expect(back.body).not.toMatch(/\d/);
  });

  it("brings up the last lesson only when it's true", () => {
    expect(reminderText({ ...base, streak: 1, lastLesson: "Pause on purpose" }).body).toBe("Yesterday was Pause on purpose. Today's session picks up from there.");
    expect(reminderText({ ...base, streak: 1, daysSinceLast: 2, lastLesson: "Pause on purpose" }).body).not.toMatch(/Yesterday/);
    const back = [20, 21, 22, 23].map((d) => reminderText({ ...base, daysSinceLast: 4, lastLesson: "Pause on purpose", when: new Date(2026, 9, d, 8) }).body);
    expect(back.some((b) => b === "Last time was Pause on purpose. A short rep brings it back.")).toBe(true);
  });

  it("uses the habit the person tied practice to", () => {
    expect(reminderText({ ...base, anchor: "After my morning coffee." }).body).toMatch(/^After my morning coffee[:,] /);
    // ...but only near its own time of day: never "after your morning coffee" at 7 PM.
    const evening = new Date(2026, 9, 20, 19, 0);
    expect(reminderText({ ...base, anchor: "After your morning coffee", when: evening }).body).not.toMatch(/coffee/);
    expect(reminderText({ ...base, anchor: "After your morning coffee", when: evening }).body).toBeTruthy();
    expect(reminderText({ ...base, anchor: "After work", when: evening }).body).toMatch(/^After work[:,] /);
    expect(reminderText({ ...base, anchor: "Before bed", when: new Date(2026, 9, 20, 21, 0) }).body).toMatch(/^Before bed[:,] /);
  });

  it("lets the habit and the day count take turns on a run", () => {
    const bodies = [20, 21, 22, 23].map((d) => reminderText({ ...base, streak: 6, anchor: "After my morning coffee", when: new Date(2026, 9, d, 8) }).body);
    expect(bodies.some((b) => /coffee/.test(b))).toBe(true);
    expect(bodies.some((b) => /Day 7|6 days running/.test(b))).toBe(true);
  });

  it("offers top-ups once the first session is done, and not before", () => {
    expect(reminderText({ ...base, slot: 1, doneToday: 1 }).body).toMatch(/more|second|fresh/i);
    expect(reminderText({ ...base, slot: 2, doneToday: 2 }).body).toMatch(/last|final/i);
    expect(reminderText({ ...base, slot: 1, doneToday: 0 }).body).not.toMatch(/second|one more|last one/i);
  });

  it("is steady for one day and varies across days", () => {
    const day = (d: number) => reminderText({ ...base, when: new Date(2026, 9, d, 8) }).body;
    expect(day(20)).toBe(day(20));
    expect(new Set([20, 21, 22, 23, 24, 25, 26].map(day)).size).toBeGreaterThan(2);
    // Never the same words two days running.
    for (let d = 1; d < 28; d++) expect(day(d)).not.toBe(day(d + 1));
  });

  it("never includes anything but the first name", () => {
    expect(JSON.stringify(reminderText(base))).not.toMatch(/Rivera/);
  });
});

describe("the other notifications", () => {
  const when = new Date(2026, 9, 20);
  it("rewind greets in the evening", () => {
    expect(rewindReminderText("Sam", when).title).toBe("Evening, Sam");
    expect(rewindReminderText(null, when).title).toBe("Good evening");
  });
  it("event check-ins name the kind only", () => {
    expect(eventDayOfText("Sam", "interview", when).title).toBe("Sam, today's your interview");
    expect(eventAfterText(null, "toast", when).title).toBe("How did your toast go?");
  });
  it("a finished take never puts a score on the lock screen", () => {
    for (const kind of ["take", "review", "feeling"] as const) expect(JSON.stringify(sessionReadyText("Sam", kind))).not.toMatch(/\d|\/10/);
    expect(sessionReadyText("Sam", "review").title).toBe("Sam, your deep review is in");
    expect(sessionReadyText(null, "take").title).toBe("Your take is ready");
    expect(sessionReadyText("Sam", "feeling").body).not.toMatch(/score|pace|filler/i);
  });
  it("a failed step says what happened and how to try again", () => {
    expect(stepFailedText("Transcription", "No speech found")).toEqual({ title: "Transcription didn't finish", body: "No speech found. Open the take to try again." });
    expect(stepFailedText("Deep review", "Couldn't reach the AI provider.").body).toBe("Couldn't reach the AI provider. Open the take to try again.");
  });
  it("streak toasts stay quiet: no emoji, no exclamation marks", () => {
    expect(streakToastText(7, "milestone")).toBe("7 days in a row. That's a habit now.");
    expect(streakToastText(3, "milestone")).toBe("3 days in a row. Nice rhythm.");
    expect(streakToastText(5, "record")).toBe("5 days in a row, your longest yet.");
    for (const text of [streakToastText(30, "milestone"), streakToastText(9, "record")]) expect(checkCopy({ title: "", body: text })).toEqual([]);
  });
  it("prep alerts keep the prompt and never a stale countdown", () => {
    expect(prepTimeUpText("Pitch a city park").body).toMatch(/Pitch a city park$/);
    expect(prepRunningText("8:42 PM", "Pitch a city park").body).not.toMatch(/minute/);
  });
});

describe("checkCopy", () => {
  it("flags what the voice never does", () => {
    expect(checkCopy({ title: "Heyy bestie!!", body: "Don't forget to tell me about your day 🔥🔥" })).toEqual(expect.arrayContaining(["exclamation mark", "emoji", "pushy phrasing"]));
    expect(checkCopy({ title: "Morning, Sam", body: "x".repeat(130) })).toContain("body over 120 characters");
  });

  it("passes every line the app can send", () => {
    const kinds: EventKind[] = ["interview", "talk", "toast", "pitch", "date", "other"];
    const lessons = [null, "Pause instead of um"];
    const anchors = [null, ...ANCHOR_OPTIONS.map((o) => o.anchor)];
    const all = [];
    for (let d = 1; d <= 14; d++) {
      for (const hour of [7, 9, 12, 15, 18, 21]) {
        const when = new Date(2026, 9, d, hour);
        for (const name of ["Sam", null]) {
          for (const anchor of anchors) {
            for (const lastLesson of lessons) {
              for (const [streak, atRisk, since] of [[0, false, null], [0, false, 5], [1, false, 1], [6, false, 1], [12, true, 1]] as const) {
                for (const slot of [0, 1, 2]) {
                  all.push(reminderText({ name, slot, doneToday: slot, anchor, streak, atRiskToday: atRisk, freezesHeld: d % 2, when, daysSinceLast: since, lastLesson }));
                }
              }
            }
          }
          for (const kind of kinds) {
            for (let n = 0; n <= 14; n++) all.push(reminderText({ ...base, name, when, event: { daysLeft: n, kind } }));
            all.push(eventDayOfText(name, kind, when), eventAfterText(name, kind, when));
          }
          all.push(rewindReminderText(name, when));
          for (const kind of ["take", "review", "feeling"] as const) all.push(sessionReadyText(name, kind));
        }
      }
    }
    const bad = all.map((t) => ({ t, problems: checkCopy(t) })).filter((r) => r.problems.length);
    expect(bad).toEqual([]);
  });
});

describe("recencyFacts", () => {
  const when = new Date(2026, 9, 20, 19);
  it("is null with no practice at all", () => {
    expect(recencyFacts([], null, when)).toEqual({ daysSinceLast: null, lastLesson: null });
  });
  it("counts local days to the latest practice, dates or datetimes", () => {
    expect(recencyFacts(["2026-10-15", "2026-10-19"], null, when).daysSinceLast).toBe(1);
    expect(recencyFacts([new Date(2026, 9, 20, 9).toISOString()], null, when).daysSinceLast).toBe(0);
    expect(recencyFacts(["2026-10-16T12:00:00"], null, when).daysSinceLast).toBe(4);
  });
  it("names the last lesson only when it was finished on that last day", () => {
    const lesson = { title: "Pause on purpose", completedAt: new Date(2026, 9, 19, 18).toISOString() };
    expect(recencyFacts(["2026-10-19"], lesson, when).lastLesson).toBe("Pause on purpose");
    expect(recencyFacts(["2026-10-19"], { ...lesson, completedAt: new Date(2026, 9, 12, 18).toISOString() }, when).lastLesson).toBeNull();
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
    expect(reminderText({ ...base, anchor: "After walking the dog", anchorHour: 19, when: at(19) }).body).toMatch(/^After walking the dog[:,] /);
    expect(reminderText({ ...base, anchor: "After walking the dog", anchorHour: 19, when: at(8) }).body).not.toMatch(/dog/);
  });
});
