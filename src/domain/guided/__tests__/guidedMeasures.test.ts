import { GUIDED } from "../../../content/lessons";
import { GUIDED_MEASURES, SELF_RATED_ONLY, isMeasured, scoreGuided, clipWpm, type Clip } from "../guidedMeasures";
import type { TimedWordInput } from "../../drills/timedHeard";

// A clip from text: Whisper-style words, 360 ms each with 60 ms between (about 140 words a minute), and
// optional extra gaps after given word numbers.
function say(text: string, gaps: Record<number, number> = {}, level = 5, startDelayMs = 800): Clip {
  const parts = text.split(/\s+/).filter(Boolean);
  let t = startDelayMs;
  const words: TimedWordInput[] = parts.map((w, i) => {
    const startMs = t;
    t = startMs + 360 + 60 + (gaps[i] ?? 0);
    return { text: w, startMs, endMs: startMs + 360 };
  });
  const volume = Array.from({ length: Math.ceil(t / 100) }, (_, i) => ({ tMs: i * 100, value: level }));
  return { text, words, volume, startDelayMs, spokenMs: t - startDelayMs };
}
const quick = (c: Clip): Clip => ({ ...c, words: null });

describe("the guided exercises", () => {
  it("every one is either measured or says why it is self-rated", () => {
    for (const g of GUIDED) {
      const measured = isMeasured(g.id);
      const selfOnly = g.id in SELF_RATED_ONLY;
      expect(measured !== selfOnly).toBe(true);
    }
    expect(Object.keys(GUIDED_MEASURES).length + Object.keys(SELF_RATED_ONLY).length).toBe(GUIDED.length);
  });

  it("the three self-rated ones are the pitch and stress exercises that are still on probation", () => {
    expect(Object.keys(SELF_RATED_ONLY).sort()).toEqual(["gd_emotion_read", "gd_emphasis", "gd_inflection"]);
  });

  it("every try records at a real step, in order, and every number says what it is", () => {
    for (const g of GUIDED) {
      const m = GUIDED_MEASURES[g.id];
      if (!m) continue;
      expect(m.explain.length).toBeGreaterThan(10);
      expect(m.tries.length).toBeGreaterThan(0);
      const steps = m.tries.map((t) => t.step);
      for (const s of steps) expect(s).toBeLessThan(g.steps.length);
      expect([...steps].sort((a, b) => a - b)).toEqual(steps);
      expect(new Set(steps).size).toBe(steps.length);
      expect(m.selfShare + (m.doneShare ?? 0)).toBeLessThan(1);
    }
  });
});

describe("what scores nothing", () => {
  it("says nothing was heard rather than scoring zero", () => {
    const r = scoreGuided("gd_story_questions", [null, null, null], null);
    expect(r.score).toBeNull();
    expect(r.gate).toMatchObject({ passed: false, kind: "failed" });
  });

  it("an exercise with no measure has no number", () => {
    expect(scoreGuided("gd_inflection", [say("a b c")], 4).score).toBeNull();
  });
});

