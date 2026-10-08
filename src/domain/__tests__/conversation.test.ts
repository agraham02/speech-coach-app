import { countQuestions, isQuestionLike } from "../conversation/questions";
import { contentWords, mentions, stem } from "../conversation/text";
import { ramblingMetrics } from "../coach/ramblingMetrics";
import { prepareConversation } from "../conversation/prepareConversation";
import { echoAskAdd, evaluateConversation, replyTiming, type TurnMeasurement } from "../conversation/evaluateConversation";
import { assignPartnerVoices } from "../conversation/voices";
import { missionsForDate, predictionMessage, summarizePredictions } from "../conversation/realWorld";
import { CONVERSATION_DRILLS, DRILL_SKILL, paramsFor } from "../drills/drillSpecs";
import {
  CALLBACK_SCRIPTS,
  EVERYDAY_QUESTIONS,
  GROUP_SCENES,
  MISSIONS,
  PARTNER_ITEMS,
  REACTION_LINES,
  SQUEEZE_TOPICS,
} from "../../content/conversationContent";

// A reply that started `latencyMs` after the partner stopped and lasted
// `speakMs`, as the screen would measure it (no volume meter).
function measured(transcript: string, latencyMs = 1500, speakMs = 3000, segments?: string[]): TurnMeasurement {
  const partnerEndAt = 100_000;
  const firstResultAt = transcript ? partnerEndAt + latencyMs + 400 : null;
  return {
    transcript,
    segments,
    partnerEndAt,
    listenStartAt: partnerEndAt + 300,
    volume: [],
    firstResultAt,
    lastResultAt: firstResultAt == null ? null : firstResultAt + speakMs,
  };
}

describe("question detection (no punctuation)", () => {
  it.each([
    "how did you end up there",
    "wait did you actually finish it",
    "what was the best part",
    "so what kind of food was it",
    "tell me about the trip",
    "was it hard",
    "Is that normal?",
  ])("finds a question in %p", (text) => {
    expect(isQuestionLike(text)).toBe(true);
  });

  it.each([
    "that sounds amazing",
    "when i was a kid we went there",
    "i did it last year too",
    "what i mean is it was fine",
    "we were there in june",
    "you know what",
  ])("doesn't see a question in %p", (text) => {
    expect(isQuestionLike(text)).toBe(false);
  });

  it("counts more than one", () => {
    expect(countQuestions("how was it and did you go back")).toBe(2);
  });
});

describe("text helpers", () => {
  it("stems common endings", () => {
    expect(stem("dispatching")).toBe("dispatch");
    expect(stem("dispatched")).toBe("dispatch");
    expect(stem("candies")).toBe("candy");
    expect(stem("gas")).toBe("gas");
  });

  it("finds a topic word or phrase across inflections", () => {
    expect(mentions("how long have you been climbing", "rock climbing")).toBe(false);
    expect(mentions("how long have you been rock climbing", "rock climbing")).toBe(true);
    expect(mentions("what was the best dish in portugal", "Portugal")).toBe(true);
    expect(mentions("what's the dispatching like", "dispatch")).toBe(true);
  });

  it("keeps only content words", () => {
    expect(contentWords("I just got back from a week in Portugal")).toEqual(["week", "portugal"]);
  });
});

describe("rambling metrics", () => {
  it("sees a point-first answer with a clean stop", () => {
    const m = ramblingMetrics({ transcript: "I'd pick the mountains. The quiet resets me. That's my answer." });
    expect(m).toMatchObject({ pointFirst: true, sentencesBeforePoint: 0, trailingOff: false });
  });

  it("notices a preamble before the point", () => {
    const m = ramblingMetrics({ transcript: "That's a good question. Well. I think the mountains, because it's quiet." });
    expect(m.sentencesBeforePoint).toBe(2);
    expect(m.pointFirst).toBe(false);
  });

  it("uses recognizer segments when there's no punctuation", () => {
    const m = ramblingMetrics({
      transcript: "so um let me think i guess the mountains because they're quiet so yeah",
      segments: ["so um let me think", "i guess the mountains because they're quiet", "so yeah"],
    });
    expect(m.sentencesBeforePoint).toBe(1);
    expect(m.trailingOff).toBe(true);
  });

  it("counts detours and restarts", () => {
    const m = ramblingMetrics({
      transcript: "We went to Lisbon. By the way the flight was awful. Anyway, I mean, let me start over. Lisbon was great.",
    });
    expect(m.tangentMarkers).toBe(2);
    expect(m.restarts).toBe(2);
  });

  it("reports length against the budget", () => {
    expect(ramblingMetrics({ transcript: "Short answer here.", durationSeconds: 30, budgetSeconds: 20 }).lengthVsBudget).toBe(1.5);
    expect(ramblingMetrics({ transcript: "Short answer here." }).lengthVsBudget).toBeNull();
  });
});

