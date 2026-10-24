import type { TurnMeasurement } from "../../evaluateConversation";
import { endpointDecision, lastWordOf, silenceNeeded } from "../endpoint";
import { prepareLive, timingFor } from "../prepareLive";
import {
  BLANKS_TO_END,
  completedTurns,
  historyOf,
  initialLiveState,
  liveReducer,
  readingDelayMs,
  repliesSoFar,
  turnsLeftAfterNext,
  type LiveEvent,
  type LiveState,
  type PartnerLine,
} from "../turnMachine";

const setup = prepareLive("thread", 1, 7);
const timing = setup.timing;

function run(events: LiveEvent[], from: LiveState = initialLiveState()): LiveState {
  return events.reduce((s, e) => liveReducer(setup, s, e), from);
}

const line = (text: string, extra: Partial<PartnerLine> = {}): PartnerLine => ({ text, ended: false, safety: "ok", ...extra });

function measurement(transcript: string, at: number): TurnMeasurement {
  return { transcript, partnerEndAt: at, listenStartAt: at, volume: [], firstResultAt: transcript ? at + 1500 : null, lastResultAt: transcript ? at + 3000 : null };
}

// Opener played, mic open at t = 10 300.
function listeningAt(): LiveState {
  return run([
    { type: "START", now: 0 },
    { type: "LINE", line: line("I just got back from Portugal."), now: 1000 },
    { type: "AUDIO_START", now: 1200 },
    { type: "AUDIO_END", now: 10_000 },
    { type: "TICK", now: 10_100 },
    { type: "TICK", now: 10_300 },
  ]);
}

describe("the opening", () => {
  it("asks for the opener, plays it, waits a moment, then opens the mic", () => {
    let s = run([{ type: "START", now: 0 }]);
    expect(s.phase).toBe("opening");
    s = run([{ type: "LINE", line: line("Hi"), now: 500 }], s);
    expect(s.phase).toBe("partner");
    s = run([{ type: "AUDIO_END", now: 2000 }], s);
    expect(s.phase).toBe("gap");
    expect(run([{ type: "TICK", now: 2000 + timing.micOpenDelayMs - 1 }], s).phase).toBe("gap");
    const open = run([{ type: "TICK", now: 2000 + timing.micOpenDelayMs }], s);
    expect(open.phase).toBe("listening");
    expect(open.listen?.startedAt).toBe(2000 + timing.micOpenDelayMs);
  });

  it("never opens the mic while the partner is speaking", () => {
    const s = run([
      { type: "START", now: 0 },
      { type: "LINE", line: line("Hi"), now: 500 },
      { type: "TICK", now: 99_999 },
    ]);
    expect(s.phase).toBe("partner");
  });

  it("lets the person cut the partner short (the only barge-in)", () => {
    const s = run([
      { type: "START", now: 0 },
      { type: "LINE", line: line("A long story about Portugal and the food"), now: 500 },
      { type: "AUDIO_START", now: 600 },
      { type: "SKIP", now: 1500 },
    ]);
    expect(s.phase).toBe("gap");
    expect(s.turns[0].partnerSkipped).toBe(true);
    expect(s.turns[0].partnerEndedAt).toBe(1500);
  });
});

