import { EMOTIONS, feelingWordsUsed, rotationEmotion, weekStart } from "../feelings";

describe("Feeling of the Week", () => {
  it("starts weeks on Monday, local time", () => {
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // a Sunday
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // a Monday
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
  });

  it("starts on joy in your first week and rotates through all six", () => {
    expect(rotationEmotion("2026-10-12", "2026-10-12")).toBe("joy");
    const seen = new Set<string>();
    let week = "2026-10-12";
    for (let i = 0; i < 6; i++) {
      seen.add(rotationEmotion("2026-10-12", week));
      const d = new Date(Number(week.slice(0, 4)), Number(week.slice(5, 7)) - 1, Number(week.slice(8, 10)) + 7);
      week = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    expect(seen.size).toBe(6);
    expect(EMOTIONS).toHaveLength(6);
  });

  it("finds the feeling words you used, in order, without double counting forms", () => {
    expect(feelingWordsUsed("I was so nervous, honestly anxious, and then the relief when it ended. Relieved!")).toEqual(["nervous", "anxious", "relieved"]);
    expect(feelingWordsUsed("We went to the park and had lunch.")).toEqual([]);
  });

  it("counts multi-word feelings", () => {
    expect(feelingWordsUsed("I felt let down and a bit on edge")).toEqual(["let down", "on edge"]);
  });
});