describe("reply timing", () => {
  it("falls back to recognition time without a volume meter", () => {
    const t = replyTiming(measured("hello there friend", 1500, 3000));
    expect(t.latencyMs).toBe(1500);
    expect(t.speakingMs).toBe(3000);
  });

  it("prefers the volume onset when it agrees with recognition", () => {
    const m = measured("hello there friend", 2000);
    // voice starts 1.2 s after the mic opened (300 ms after the partner stopped)
    m.volume = [
      { tMs: 1000, value: -1 },
      { tMs: 1200, value: 3 },
      { tMs: 1300, value: 4 },
    ];
    expect(replyTiming(m).latencyMs).toBe(1500);
  });

  it("is null when nothing was heard", () => {
    expect(replyTiming(measured("")).latencyMs).toBeNull();
  });
});

describe("echo – ask – add", () => {
  const partner = "I just got back from a week in Portugal. The food was unreal.";
  it("finds all three", () => {
    expect(echoAskAdd(partner, "portugal food huh what was the best thing you ate i went to spain once and my favorite was the bread")).toEqual({
      echo: true,
      ask: true,
      add: true,
    });
  });
  it("finds none in a bare 'cool'", () => {
    expect(echoAskAdd(partner, "cool nice")).toEqual({ echo: false, ask: false, add: false });
  });
});

describe("prepare + evaluate conversation drills", () => {
  it("builds a playable setup for every conversation drill at every level", () => {
    for (const type of CONVERSATION_DRILLS) {
      for (const level of [1, 5, 10]) {
        const setup = prepareConversation(type, level, 42, undefined, { id: "bm1", text: "We should totally do that again sometime" });
        expect(setup.turns.length).toBeGreaterThan(0);
        for (const turn of setup.turns) expect(turn.lines.length).toBeGreaterThan(0);
        expect(setup.replyWindowMs).toBeGreaterThan(0);
        expect(setup.maxWaitMs).toBeGreaterThan(setup.replyWindowMs);
        expect(DRILL_SKILL[type]).toBe("conversation");
      }
    }
  });

  it("only ever widens the reply window at lower levels", () => {
    expect(paramsFor("conv_reply", 1).replyWindowSec!).toBeGreaterThan(paramsFor("conv_reply", 10).replyWindowSec!);
    expect(paramsFor("conv_held", 10).holdSeconds!).toBeGreaterThan(paramsFor("conv_held", 1).holdSeconds!);
    expect(paramsFor("land_plane", 1).budgetSeconds!).toBeGreaterThan(paramsFor("land_plane", 10).budgetSeconds!);
  });

  it("scores a thread question that picks up their words", () => {
    const setup = prepareConversation("conv_thread", 1, 0, "pw01");
    const good = evaluateConversation(setup, [measured("oh nice what was the best food in portugal")]);
    expect(good.outcome.success).toBe(true);
    expect(good.details.turns[0].picked).toContain("portugal");
    const flat = evaluateConversation(setup, [measured("that sounds really nice")]);
    expect(flat.outcome.success).toBe(false);
    expect(flat.outcome.score).toBe(0);
  });

  it("never penalizes replying fast", () => {
    const setup = prepareConversation("conv_reply", 1, 0, "pw01");
    const fast = evaluateConversation(setup, [measured("no way that sounds amazing", 200)]);
    expect(fast.outcome.score).toBe(1);
    expect(fast.outcome.success).toBe(true);
    const slow = evaluateConversation(setup, [measured("no way that sounds amazing", 20_000)]);
    expect(slow.outcome.score).toBeGreaterThanOrEqual(0.5);
    expect(slow.outcome.success).toBe(false);
  });

  it("rewards a beat between one and two and a half seconds", () => {
    const setup = prepareConversation("conv_beat", 1, 0, "pw01");
    expect(evaluateConversation(setup, [measured("oh nice how was it", 1500)]).outcome.success).toBe(true);
    expect(evaluateConversation(setup, [measured("oh nice how was it", 300)]).outcome.success).toBe(false);
  });

  it("treats silence kindly and as not replied", () => {
    const setup = prepareConversation("conv_reply", 1, 0, "pw01");
    const r = evaluateConversation(setup, [measured("")]);
    expect(r.details.turns[0].replied).toBe(false);
    expect(r.details.turns[0].notes[0]).toMatch(/okay/);
  });

  it("checks land-the-plane on point, time and ending", () => {
    const setup = prepareConversation("land_plane", 1, 0, "eq02");
    const budget = setup.turns[0].budgetSeconds!;
    const clean = evaluateConversation(setup, [measured("It was great. I finally went hiking with my brother and we found a waterfall.", 1000, (budget - 10) * 1000)]);
    expect(clean.outcome.success).toBe(true);
    const ramble = evaluateConversation(setup, [
      measured("um so let me think. well. it was kind of fine i guess and then we did some stuff so yeah", 1000, (budget + 30) * 1000, [
        "let me think",
        "well",
        "it was kind of fine i guess and then we did some stuff so yeah",
      ]),
    ]);
    expect(ramble.outcome.success).toBe(false);
    expect(ramble.details.turns[0].notes.join(" ")).toMatch(/later/);
  });

  it("checks a callback in the last reply", () => {
    const setup = prepareConversation("callback", 1, 0, "cb01");
    const r = evaluateConversation(setup, [
      measured("no way what did biscuit do after"),
      measured("short staffed sounds rough"),
      measured("nothing big maybe guard my sandwiches from biscuit"),
    ]);
    expect(r.outcome.success).toBe(true);
  });

  it("checks squeeze timing and that the short take keeps the story", () => {
    const setup = prepareConversation("squeeze", 1, 0, "sq06");
    const long = "I got lost in Tokyo at night. My phone died near the station. A stranger walked me to the hotel and refused any thanks.";
    const r = evaluateConversation(setup, [
      measured(long, 1000, 55_000),
      measured("I got lost in Tokyo, my phone died, a stranger walked me to the hotel.", 1000, 28_000),
      measured("Lost in Tokyo, phone dead, a stranger got me to the hotel.", 1000, 14_000),
    ]);
    expect(r.details.retention).toBeGreaterThan(0.5);
    expect(r.outcome.success).toBe(true);
  });

  it("uses the self-rating for reactions", () => {
    const setup = prepareConversation("conv_react", 1, 0, "rx01");
    expect(evaluateConversation(setup, [measured("no way for three years")], { selfRating: 5 }).outcome.success).toBe(true);
    expect(evaluateConversation(setup, [measured("no way for three years")], { selfRating: 2 }).outcome.success).toBe(false);
  });

  it("replays a moment you blanked with its own words as threads", () => {
    const setup = prepareConversation("conv_replay", 3, 0, undefined, { id: "bm1", text: "We're switching the whole team to a new dashboard" });
    expect(setup.contentId).toBe("bm1");
    expect(setup.turns[0].threads).toContain("dashboard");
  });
});

