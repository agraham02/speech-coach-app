import { DEFAULT_CONFIG, priceAt } from "../../../../../supabase/functions/_shared/config";
import { TTS_VOICE_NAMES } from "../../../../../supabase/functions/_shared/conversation";
import { buildConversationTurn, CONVERSATION_FOCUSES, CONVERSATION_MOVES } from "../../../../../supabase/functions/_shared/prompts/conversation";
import { summarizeAttempt } from "../../attemptMetrics";
import type { TurnMeasurement } from "../../evaluateConversation";
import { costPerMinuteUsd, HEAVY_MINUTE, TYPICAL_MINUTE } from "../cost";
import { acceptDebrief, DEBRIEF_MOVES, rulesDebrief } from "../debrief";
import { evaluateLive, threadsOf, type LiveTurnInput } from "../evaluateLive";
import { LESSON_FOCUS, LIVE_FOCUSES, prepareLive } from "../prepareLive";
import { latencySummary, NdjsonReader, percentiles, toConverseEvent } from "../stream";
import { clampSpeed, LAB_EXTRA_VOICES, PARTNER_VOICES, speedLabel, voiceFor } from "../voices";
import { LIVE_SETTINGS, QUESTION_SETTING } from "../../../../content/liveScenes";
import { getLesson } from "../../../../content/lessons";

function m(transcript: string, latencyMs = 1500, speakingMs = 3000): TurnMeasurement {
  const partnerEndAt = 10_000;
  return {
    transcript,
    partnerEndAt,
    listenStartAt: partnerEndAt + 300,
    volume: [],
    firstResultAt: transcript ? partnerEndAt + latencyMs + 400 : null,
    lastResultAt: transcript ? partnerEndAt + latencyMs + speakingMs + 400 : null,
  };
}

const turn = (partnerText: string, reply: string, extra: Partial<LiveTurnInput> = {}, latencyMs?: number): LiveTurnInput => ({
  partnerText,
  measurement: m(reply, latencyMs),
  cutOff: false,
  partnerSkipped: false,
  ...extra,
});

describe("scoring a live conversation: process only", () => {
  const portugal = "I just got back from a week in Portugal. The food was unreal.";

  it("credits asking and picking up their words, never how good the reply was", () => {
    const { outcome, details } = evaluateLive(
      "thread",
      [turn(portugal, "oh nice what was the food like in portugal"), turn("Custard tarts every morning.", "i love that")],
      { endedBy: "partner", seconds: 90 },
    );
    expect(details.turns[0]).toMatchObject({ replied: true, asked: true, picked: ["portugal", "food"], score: 1 });
    expect(details.turns[1]).toMatchObject({ replied: true, asked: false, score: 0 });
    expect(outcome).toMatchObject({ score: 0.5, success: false, summary: "Asked about them in 1 of 2 replies" });
  });

  it("never scores a blank, and notes coming back in after one", () => {
    const { outcome, details } = evaluateLive(
      "thread",
      [turn(portugal, ""), turn("The custard tarts, mostly.", "wait what are custard tarts")],
      { endedBy: "partner", seconds: 60 },
    );
    expect(details.turns[0]).toMatchObject({ blank: true, replied: false, score: null });
    expect(details.turns[1].cameBack).toBe(true);
    expect(details.turns[1].notes).toContain("Came back in after a pause");
    expect(details.blanks).toBe(1);
    expect(outcome?.score).toBe(1);
    // One scored reply is too few to pass (and a blank never counts against it).
    expect(outcome?.success).toBe(false);
  });

  it("records nothing when nothing was said", () => {
    const { outcome } = evaluateLive("reply", [turn(portugal, ""), turn("Hello?", "um")], { endedBy: "blanks", seconds: 40 });
    expect(outcome).toBeNull();
  });

  it("looks for point first and a clean stop in a land-the-plane conversation", () => {
    const good = evaluateLive("land", [turn("So what do you do?", "i teach high school science. mostly chemistry, which i love.")], { endedBy: "you", seconds: 30 });
    expect(good.details.turns[0].rambling?.pointFirst).toBe(true);
    expect(good.details.turns[0].notes).toContain("Clean ending");
    const cut = evaluateLive("land", [turn("So what do you do?", "so basically it's a long story and", { cutOff: true })], { endedBy: "you", seconds: 60 });
    expect(cut.details.turns[0].notes).toContain("Still going when the turn ended");
    expect(cut.details.turns[0].score).toBeLessThan(good.details.turns[0].score!);
  });

  it("takes a beat: a breath before replying, without punishing a quick reply hard", () => {
    const quick = evaluateLive("beat", [turn(portugal, "oh nice", {}, 300)], { endedBy: "you", seconds: 20 });
    const beat = evaluateLive("beat", [turn(portugal, "oh nice", {}, 1600)], { endedBy: "you", seconds: 20 });
    expect(beat.details.turns[0].score).toBe(1);
    expect(quick.details.turns[0].score).toBe(0.6);
  });

  it("stores metrics the Progress screen already reads", () => {
    const { details } = evaluateLive("thread", [turn(portugal, "what did you eat")], { endedBy: "you", seconds: 20 });
    const summary = summarizeAttempt({ ...details, selfFocusBefore: 6, selfFocusAfter: 3 });
    expect(summary).toEqual({ latencyMs: 1500, asked: true, selfFocusBefore: 6, selfFocusAfter: 3 });
  });

  it("finds their words worth picking up", () => {
    expect(threadsOf("I just got back from a week in Portugal.")).toEqual(["week", "portugal"]);
  });
});

