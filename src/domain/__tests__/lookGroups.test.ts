import { computePresenceMetrics, DEFAULT_PRESENCE_THRESHOLDS } from "../presenceMetrics";
import { groupLooks } from "../lookGroups";
import { LOOK_DOWN, NO_FACE, lookingAtLens, timeline, withGlances, withLookAway } from "./faceTimeline";

describe("groupLooks", () => {
  it("is null on a timeline too short to group", () => {
    expect(groupLooks([])).toBeNull();
    expect(groupLooks(lookingAtLens(0.1))).toBeNull();
  });

  it("reads a steady look at the lens as fully on the lens, with nothing to forgive or count", () => {
    const g = groupLooks(lookingAtLens(20))!;
    expect(g.onLensPercentSpeaking).toBe(100);
    expect(g.plainOnLensPercent).toBe(100);
    expect(g.glancesForgiven).toBe(0);
    expect(g.longLookAways).toBe(0);
    expect(g.longLookAwaysPerMinute).toBe(0);
  });

  it("forgives half-second glances that the per-sample figure counts against you", () => {
    const g = groupLooks(withGlances(20, [4000, 8000, 12000, 16000]))!;
    expect(g.glancesForgiven).toBe(4);
    expect(g.forgivenMs).toBe(2000);
    expect(g.onLensPercentSpeaking).toBe(100);
    expect(g.plainOnLensPercent).toBe(90);
    expect(g.longLookAways).toBe(0);
  });

  it("counts a five second look-away as one long look-away and scores it as time off the lens", () => {
    const g = groupLooks(withLookAway(20, 8000, 5000))!;
    expect(g.longLookAwayEvents).toBe(1);
    expect(g.longLookAways).toBe(1);
    expect(g.glancesForgiven).toBe(0);
    expect(g.onLensPercentSpeaking).toBe(75);
    expect(g.plainOnLensPercent).toBe(75);
    expect(g.longestLookAwayMs).toBe(5000);
    expect(g.longLookAwaysPerMinute).toBe(3);
  });

  it("counts a long look-away with the eyes down twice (notes or your own preview)", () => {
    const g = groupLooks(withLookAway(20, 8000, 5000, LOOK_DOWN))!;
    expect(g.longLookAwayEvents).toBe(1);
    expect(g.longLookAways).toBe(2);
  });

  it("neither forgives nor counts a look-away between the two limits", () => {
    const g = groupLooks(withLookAway(20, 8000, 2000))!;
    expect(g.glancesForgiven).toBe(0);
    expect(g.longLookAways).toBe(0);
    expect(g.onLensPercentSpeaking).toBe(90);
  });

  it("takes the limits from the options", () => {
    const frames = withLookAway(20, 8000, 2000);
    expect(groupLooks(frames, { forgiveBelowMs: 2500 })!.glancesForgiven).toBe(1);
    expect(groupLooks(frames, { longAtMs: 1500 })!.longLookAways).toBe(1);
    expect(groupLooks(frames, { thresholds: { ...DEFAULT_PRESENCE_THRESHOLDS, gazeMaxOffset: 0.9 } })!.onLensPercentSpeaking).toBe(100);
  });

  it("scores only the time spent speaking", () => {
    // Looking away from 8 to 13 s, but speaking only in the first 8 s and the last 5 s.
    const frames = withLookAway(20, 8000, 5000);
    const g = groupLooks(frames, {
      speechSpans: [
        { startMs: 0, endMs: 8000 },
        { startMs: 15000, endMs: 20000 },
      ],
    })!;
    expect(g.speakingMs).toBe(13000);
    expect(g.onLensPercentSpeaking).toBe(100);
    expect(g.longLookAways).toBe(0);
    expect(g.plainOnLensPercent).toBe(75);
  });

  it("counts a look-away that runs through speech, even when it started in a pause", () => {
    const g = groupLooks(withLookAway(20, 8000, 5000), { speechSpans: [{ startMs: 10000, endMs: 16000 }] })!;
    expect(g.longLookAwayEvents).toBe(1);
    expect(g.onLensPercentSpeaking).toBe(50);
  });

  it("gives no figure when nobody is speaking", () => {
    const g = groupLooks(lookingAtLens(10), { speechSpans: [] })!;
    expect(g.onLensPercentSpeaking).toBeNull();
    expect(g.speakingMs).toBe(0);
    expect(g.longLookAways).toBe(0);
  });

  it("counts a missing face as looking away", () => {
    const frames = timeline([{ sec: 5 }, { sec: 4, over: NO_FACE }, { sec: 5 }]);
    const g = groupLooks(frames)!;
    expect(g.longLookAwayEvents).toBe(1);
    expect(g.onLensPercentSpeaking).toBeCloseTo((10 / 14) * 100, 0);
  });

  it("agrees with the per-sample figure of computePresenceMetrics when nothing is forgiven or sliced", () => {
    const frames = withLookAway(20, 8000, 5000);
    expect(groupLooks(frames)!.plainOnLensPercent).toBe(computePresenceMetrics(frames)!.eyeContactPercent);
  });
});