describe("lines and questions", () => {
  it("Practice the blank: each line said calmly counts", () => {
    const clips = [say("good question give me a second"), say("I totally lost my thought go on"), say("wait tell me more about that")];
    expect(scoreGuided("gd_recover", clips, null).score).toBe(1);
  });

  it("Practice the blank: rushed lines count for half, wrong lines for nothing", () => {
    // 6 words in 1.2 s is far over 150 words a minute.
    const rushed: Clip = { ...say("good question give me a second"), words: say("good question give me a second").words!.map((w, i) => ({ ...w, startMs: i * 200, endMs: i * 200 + 150 })) };
    const r = scoreGuided("gd_recover", [rushed, say("banana banana banana"), null], null);
    expect(r.parts[0].ok).toBe(0.5);
    expect(r.parts[1].ok).toBe(0);
    expect(r.parts[2].note).toBe("Not said");
    expect(r.score).toBeCloseTo(0.5 / 3);
  });

  it("Turn facts into stories: a question each time, out of three", () => {
    const q = say("what is the most surprising part of your job?");
    expect(scoreGuided("gd_story_questions", [q, q, say("I work in an office")], null).score).toBeCloseTo(2 / 3);
  });

  it("One sentence then hand it back: needs the question and not a speech", () => {
    const good = say("I tried piano once and quit. What made you pick guitar?");
    const speech = say("I tried piano once and quit. Then I tried drums. Then I tried violin. Then I stopped. What made you pick guitar?");
    const noQuestion = say("I tried piano once and quit after a month");
    expect(scoreGuided("gd_me_too", [good, good], null).score).toBe(1);
    expect(scoreGuided("gd_me_too", [speech, noQuestion], null).score).toBe(0.25);
  });

  it("The short version: an offer to say more counts", () => {
    const offer = say("I run a small bakery. It's a long story if you ever want it.");
    expect(scoreGuided("gd_offer_more", [offer, offer], null).score).toBe(1);
  });

  it("Something plain, then a question: the comment has to come first", () => {
    const good = say("This place is packed tonight. Have you been here before?");
    const bad = say("Have you been here before?");
    expect(scoreGuided("gd_opener", [good, good, good], null).score).toBe(1);
    expect(scoreGuided("gd_opener", [bad, bad, bad], null).score).toBe(0);
  });

  it("Warm, reason, goodbye: beats found, out of six", () => {
    const all = say("I loved hearing about your trip. I'm going to grab some water. Talk soon!");
    const some = say("I loved hearing about your trip");
    expect(scoreGuided("gd_exit", [all, all], null).score).toBe(1);
    expect(scoreGuided("gd_exit", [all, some], null).score).toBeCloseTo(4 / 6);
  });

  it("Make it bigger: a reply that comes in time, out of three", () => {
    const quickReply = say("So it's a war now", {}, 5, 600);
    const slowReply = say("So it's a war now", {}, 5, 6000);
    const r = scoreGuided("gd_exaggerate", [quickReply, slowReply, null], null);
    expect(r.parts.map((p) => p.ok)).toEqual([1, 0.5, 0]);
  });

  it("Say it back: needs the question restated and answered", () => {
    const good = say("So which food do people hype too much? Avocado toast, mostly the price.");
    const bare = say("Avocado toast it is mostly the price");
    expect(scoreGuided("gd_buy_time", [good, good, good], null).score).toBe(1);
    expect(scoreGuided("gd_buy_time", [bare, bare, bare], null).score).toBeCloseTo(0.5);
  });

  it("Catch the detour: a detour phrase in the last try costs it", () => {
    const clean = say("I had a quiet morning and got a lot done");
    const detour = say("I had a quiet morning and by the way I saw a dog");
    expect(scoreGuided("gd_detours", [say("My morning was quiet."), clean], null).score).toBe(1);
    expect(scoreGuided("gd_detours", [say("My morning was quiet."), detour], null).score).toBe(0.5);
  });
});

