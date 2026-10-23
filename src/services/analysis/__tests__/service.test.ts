import type { AnalysisContext, AnalysisKind } from "../../../domain/analysis/types";
import { createAnalysisService } from "../service";
import type { AnalysisProvider, ProviderOutcome } from "../provider";
import { TonoApiError } from "../../tono/tonoError";

jest.mock("../../db/artifactsRepo", () => ({ getArtifact: jest.fn(), putArtifact: jest.fn() }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const ctx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  wantsTono: true,
  tono: { signedIn: true, consent: true, allowed: { review: true, text: true, insight: true }, killSwitch: false },
  ownKey: null,
  takeOptIn: true,
  judgeInput: "text",
  hasVideo: true,
  hasTranscript: true,
  flags: {},
  ...patch,
});

function fake(id: AnalysisProvider["id"], kinds: AnalysisKind[], behave: () => Promise<ProviderOutcome<unknown>>): AnalysisProvider & { calls: number } {
  const p = {
    id,
    calls: 0,
    supports: (k: AnalysisKind) => kinds.includes(k),
    async run() {
      p.calls += 1;
      return behave() as never;
    },
  };
  return p;
}

const made = (producer: AnalysisProvider["id"]) => ({ producer, promptVersion: "test", judged: producer !== "rules", at: "t" });
const ok = (value: unknown, producer: AnalysisProvider["id"]) => async () => ({ ok: true as const, value, provenance: made(producer) });

describe("AnalysisService", () => {
  it("returns the first producer's result with its provenance, and records it on the take", async () => {
    const record = jest.fn(async () => undefined);
    const tono = fake("tono_ai", ["mark_up"], ok("tono marks", "tono_ai"));
    const rules = fake("rules", ["mark_up"], ok("rule marks", "rules"));
    const service = createAnalysisService({ providers: [tono, rules], record });
    const result = await service.request("mark_up", { text: "x" }, ctx(), { takeId: "t1" });
    expect(result).toMatchObject({ status: "done", value: "tono marks", provenance: { producer: "tono_ai" } });
    expect(rules.calls).toBe(0);
    expect(record).toHaveBeenNthCalledWith(1, "t1", "mark_up", expect.objectContaining({ status: "pending" }));
    expect(record).toHaveBeenLastCalledWith("t1", "mark_up", expect.objectContaining({ status: "done", provenance: made("tono_ai") }));
  });

  it("falls back to the rules when the judge fails, and says so", async () => {
    const tono = fake("tono_ai", ["mark_up"], async () => {
      throw new TonoApiError(429, "quota_exhausted");
    });
    const rules = fake("rules", ["mark_up"], ok("rule marks", "rules"));
    const result = await createAnalysisService({ providers: [tono, rules], record: async () => undefined }).request("mark_up", { text: "x" }, ctx());
    expect(result).toMatchObject({ status: "unavailable", reason: "quota", fallback: { value: "rule marks", provenance: { producer: "rules" } } });
  });

  it("is plainly done with the rules when no judge was meant to run", async () => {
    const tono = fake("tono_ai", ["mark_up"], ok("tono marks", "tono_ai"));
    const rules = fake("rules", ["mark_up"], ok("rule marks", "rules"));
    const result = await createAnalysisService({ providers: [tono, rules], record: async () => undefined }).request("mark_up", { text: "x" }, ctx({ tono: { ...ctx().tono, signedIn: false } }));
    expect(result).toMatchObject({ status: "done", provenance: { producer: "rules" } });
    expect(tono.calls).toBe(0);
  });

  it("tries the own key after Tono AI fails, and keeps the first reason when both fail", async () => {
    const tono = fake("tono_ai", ["rewind_notes"], async () => ({ ok: false as const, reason: "error" as const, message: "Tono AI didn't send back usable notes." }));
    const own = fake("own_key", ["rewind_notes"], async () => {
      throw new TypeError("Network request failed");
    });
    const result = await createAnalysisService({ providers: [tono, own], record: async () => undefined }).request("rewind_notes", { transcript: "t" }, ctx({ ownKey: "openai" }));
    expect(own.calls).toBe(1);
    expect(result).toEqual({ status: "unavailable", reason: "error", message: "Tono AI didn't send back usable notes." });
  });

  it("says why when nothing may run: opted out, signed out", async () => {
    const tono = fake("tono_ai", ["take_review"], ok("review", "tono_ai"));
    const service = createAnalysisService({ providers: [tono], record: async () => undefined });
    expect(await service.request("take_review", {} as never, ctx({ takeOptIn: false }))).toEqual({ status: "unavailable", reason: "opted_out" });
    expect(await service.request("take_review", {} as never, ctx({ tono: { ...ctx().tono, signedIn: false } }))).toEqual({ status: "unavailable", reason: "signed_out" });
    expect(tono.calls).toBe(0);
  });

  it("records an unavailable judged result on the take, so a relaunch knows what happened", async () => {
    const record = jest.fn(async () => undefined);
    const tono = fake("tono_ai", ["take_review"], async () => {
      throw new TonoApiError(402, "plus_cost_cap");
    });
    await createAnalysisService({ providers: [tono], record }).request("take_review", {} as never, ctx(), { takeId: "t2" });
    expect(record).toHaveBeenLastCalledWith("t2", "take_review", expect.objectContaining({ status: "unavailable", reason: "cost_cap" }));
  });

  it("lets a screen watch a take's analyses", () => {
    const watch = jest.fn(() => () => undefined);
    const service = createAnalysisService({ providers: [], watch });
    const cb = jest.fn();
    service.observe("t3", cb);
    expect(watch).toHaveBeenCalledWith("t3", cb);
  });
});
