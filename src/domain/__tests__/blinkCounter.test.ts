import { feedBlink, loseFace, newBlinkState, type BlinkState } from "../blinkCounter";
import { computePresenceMetrics, type PresenceSample } from "../presenceMetrics";

// Feeds [closure, tMs] frames through the counter.
const run = (frames: [number, number][], start: BlinkState = newBlinkState()) => frames.reduce((s, [c, t]) => feedBlink(s, c, t), start);

describe("feedBlink", () => {
  it("counts a quick close and open, even between timeline samples", () => {
    // 30 fps: shut for about 100 ms.
    expect(run([[0.1, 0], [0.8, 33], [0.9, 66], [0.2, 133], [0.1, 166]]).count).toBe(1);
  });

  it("does not split one blink that hovers around the threshold", () => {
    expect(run([[0.1, 0], [0.6, 33], [0.5, 66], [0.6, 100], [0.1, 166]]).count).toBe(1);
  });

  it("ignores eyes kept shut or a long look down", () => {
    expect(run([[0.1, 0], [0.8, 33], [0.8, 400], [0.8, 900], [0.1, 1000]]).count).toBe(0);
  });

  it("counts several blinks", () => {
    const frames: [number, number][] = [];
    for (let i = 0; i < 5; i++) frames.push([0.1, i * 1000], [0.8, i * 1000 + 40], [0.1, i * 1000 + 140]);
    expect(run(frames).count).toBe(5);
  });

  it("drops a blink cut off by losing the face", () => {
    const half = run([[0.1, 0], [0.8, 33]]);
    expect(run([[0.1, 100]], loseFace(half)).count).toBe(0);
  });
});

describe("computePresenceMetrics blinks", () => {
  const sample = (tMs: number, extra: Partial<PresenceSample> = {}): PresenceSample => ({ tMs, present: true, yaw: 0, pitch: 0, smile: 0, eyesOpen: 1, framed: true, ...extra });

  it("adds up frame-rate blink counts when the timeline has them", () => {
    const timeline = Array.from({ length: 301 }, (_, i) => sample(i * 200, { blinks: i % 20 === 0 ? 1 : 0 }));
    // 16 blinks over 60 s.
    expect(computePresenceMetrics(timeline)?.blinksPerMinute).toBe(16);
  });

});