describe("pace, pauses and volume", () => {
  it("Rate contrast: the faster the first telling than the slow one, up to 1.5 times", () => {
    const fast = say("I woke up late and ran for the bus and made it just in time");
    const slow = say("It was the most important thing", { 0: 400, 1: 400, 2: 400, 3: 400, 4: 400 });
    expect(clipWpm(fast)!).toBeGreaterThan(clipWpm(slow)! * 1.5);
    expect(scoreGuided("gd_rate_contrast", [fast, slow], null).score).toBe(1);
    expect(scoreGuided("gd_rate_contrast", [fast, fast], null).parts[1].ok).toBe(0);
  });

  it("Choppy, flowing, mixed: each version needs its own pause pattern", () => {
    const text = "I woke up it was raining I missed the bus I walked";
    const choppy = say(text, { 2: 500, 5: 500, 9: 500 });
    const flowing = say(text);
    const mix = say("I woke up to rain missed the bus and walked the whole way in soaked completely soaked", { 11: 500, 12: 500 });
    expect(scoreGuided("gd_rhythm", [choppy, flowing, mix], null).score).toBe(1);
    // Choppy told as one run, flowing told in bursts.
    expect(scoreGuided("gd_rhythm", [flowing, choppy, flowing], null).score).toBe(0);
  });

  it("Catch the um: fewer in the second 30 seconds, from Whisper's transcript", () => {
    const first = say("so um I woke up this morning and uh made some coffee and um read the news for a while and uh then I left for work", {}, 5);
    const second = say("this weekend I will go hiking with friends and then cook dinner at home");
    const same = say("so um I will go hiking and uh cook dinner and um read for a while and uh nap in the afternoon");
    expect(scoreGuided("gd_catch_um", [first, second], null).score).toBe(1);
    expect(scoreGuided("gd_catch_um", [first, same], null).parts[1].ok).toBe(0);
  });

  it("One breath, one phrase: pauses at the bars, from Whisper's times, over two reads", () => {
    const text = "When you speak breathe at the pauses not in the middle of a thought Each phrase gets its own breath and each sentence gets a full finish";
    const held = say(text, { 2: 500, 6: 500, 13: 500, 19: 500 });
    const straight = say(text);
    expect(scoreGuided("gd_phrase_breath", [held, held], null).score).toBeCloseTo(1);
    expect(scoreGuided("gd_phrase_breath", [straight, straight], null).score).toBe(0);
  });

  it("The power pause: two-second silences, out of six", () => {
    const run = say("I think we should stop now because it is late I think we should stop now because it is late I think we should stop", { 2: 2200, 9: 2200, 20: 2200 }, 5, 2500);
    const r = scoreGuided("gd_power_pause", [run], null);
    expect(r.score).toBeCloseTo(4 / 6);
  });

  it("Breath behind the volume: the end holding up, and the louder read", () => {
    const steady = say("I'd like to start with the most important part", {}, 6);
    const louder = say("I'd like to start with the most important part", {}, 7);
    expect(scoreGuided("gd_breath_volume", [steady, louder], null).score).toBeCloseTo(1);
    const fades: Clip = { ...steady, volume: steady.volume.map((v, i, all) => ({ ...v, value: i > all.length * 0.7 ? 1 : 6 })) };
    expect(scoreGuided("gd_breath_volume", [fades, fades], null).score).toBeLessThan(0.5);
  });

  it("without the transcription model, what needs times is held back, not failed", () => {
    const r = scoreGuided("gd_rhythm", [quick(say("a b c d e f")), quick(say("a b c d e f")), quick(say("a b c d e f"))], null);
    expect(r.parts.every((p) => p.ok === 0.5)).toBe(true);
  });
});

describe("your own rating", () => {
  it("Reframe it: a share comes from how energized you feel", () => {
    const first = say("I'm excited", {}, 5);
    const second = say("I'm excited", {}, 7);
    expect(scoreGuided("gd_reappraisal", [first, second], 5).score).toBe(1);
    expect(scoreGuided("gd_reappraisal", [first, second], 1).score).toBeCloseTo(0.6);
  });

  it("Reset before you speak: the sighs count for finishing, the line must be said", () => {
    const line = say("Thanks for having me let me start with a quick story", { 3: 300 });
    expect(scoreGuided("gd_breath_reset", [line], null).score).toBe(1);
    expect(scoreGuided("gd_breath_reset", [say("hello there my friends today")], null).score).toBe(0.5);
  });

  it("Where's my attention: three things named, and how easy it was", () => {
    const named = say("the lamp, a window and the door");
    expect(scoreGuided("gd_attention_check", [named], 5).score).toBe(1);
    expect(scoreGuided("gd_attention_check", [say("the lamp")], 5).score).toBeCloseTo(0.6 / 3 + 0.4);
  });
});
