import type { TonoAllowance } from "../../../domain/aiAllowance";
import { describeTonoError, needsPersonToAct, TonoApiError } from "../tonoError";
import { describeCloudError } from "../../cloud/cloudErrors";

const starterGone: TonoAllowance = { plan: "free", tier: "starter", reviewsLeft: 0, reviewsTotal: 5, resetsAt: null };

describe("describeTonoError", () => {
  it("tells a signed-out person where to sign in", () => {
    expect(describeTonoError(new TonoApiError(401, "signed_out"))).toMatch(/Sign in again in Settings/);
  });

  it("explains an used-up starter pack and points at the own-key option", () => {
    const text = describeTonoError(new TonoApiError(402, "quota_exhausted", undefined, starterGone));
    expect(text).toMatch(/used your free AI reviews/);
    expect(text).toMatch(/own key/);
    expect(text).toMatch(/phone/);
  });

  it("explains the other refusals without blaming anyone", () => {
    expect(describeTonoError(new TonoApiError(402, "plus_cost_cap"))).toMatch(/allowance/);
    expect(describeTonoError(new TonoApiError(429, "rate_limited"))).toMatch(/tomorrow/);
    expect(describeTonoError(new TonoApiError(503, "budget_paused"))).toMatch(/paused/);
    expect(describeTonoError(new TonoApiError(503, "disabled"))).toMatch(/switched off/);
  });

  it("covers the failures that are worth a retry", () => {
    expect(describeTonoError(new TonoApiError(404, "file_not_found"))).toMatch(/upload it again/);
    expect(describeTonoError(new TonoApiError(409, "in_flight"))).toMatch(/already running/);
    expect(describeTonoError(new TonoApiError(502, "upstream_failed"))).toMatch(/temporary problem/);
    expect(describeTonoError(new TonoApiError(500, "internal"))).toMatch(/temporary problem/);
    expect(describeTonoError(new TonoApiError(418, "teapot"))).toMatch(/Try again/);
  });

  it("is what the pipeline shows for a Tono error", () => {
    const error = new TonoApiError(402, "quota_exhausted", undefined, starterGone);
    expect(describeCloudError(error)).toBe(describeTonoError(error));
  });
});

describe("needsPersonToAct", () => {
  it("is true when only the person can fix it", () => {
    expect(needsPersonToAct(new TonoApiError(401, "signed_out"))).toBe(true);
    expect(needsPersonToAct(new TonoApiError(402, "quota_exhausted"))).toBe(true);
    expect(needsPersonToAct(new TonoApiError(429, "rate_limited"))).toBe(true);
  });

  it("is false for a switch that clears by itself, and for plain failures", () => {
    expect(needsPersonToAct(new TonoApiError(503, "disabled"))).toBe(false);
    expect(needsPersonToAct(new TonoApiError(502, "upstream_failed"))).toBe(false);
  });
});