describe("the debrief is checked against what was said", () => {
  const replies = ["oh nice what was the best thing you ate", "", "every morning wow where was the best one"];
  const good = {
    moments: [
      { turn: 1, move: "asked_about_them", quote: "what was the best thing you ate" },
      { turn: 3, move: "used_their_words", quote: "Every morning, wow!" },
      { turn: 3, move: "came_back", quote: "where was the best one" },
    ],
    strength: "You kept asking about what they said.",
    tryNext: "When they mention a place, ask one thing about it.",
  };

  it("keeps real quotes from the right turn", () => {
    const d = acceptDebrief(good, replies);
    expect(d?.moments).toHaveLength(3);
    expect(d?.moments[1].quote).toBe("Every morning, wow!");
  });

  it("drops quotes that weren't said, quotes from a blank turn, unknown moves and bad turn numbers", () => {
    const d = acceptDebrief(
      {
        ...good,
        moments: [
          { turn: 1, move: "asked_about_them", quote: "tell me about Portugal" },
          { turn: 2, move: "came_back", quote: "anything" },
          { turn: 1, move: "was_witty", quote: "what was the best thing" },
          { turn: 9, move: "reacted", quote: "nice" },
        ],
      },
      replies,
    );
    expect(d?.moments).toEqual([]);
  });

  it("refuses a debrief that grades the person", () => {
    expect(acceptDebrief({ ...good, strength: "That was a clever answer, 8/10." }, replies)).toBeNull();
    expect(acceptDebrief({ ...good, tryNext: "Your score was 60%." }, replies)).toBeNull();
    expect(acceptDebrief({ ...good, strength: "" }, replies)).toBeNull();
    expect(acceptDebrief(null, replies)).toBeNull();
  });

  it("has a rules version from the phone's own counts", () => {
    const { details } = evaluateLive(
      "thread",
      [turn("Portugal was great.", "what was great about portugal"), turn("The food.", ""), turn("Tarts.", "tarts sound good")],
      { endedBy: "partner", seconds: 80 },
    );
    const d = rulesDebrief(details, ["what was great about portugal", "", "tarts sound good"]);
    expect(d.strength).toMatch(/came back in/);
    expect(d.moments.map((x) => x.move)).toEqual(["used_their_words", "came_back"]);
    expect(d.tryNext).toMatch(/ask about it/);
  });

  it("uses the server's moves and focuses (the two lists match)", () => {
    expect([...DEBRIEF_MOVES]).toEqual([...CONVERSATION_MOVES]);
    expect([...LIVE_FOCUSES]).toEqual([...CONVERSATION_FOCUSES]);
  });
});

describe("the stream from ai-converse", () => {
  it("reads lines split anywhere and skips junk", () => {
    const r = new NdjsonReader();
    const events = [...r.push('{"type":"line","line":"Hi there.","mood":"warm","ended":false,"safety":"ok"}\n{"type":"au'), ...r.push('dio","pcm":"AAAA"}\nnot json\n'), ...r.push('{"type":"done"'), ...r.end()];
    expect(events).toHaveLength(2);
    expect(toConverseEvent(events[0])).toMatchObject({ type: "line", line: "Hi there." });
    expect(toConverseEvent(events[1])).toEqual({ type: "audio", pcm: "AAAA" });
  });

  it("checks every event", () => {
    expect(toConverseEvent({ type: "line", line: "" })).toBeNull();
    expect(toConverseEvent({ type: "line", line: "Bye", safety: "crisis" })).toMatchObject({ ended: true, safety: "crisis" });
    expect(toConverseEvent({ type: "audio", pcm: 5 })).toBeNull();
    expect(toConverseEvent({ type: "bogus" })).toBeNull();
    expect(toConverseEvent({ type: "done", voice: { model: "m", seconds: 3.2, streamed: true }, timing: { llmMs: 480, totalMs: 1900 } })).toMatchObject({
      voice: { model: "m", seconds: 3.2, streamed: true },
      timing: { llmMs: 480, ttsFirstAudioMs: null, totalMs: 1900 },
      sampleRate: 24000,
    });
  });

  it("summarizes latency for the lab", () => {
    expect(latencySummary({ sentAt: 1000, lineAt: 1600, firstAudioAt: 2100, doneAt: 5000, server: null })).toEqual({ toLineMs: 600, toFirstAudioMs: 1100, totalMs: 4000 });
    expect(percentiles([5, 1, 3, 2, 4, 9, 8, 7, 6, 10])).toEqual({ median: 5, p90: 9, n: 10 });
    expect(percentiles([])).toEqual({ median: null, p90: null, n: 0 });
  });
});

