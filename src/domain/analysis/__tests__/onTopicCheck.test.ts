import { acceptOnTopic, topicFromLevel } from "../onTopicCheck";

const answer = "A good teacher is patient and explains the same idea in more than one way. They notice when a student is lost.";

describe("acceptOnTopic", () => {
  it("keeps a level with a quote that is really in the answer", () => {
    const r = acceptOnTopic({ level: 5, quote: "explains the same idea in more than one way", note: "Direct answer." }, answer);
    expect(r).toEqual({ ok: true, value: { level: 5, quote: "explains the same idea in more than one way", note: "Direct answer." } });
  });

  it("ignores case and punctuation in the quote", () => {
    expect(acceptOnTopic({ level: 4, quote: "A GOOD teacher is patient", note: "" }, answer).ok).toBe(true);
  });

  it("asks again when the quote is not in the answer", () => {
    const r = acceptOnTopic({ level: 5, quote: "teachers should assign more homework", note: "" }, answer);
    expect(r.ok).toBe(false);
  });

  it("asks again for a level that is not a whole number from 0 to 5", () => {
    for (const level of [-1, 6, 2.5, "3", null, undefined]) {
      expect(acceptOnTopic({ level, quote: "A good teacher", note: "" }, answer).ok).toBe(false);
    }
    expect(acceptOnTopic(null, answer).ok).toBe(false);
  });

  it("on the last try accepts a low level without evidence, and caps a high one", () => {
    expect(acceptOnTopic({ level: 0, quote: "", note: "Off subject." }, answer, { final: true })).toEqual({ ok: true, value: { level: 0, quote: "", note: "Off subject." } });
    expect(acceptOnTopic({ level: 5, quote: "made up", note: "" }, answer, { final: true })).toMatchObject({ ok: true, value: { level: 3, quote: "" } });
  });

  it("cuts what it keeps to a sensible size", () => {
    const r = acceptOnTopic({ level: 3, quote: "A good teacher", note: "x".repeat(500) }, answer);
    expect(r.ok && r.value.note.length).toBe(120);
  });
});

describe("topicFromLevel", () => {
  it("only a 0 or a 1 is off topic: the check is a net for nonsense, not a score", () => {
    expect([0, 1].map(topicFromLevel)).toEqual(["off_topic", "off_topic"]);
    expect([2, 3, 4, 5].map(topicFromLevel)).toEqual(["ok", "ok", "ok", "ok"]);
  });
});
