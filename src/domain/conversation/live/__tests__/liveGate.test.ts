import { conversationMinutesLine, type TonoAllowance } from "../../../aiAllowance";
import { withAllowance, SIGNED_OUT } from "../../../account";
import { liveConversationGate, routeAnalysis } from "../../../analysis/routing";
import type { AnalysisContext } from "../../../analysis/types";
import { addRun, labTable, type LabRun } from "../../../dev/partnerVoiceLab";

const ctx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  tier: "plus",
  tono: { consent: true, allowed: { take: true, text: true, insight: true, conversation: true }, killSwitch: false },
  isAdult: true,
  minorsMayUseAi: false,
  takeOptIn: true,
  judgeInput: "text",
  hasVideo: false,
  hasTranscript: true,
  flags: {},
  ...patch,
});

const minutes = (total: number | null, left: number | null) => ({ total, left });

describe("the live conversation gate", () => {
  it("opens for Plus and the trial with minutes left and consent", () => {
    expect(liveConversationGate(ctx(), minutes(120, 90))).toEqual({ open: true });
    expect(liveConversationGate(ctx({ tier: "trial" }), minutes(30, 30))).toEqual({ open: true });
    // Before the server has said anything, a subscriber isn't blocked on a guess.
    expect(liveConversationGate(ctx(), minutes(null, null))).toEqual({ open: true });
  });

  it("is locked (the quiet Plus line) for a free account, known or not yet known", () => {
    expect(liveConversationGate(ctx({ tier: "free" }), minutes(0, 0))).toEqual({ open: false, reason: "not_entitled", locked: true });
    expect(liveConversationGate(ctx({ tier: "free" }), minutes(null, null))).toEqual({ open: false, reason: "not_entitled", locked: true });
  });

  it("opens for a free sample when the server gives free minutes", () => {
    expect(liveConversationGate(ctx({ tier: "free" }), minutes(3, 3))).toEqual({ open: true });
    expect(liveConversationGate(ctx({ tier: "free" }), minutes(3, 0))).toEqual({ open: false, reason: "quota", locked: true });
  });

  it("tells a subscriber who used the minutes when they come back, and sells nothing", () => {
    expect(liveConversationGate(ctx(), minutes(120, 0))).toEqual({ open: false, reason: "quota", locked: false });
    expect(liveConversationGate(ctx({ tier: "beta" }), minutes(30, 0))).toEqual({ open: false, reason: "quota", locked: false });
  });

  it("is shut, with nothing to buy, under 18 or with the kill switch", () => {
    expect(liveConversationGate(ctx({ isAdult: false }), minutes(120, 120))).toEqual({ open: false, reason: "age_gate", locked: false });
    expect(liveConversationGate(ctx({ isAdult: false, minorsMayUseAi: true }), minutes(120, 120))).toEqual({ open: true });
    expect(liveConversationGate(ctx({ tono: { ...ctx().tono, killSwitch: true } }), minutes(120, 120))).toEqual({ open: false, reason: "kill_switch", locked: false });
  });

  it("asks for consent last", () => {
    expect(liveConversationGate(ctx({ tono: { ...ctx().tono, consent: false } }), minutes(120, 120))).toEqual({ open: false, reason: "no_consent", locked: false });
  });
});

describe("the debrief's routing", () => {
  it("goes to Tono AI then the rules, and never needs minutes left", () => {
    const used = ctx({ tono: { ...ctx().tono, allowed: { take: false, text: false, insight: false, conversation: false } } });
    expect(routeAnalysis("conversation_debrief", used).producers).toEqual(["tono_ai", "rules"]);
    expect(routeAnalysis("conversation_debrief", ctx({ tier: "free" }))).toMatchObject({ producers: ["rules"], blocked: "not_entitled" });
    expect(routeAnalysis("conversation_debrief", ctx({ isAdult: false }))).toMatchObject({ producers: ["rules"], blocked: "age_gate" });
  });
});

describe("minutes in the allowance", () => {
  const allowance = (patch: Partial<TonoAllowance>): TonoAllowance => ({
    plan: "plus",
    tier: "plus",
    takesLeft: 10,
    takesTotal: 60,
    resetsAt: "2026-12-01T00:00:00.000Z",
    trialEndsAt: null,
    conversationMinutesLeft: 90,
    conversationMinutesTotal: 120,
    ...patch,
  });

  it("says what's left, or when more come", () => {
    expect(conversationMinutesLine(allowance({}))).toBe("90 of 120 conversation minutes left this month");
    expect(conversationMinutesLine(allowance({ conversationMinutesLeft: 0 }))).toBe("No conversation minutes left this month · more on 1 December");
    expect(conversationMinutesLine(allowance({ tier: "trial", plan: "trial", conversationMinutesLeft: 0, conversationMinutesTotal: 30 }))).toBe("You've used the conversation minutes in your trial.");
    expect(conversationMinutesLine(allowance({ tier: "free", plan: "free", conversationMinutesTotal: 0, conversationMinutesLeft: 0 }))).toBe("");
    expect(conversationMinutesLine(null)).toBe("");
  });

  it("moves the account's conversation flag with each allowance the server sends", () => {
    const signedIn = { ...SIGNED_OUT, status: "signedIn" as const, userId: "u" };
    expect(withAllowance(signedIn, allowance({ conversationMinutesLeft: 0 })).allowed.conversation).toBe(false);
    expect(withAllowance(signedIn, allowance({ conversationMinutesLeft: 5 })).allowed.conversation).toBe(true);
    // A server that doesn't send minutes leaves the flag as it was.
    expect(withAllowance(signedIn, allowance({ conversationMinutesLeft: undefined })).allowed.conversation).toBe(true);
  });
});

describe("the Partner voices lab table", () => {
  const run = (voice: string, kind: LabRun["kind"], firstSound: number | null, error?: string): LabRun => ({
    at: "2026-10-24T12:00:00Z",
    kind,
    voice,
    speed: 1,
    session: "conversation",
    line: "x",
    toLineMs: 100,
    toFirstSoundMs: firstSound,
    totalMs: 3000,
    server: null,
    audioSeconds: 3,
    streamed: true,
    ...(error ? { error } : {}),
  });

  it("puts the median and p90 first sound per voice, best rated first, leaving failures out", () => {
    let history: LabRun[] = [];
    for (const t of [600, 800, 700, 2000]) history = addRun(history, run("Achird", "speak", t));
    history = addRun(history, run("Achird", "turn", 1900));
    history = addRun(history, run("Sulafat", "speak", 900, "voice_failed"));
    const table = labTable(history, { Sulafat: 5, Achird: 3 });
    expect(table.map((r) => r.voice)).toEqual(["Sulafat", "Achird"]);
    expect(table[1]).toMatchObject({ runs: 5, firstSoundMedianMs: 700, firstSoundP90Ms: 2000, turnFirstSoundMedianMs: 1900, rating: 3 });
    expect(table[0]).toMatchObject({ runs: 0, firstSoundMedianMs: null });
  });
});
