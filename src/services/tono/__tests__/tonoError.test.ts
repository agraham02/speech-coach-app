import type { TonoAllowance } from "../../../domain/aiAllowance";
import { describeTonoError, needsPersonToAct, TonoApiError } from "../tonoError";
import { describeCloudError } from "../../cloud/cloudErrors";

const freeGone: TonoAllowance = { plan: "free", tier: "free", takesLeft: 0, takesTotal: 1, resetsAt: "2026-12-01T00:00:00.000Z", trialEndsAt: null };

describe("describeTonoError", () => {
  it("never asks anyone to sign in: the account is made behind the scenes", () => {
    expect(describeTonoError(new TonoApiError(401, "signed_out"))).not.toMatch(/sign in/i);
  });

  it("explains a used-up free judged take, and that the phone still works", () => {
    const text = describeTonoError(new TonoApiError(402, "quota_exhausted", undefined, freeGone));
    expect(text).toMatch(/used this month's free judged take/);
    expect(text).not.toMatch(/own key/);
    expect(text).toMatch(/phone/);
  });

  it("asks for an update when the app reads an old answer format", () => {
    expect(describeTonoError(new TonoApiError(400, "unsupported_schema"))).toMatch(/Update the app/);
  });

  it("explains the other refusals without blaming anyone", () => {
    expect(describeTonoError(new TonoApiError(402, "plus_cost_cap"))).toMatch(/limit/);
    expect(describeTonoError(new TonoApiError(429, "rate_limited"))).toMatch(/tomorrow/);
    expect(describeTonoError(new TonoApiError(503, "budget_paused"))).toMatch(/paused/);
    expect(describeTonoError(new TonoApiError(503, "disabled"))).toMatch(/switched off/);
  });

  it("covers the failures that are worth a retry", () => {
    expect(describeTonoError(new TonoApiError(404, "file_not_found"))).toMatch(/upload it again/);
    expect(describeTonoError(new TonoApiError(409, "in_flight"))).toMatch(/already on it/);
    expect(describeTonoError(new TonoApiError(502, "upstream_failed"))).toMatch(/temporary problem/);
    expect(describeTonoError(new TonoApiError(500, "internal"))).toMatch(/temporary problem/);
    expect(describeTonoError(new TonoApiError(418, "teapot"))).toMatch(/Try again/);
  });

  it("is what the pipeline shows for a Tono error", () => {
    const error = new TonoApiError(402, "quota_exhausted", undefined, freeGone);
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