describe("partner voices", () => {
  it("gives each role a different English voice when there are enough", () => {
    const v = assignPartnerVoices([
      { identifier: "fr1", language: "fr-FR" },
      { identifier: "us1", language: "en-US", quality: "Enhanced" },
      { identifier: "gb1", language: "en-GB" },
      { identifier: "us2", language: "en-US" },
    ]);
    expect(v.a.voice).toBe("us1");
    expect(new Set([v.a.voice, v.b.voice, v.c.voice]).size).toBe(3);
  });

  it("falls back to pitch when voices run out", () => {
    const v = assignPartnerVoices([{ identifier: "us1", language: "en-US" }]);
    expect(v.a.pitch).not.toBe(v.b.pitch);
    expect(v.b.voice).toBe("us1");
  });
});

describe("real-world loop", () => {
  it("picks two different missions, stable within a day", () => {
    const today = missionsForDate("2026-10-08");
    expect(today).toHaveLength(2);
    expect(today[0].id).not.toBe(today[1].id);
    expect(missionsForDate("2026-10-08")).toEqual(today);
  });

  it("summarizes predicted vs actual", () => {
    const s = summarizePredictions([
      { predicted: 8, actual: 4 },
      { predicted: 6, actual: 5 },
      { predicted: 5, actual: 6 },
    ]);
    expect(s).toMatchObject({ count: 3, avgPredicted: 6.3, avgActual: 5, avgGap: 1.3 });
    expect(s.betterOrSameShare).toBe(0.67);
    expect(predictionMessage(s)).toMatch(/less awkward/);
    expect(predictionMessage(summarizePredictions([]))).toMatch(/Prime/);
  });
});

describe("conversation content", () => {
  it("every partner item has threads the line actually contains", () => {
    for (const item of PARTNER_ITEMS) {
      expect(item.threads.length).toBeGreaterThan(0);
      for (const t of item.threads) expect(mentions(item.text, t)).toBe(true);
    }
  });

  it("has unique ids across every pool", () => {
    const ids = [
      ...PARTNER_ITEMS.map((p) => p.id),
      ...GROUP_SCENES.map((g) => g.id),
      ...EVERYDAY_QUESTIONS.map((e) => e.id),
      ...SQUEEZE_TOPICS.map((s) => s.id),
      ...CALLBACK_SCRIPTS.map((c) => c.id),
      ...REACTION_LINES.map((r) => r.id),
      ...MISSIONS.map((m) => m.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("group scenes and callback scripts are well formed", () => {
    for (const scene of GROUP_SCENES) {
      expect(scene.exchanges.length).toBeGreaterThanOrEqual(3);
      for (const e of scene.exchanges) for (const t of e.threads) expect(mentions(e.lines.map((l) => l.text).join(" "), t)).toBe(true);
    }
    for (const script of CALLBACK_SCRIPTS) {
      expect(script.lines).toHaveLength(3);
      expect(script.callbackWords.some((w) => mentions(script.lines[0], w))).toBe(true);
    }
  });

  it("has enough material at every level", () => {
    for (const level of [1, 2, 3]) {
      expect(PARTNER_ITEMS.filter((p) => p.level === level).length).toBeGreaterThanOrEqual(8);
      expect(EVERYDAY_QUESTIONS.filter((e) => e.level === level).length).toBeGreaterThanOrEqual(8);
    }
  });
});