describe("end of a reply", () => {
  it("waits for the end-of-reply silence after words", () => {
    let s = listeningAt();
    s = run([{ type: "HEARD", transcript: "oh nice what was the best thing you ate", at: 12_000 }], s);
    expect(run([{ type: "TICK", now: 12_000 + timing.endSilenceMs - 1 }], s).phase).toBe("listening");
    const ended = run([{ type: "TICK", now: 12_000 + timing.endSilenceMs }], s);
    expect(ended.phase).toBe("capturing");
    expect(ended.turns[0].reply?.endReason).toBe("pause");
  });

  it("waits longer when the last word leads somewhere, or only a word or two is out", () => {
    expect(silenceNeeded({ words: 6, lastWord: "because" }, timing)).toBeGreaterThan(timing.endSilenceMs);
    expect(silenceNeeded({ words: 1, lastWord: "well" }, timing)).toBeGreaterThan(timing.endSilenceMs);
    expect(silenceNeeded({ words: 6, lastWord: "ate" }, timing)).toBe(timing.endSilenceMs);
    let s = listeningAt();
    s = run([{ type: "HEARD", transcript: "it was good and", at: 12_000 }], s);
    expect(run([{ type: "TICK", now: 12_000 + timing.endSilenceMs + 100 }], s).phase).toBe("listening");
  });

  it("keeps listening while there's voice, even before any words come back", () => {
    let s = listeningAt();
    s = run([{ type: "VOICE", at: 10_300 + timing.blankWaitMs - 200 }], s);
    expect(run([{ type: "TICK", now: 10_300 + timing.blankWaitMs }], s).phase).toBe("listening");
  });

  it("treats a long silence as a blank, and the conversation carries on", () => {
    let s = listeningAt();
    s = run([{ type: "TICK", now: 10_300 + timing.blankWaitMs }], s);
    expect(s.phase).toBe("capturing");
    expect(s.turns[0].reply?.endReason).toBe("blank");
    s = run([{ type: "CAPTURED", measurement: measurement("", 10_000) }], s);
    expect(s.phase).toBe("thinking");
    expect(historyOf(s)[1]).toEqual({ who: "you", text: "", blank: true });
  });

  it("ends three blanks in a row (the mic is probably not hearing them)", () => {
    let s = listeningAt();
    for (let i = 0; i < BLANKS_TO_END; i++) {
      const t = 25_000 * (i + 1);
      s = run([{ type: "TICK", now: t }, { type: "CAPTURED", measurement: measurement("", t) }], s);
      if (i < BLANKS_TO_END - 1) {
        expect(s.phase).toBe("thinking");
        s = run([{ type: "LINE", line: line("So anyway"), now: t + 100 }, { type: "AUDIO_END", now: t + 2000 }, { type: "TICK", now: t + 2400 }], s);
      }
    }
    expect(s.phase).toBe("finished");
    expect(s.endedBy).toBe("blanks");
  });

  it("caps a long reply and tells the partner it was cut off", () => {
    let s = listeningAt();
    s = run([{ type: "HEARD", transcript: "so the thing is", at: 10_300 + timing.maxReplyMs - 10 }], s);
    s = run([{ type: "TICK", now: 10_300 + timing.maxReplyMs }], s);
    expect(s.turns[0].reply?.endReason).toBe("cap");
    s = run([{ type: "CAPTURED", measurement: measurement("so the thing is", 10_000) }], s);
    expect(historyOf(s)[1]).toEqual({ who: "you", text: "so the thing is", cutOff: true });
  });

  it("ends on a tap of Done", () => {
    let s = listeningAt();
    s = run([{ type: "DONE", now: 11_000 }], s);
    expect(s.turns[0].reply?.endReason).toBe("tap");
  });
});

describe("the whole conversation", () => {
  function replyTurn(s: LiveState, t: number, words: string, partner = "Oh, the custard tarts."): LiveState {
    return run(
      [
        { type: "HEARD", transcript: words, at: t },
        { type: "TICK", now: t + 5000 },
        { type: "CAPTURED", measurement: measurement(words, t) },
        { type: "LINE", line: line(partner), now: t + 6000 },
        { type: "AUDIO_END", now: t + 8000 },
        { type: "TICK", now: t + 8400 },
      ],
      s,
    );
  }

  it("counts replies and closes after the last one with the partner's closing line", () => {
    let s = listeningAt();
    for (let i = 0; i < setup.maxReplies - 1; i++) s = replyTurn(s, 20_000 * (i + 1), "what was the best part");
    expect(repliesSoFar(s)).toBe(setup.maxReplies - 1);
    expect(turnsLeftAfterNext(s, setup, 100_000)).toBe(1);
    s = run(
      [
        { type: "HEARD", transcript: "nice", at: 200_000 },
        { type: "TICK", now: 205_000 },
        { type: "CAPTURED", measurement: measurement("nice", 200_000) },
      ],
      s,
    );
    expect(turnsLeftAfterNext(s, setup, 205_000)).toBe(0);
    s = run([{ type: "LINE", line: line("Anyway, I should get back. Good talking!", { ended: true }), now: 206_000 }, { type: "AUDIO_END", now: 209_000 }], s);
    expect(s.phase).toBe("finished");
    expect(s.endedBy).toBe("partner");
    expect(completedTurns(s)).toHaveLength(setup.maxReplies);
  });

  it("closes when time is up, whatever the count", () => {
    const s = listeningAt();
    expect(turnsLeftAfterNext(s, setup, setup.maxConversationMs + 1)).toBe(0);
  });

  it("stops at once on a crisis line, after it is said", () => {
    let s = listeningAt();
    s = run(
      [
        { type: "HEARD", transcript: "something worrying", at: 12_000 },
        { type: "TICK", now: 20_000 },
        { type: "CAPTURED", measurement: measurement("something worrying", 12_000) },
        { type: "LINE", line: line("I'm a practice partner, and you deserve real support.", { safety: "crisis", ended: true }), now: 21_000 },
        { type: "AUDIO_END", now: 25_000 },
      ],
      s,
    );
    expect(s.phase).toBe("finished");
    expect(s.endedBy).toBe("safety");
  });

  it("ends when the person taps End", () => {
    expect(run([{ type: "END", now: 12_000 }], listeningAt()).endedBy).toBe("you");
  });

  it("writes the history the server reads, oldest first", () => {
    let s = listeningAt();
    s = replyTurn(s, 20_000, "what was the best part");
    expect(historyOf(s)).toEqual([
      { who: "partner", text: "I just got back from Portugal." },
      { who: "you", text: "what was the best part" },
      { who: "partner", text: "Oh, the custard tarts." },
    ]);
  });
});