describe("voices", () => {
  it("offers only voices the server accepts", () => {
    for (const v of [...PARTNER_VOICES, ...LAB_EXTRA_VOICES]) expect(TTS_VOICE_NAMES).toContain(v.id);
    for (const s of [...Object.values(LIVE_SETTINGS), QUESTION_SETTING]) for (const p of s.personas) expect(TTS_VOICE_NAMES).toContain(p.voice);
  });

  it("uses each person's own voice, or the one chosen", () => {
    expect(voiceFor("persona", "Sulafat")).toBe("Sulafat");
    expect(voiceFor("Umbriel", "Sulafat")).toBe("Umbriel");
    expect(voiceFor("NotAVoice", "Sulafat")).toBe("Sulafat");
  });

  it("keeps speed in a narrow, natural range", () => {
    expect(clampSpeed(2)).toBe(1.15);
    expect(clampSpeed(0.5)).toBe(0.85);
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(speedLabel(0.9)).toBe("10% slower");
    expect(speedLabel(1)).toBe("Normal");
  });
});

describe("setting up a live conversation", () => {
  it("covers every conversation lesson that exists", () => {
    for (const id of Object.keys(LESSON_FOCUS)) expect(getLesson(id)?.skill).toBe("conversation");
  });

  it("opens with a question for land-the-plane, shop talk for the outsider", () => {
    expect(prepareLive("land", 1, 3).scene.opener).toMatch(/\?$/);
    expect(prepareLive("outsider", 5, 3).contentId).toMatch(/^po/);
    expect(prepareLive("thread", 1, 3, "pw01").scene.opener).toBe("I just got back from a week in Portugal. The food was unreal.");
  });

  it("gets longer as the level rises", () => {
    expect(prepareLive("reply", 1, 0).maxReplies).toBe(4);
    expect(prepareLive("reply", 10, 0).maxReplies).toBe(6);
  });

  it("builds a valid server request from the setup", () => {
    const s = prepareLive("thread", 2, 11);
    const built = buildConversationTurn({
      scene: s.scene,
      focus: s.focus,
      level: s.contentLevel,
      history: [
        { who: "partner", text: s.scene.opener },
        { who: "you", text: "tell me more" },
      ],
      turnsLeft: 2,
      stutterMode: false,
    });
    expect(built.prompt).toContain(s.scene.partner.name);
  });
});

describe("cost per minute", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const later = new Date("2027-01-02T00:00:00Z");
  const text = priceAt(DEFAULT_CONFIG.prices["gemini-3.5-flash-lite"], now);
  const tts = priceAt(DEFAULT_CONFIG.prices["gemini-3.8-flash-lite-tts"], now);
  const tts2027 = priceAt(DEFAULT_CONFIG.prices["gemini-3.8-flash-lite-tts"], later);

  it("matches the prompt the server really builds", () => {
    const s = prepareLive("thread", 2, 11);
    const built = buildConversationTurn({ scene: s.scene, focus: s.focus, level: 2, history: [{ who: "partner", text: s.scene.opener }, { who: "you", text: "x" }], turnsLeft: 2, stutterMode: false });
    // About 4 characters a token in English.
    const tokens = built.prompt.length / 4;
    expect(tokens).toBeGreaterThan(TYPICAL_MINUTE.promptBaseTokens * 0.7);
    expect(tokens).toBeLessThan(TYPICAL_MINUTE.promptBaseTokens * 1.3);
  });

  it("is about half a cent a minute now, and under a cent in 2027", () => {
    const typical = costPerMinuteUsd(TYPICAL_MINUTE, text, tts);
    expect(typical.total).toBeGreaterThan(0.003);
    expect(typical.total).toBeLessThan(0.006);
    expect(costPerMinuteUsd(TYPICAL_MINUTE, text, tts2027).total).toBeLessThan(0.01);
    expect(costPerMinuteUsd(HEAVY_MINUTE, text, tts2027).total).toBeLessThan(0.015);
  });

  it("keeps a 120-minute month inside the $2.50 cap on its own, even chatty and at 2027 prices", () => {
    expect(120 * costPerMinuteUsd(TYPICAL_MINUTE, text, tts).total).toBeLessThan(0.6);
    expect(120 * costPerMinuteUsd(HEAVY_MINUTE, text, tts2027).total).toBeLessThan(DEFAULT_CONFIG.limits.paidCostCapUsd * 0.6);
  });
});
