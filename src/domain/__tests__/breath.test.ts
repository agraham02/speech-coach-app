import { BREATH_MIN_SCALE, breathTarget } from "../breath";
import { WARM_UPS } from "../../content/drillContent";

describe("breathTarget", () => {
  it("fills on a breath in and empties on a breath out", () => {
    expect(breathTarget("in")).toBe(1);
    expect(breathTarget("out")).toBe(BREATH_MIN_SCALE);
  });

  it("stops short on a part-filling breath", () => {
    const part = breathTarget("in", 0.8) as number;
    expect(part).toBeGreaterThan(BREATH_MIN_SCALE);
    expect(part).toBeLessThan(1);
  });

  it("stays put on a hold or a step with no breath", () => {
    expect(breathTarget("hold")).toBeNull();
    expect(breathTarget(undefined)).toBeNull();
  });

  it("keeps every breathing warm-up inside the aura's range", () => {
    for (const warmUp of WARM_UPS) {
      for (const step of warmUp.steps) {
        const target = breathTarget(step.phase, step.fill);
        if (target !== null) {
          expect(target).toBeGreaterThanOrEqual(BREATH_MIN_SCALE);
          expect(target).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
