import { groupByMonth } from "../sessionHistory";

// Mid-month, mid-day timestamps so the local-time month is the same in any
// test runner's timezone.
const take = (recordedAt: string, overallScore: number | null) => ({ recordedAt, overallScore });

describe("groupByMonth", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("groups newest first with counts, averages and the change from the month before", () => {
    const groups = groupByMonth(
      [
        take("2026-10-12T12:00:00Z", 7),
        take("2026-10-10T12:00:00Z", 8),
        take("2026-09-14T12:00:00Z", 6),
        take("2026-09-12T12:00:00Z", null),
        take("2025-12-14T12:00:00Z", 5),
      ],
      now,
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-10", "2026-09", "2025-12"]);
    expect(groups.map((g) => g.count)).toEqual([2, 2, 1]);
    expect(groups[0]).toMatchObject({ title: "October", avgScore: 7.5, deltaVsPrevious: 1.5 });
    expect(groups[1]).toMatchObject({ avgScore: 6, deltaVsPrevious: 1 });
    expect(groups[2]).toMatchObject({ title: "December 2025", deltaVsPrevious: null });
  });

  it("skips unscored months when comparing", () => {
    const groups = groupByMonth([take("2026-10-12T12:00:00Z", 8), take("2026-09-12T12:00:00Z", null), take("2026-08-12T12:00:00Z", 6)], now);
    expect(groups[1].avgScore).toBeNull();
    expect(groups[0].deltaVsPrevious).toBe(2);
  });
});