describe("failures and interruptions", () => {
  it("offers a retry when the partner's line didn't come", () => {
    let s = listeningAt();
    s = run([{ type: "HEARD", transcript: "hello", at: 12_000 }, { type: "TICK", now: 20_000 }, { type: "CAPTURED", measurement: measurement("hello", 12_000) }], s);
    s = run([{ type: "FAILED", reason: "offline", retryable: true }], s);
    expect(s.phase).toBe("failed");
    s = run([{ type: "RETRY", now: 30_000 }], s);
    expect(s.phase).toBe("thinking");
  });

  it("doesn't retry what can't be fixed by retrying (minutes used up), but can still finish", () => {
    let s = run([{ type: "START", now: 0 }, { type: "FAILED", reason: "quota", retryable: false }]);
    expect(run([{ type: "RETRY", now: 1 }], s).phase).toBe("failed");
    s = run([{ type: "END", now: 2 }], s);
    expect(s.phase).toBe("finished");
    expect(s.endedBy).toBe("failure");
  });

  it("pauses for a call and starts the reply again afterwards", () => {
    let s = listeningAt();
    s = run([{ type: "HEARD", transcript: "half a", at: 11_000 }, { type: "INTERRUPT", now: 11_500 }], s);
    expect(s.phase).toBe("paused");
    expect(run([{ type: "TICK", now: 99_999 }], s).phase).toBe("paused");
    s = run([{ type: "RESUME", now: 60_000 }], s);
    expect(s.phase).toBe("gap");
    expect(s.turns[0].reply).toBeNull();
    expect(run([{ type: "TICK", now: 60_000 + timing.micOpenDelayMs }], s).phase).toBe("listening");
  });

  it("asks again for a line that was in flight", () => {
    let s = run([{ type: "START", now: 0 }, { type: "INTERRUPT", now: 100 }]);
    s = run([{ type: "RESUME", now: 5000 }], s);
    expect(s.phase).toBe("opening");
  });

  it("ignores events that don't belong to the phase", () => {
    const s = listeningAt();
    expect(run([{ type: "LINE", line: line("x"), now: 1 }], s)).toBe(s);
    expect(run([{ type: "AUDIO_END", now: 1 }], s)).toBe(s);
    const done = run([{ type: "END", now: 1 }], s);
    expect(run([{ type: "START", now: 2 }], done)).toBe(done);
  });
});

describe("endpoint helpers", () => {
  it("reads the last word for the connector check", () => {
    expect(lastWordOf("I went there because")).toBe("because");
    expect(lastWordOf("That's what I'd do")).toBe("do");
    expect(lastWordOf("")).toBeNull();
  });

  it("is lenient by design", () => {
    const t = timingFor("reply", 1);
    expect(t.endSilenceMs).toBeGreaterThanOrEqual(1200);
    expect(t.blankWaitMs).toBe(10_000);
    expect(timingFor("reply", 10).blankWaitMs).toBe(6400);
    expect(timingFor("land", 1).endSilenceMs).toBeGreaterThan(t.endSilenceMs);
    expect(endpointDecision({ startedAt: 0, lastVoiceAt: null, words: 0, lastWord: null }, 5000, t)).toBeNull();
  });

  it("leaves silent lines on screen for about reading time", () => {
    expect(readingDelayMs("Hi")).toBe(1200);
    expect(readingDelayMs("one two three four five six seven eight nine ten")).toBe(3030);
    expect(readingDelayMs(Array(50).fill("word").join(" "))).toBe(6000);
  });
});
