import { LOOK_CEILING, LOOK_DOWN, LOOK_SIDE, animatedFace, lookingAtLens, stillFace, timeline, withFaceEvents, withGlances, withLookAway, type Lift } from "../../__tests__/faceTimeline";
import type { PresenceSample } from "../../presenceMetrics";
import { PRESENCE_TESTS } from "../presenceTests";
import type { LabTestEntry, StepMeasure, StepMeasures } from "../types";

const entry = (id: string): LabTestEntry => {
  const e = PRESENCE_TESTS.find((t) => t.def.id === id);
  if (!e) throw new Error(`no test ${id}`);
  return e;
};

const measure = (stepId: string, face: PresenceSample[], extra: Partial<StepMeasure> = {}): StepMeasure => ({
  stepId,
  durationMs: face.length ? face[face.length - 1].tMs : 0,
  face,
  ...extra,
});

const measures = (...list: StepMeasure[]): StepMeasures => Object.fromEntries(list.map((m) => [m.stepId, m]));

const staring = (over: Partial<PresenceSample>) => timeline([{ sec: 20, over }]);
const GLANCE_CUES = [4000, 8000, 12000, 16000];

describe("the presence test definitions", () => {
  it("lists the five tests, each with face steps, bars and a fallback", () => {
    expect(PRESENCE_TESTS.map((t) => t.def.id)).toEqual(["presence.looking", "presence.glances", "presence.preview", "presence.expression", "presence.face_events"]);
    for (const { def } of PRESENCE_TESTS) {
      expect(def.group).toBe("presence");
      expect(def.steps.length).toBeGreaterThan(0);
      expect(def.steps.every((s) => s.capture === "face" && s.seconds > 0 && s.instruction.length > 0)).toBe(true);
      expect(def.bars.length).toBeGreaterThan(0);
      expect(def.onFail.length).toBeGreaterThan(0);
    }
  });

  it("gives the looking test four 20 second steps and the face events test fifteen cues", () => {
    expect(entry("presence.looking").def.steps.map((s) => [s.id, s.seconds])).toEqual([
      ["lens", 20],
      ["notes", 20],
      ["ceiling", 20],
      ["side", 20],
    ]);
    const cues = entry("presence.face_events").def.steps[0].cues!;
    expect(cues).toHaveLength(15);
    expect(cues.filter((c) => /smile/i.test(c.label))).toHaveLength(5);
    expect(cues.filter((c) => /eyebrows/i.test(c.label))).toHaveLength(10);
    expect(entry("presence.face_events").def.steps[0].instruction).toContain("4s");
  });
});

describe("presence.looking", () => {
  const { evaluate } = entry("presence.looking");
  const good = measures(
    measure("lens", lookingAtLens(20)),
    measure("notes", staring(LOOK_DOWN)),
    measure("ceiling", staring(LOOK_CEILING)),
    measure("side", staring(LOOK_SIDE)),
  );

  it("passes when every look is classified right", () => {
    const out = evaluate(good);
    expect(out.pass).toBe(true);
    expect(out.checks).toHaveLength(4);
    expect(out.checks.every((c) => c.pass === true && c.bar)).toBe(true);
    expect(out.numbers).toMatchObject({ lensRightPercent: 100, notesRightPercent: 100, ceilingRightPercent: 100, sideRightPercent: 100 });
  });

  it("skips the first 1.2 s of a step while the eyes settle", () => {
    // 1 s of looking at the lens, then the real thing: notes.
    const notes = timeline([{ sec: 1, over: {} }, { sec: 19, over: LOOK_DOWN }]);
    expect(evaluate({ ...good, notes: measure("notes", notes) }).pass).toBe(true);
  });

  it("fails and names the look that was misread", () => {
    const out = evaluate({ ...good, notes: measure("notes", lookingAtLens(20)) });
    expect(out.pass).toBe(false);
    expect(out.checks.find((c) => c.label.includes("notes"))?.pass).toBe(false);
    expect(out.summary).toContain("notes");
    expect(out.numbers.notesRightPercent).toBe(0);
  });

  it("fails when the lens itself reads as looking away", () => {
    expect(evaluate({ ...good, lens: measure("lens", staring(LOOK_SIDE)) }).pass).toBe(false);
  });

  it("can't say anything with no data, or with a step too thin to use", () => {
    expect(evaluate({}).pass).toBeNull();
    expect(evaluate({ ...good, side: measure("side", staring(LOOK_SIDE).slice(0, 30)) }).pass).toBeNull();
    expect(evaluate({ ...good, ceiling: undefined }).checks.find((c) => c.label.includes("ceiling"))?.pass).toBeNull();
  });

  it("still fails when a step is missing but another already failed", () => {
    expect(evaluate({ lens: measure("lens", staring(LOOK_SIDE)) }).pass).toBe(false);
  });
});

describe("presence.glances", () => {
  const { evaluate } = entry("presence.glances");
  const good = measures(
    measure("short", withGlances(20, GLANCE_CUES), { cues: GLANCE_CUES.map((tMs) => ({ tMs, label: "Glance" })) }),
    measure("long", withLookAway(20, 8000, 5000)),
  );

  it("passes when the short glances are forgiven and the long look-away is counted", () => {
    const out = evaluate(good);
    expect(out.pass).toBe(true);
    expect(out.numbers).toMatchObject({ shortOnLensPercent: 100, shortGlancesForgiven: 4, shortCues: 4, longLongLookAwayEvents: 1 });
  });

  it("reports the plain per-sample figure next to it", () => {
    const out = evaluate(good);
    expect(out.numbers.shortPlainOnLensPercent).toBeLessThan(100);
    expect(out.checks.find((c) => c.label.includes("plain"))).toMatchObject({ pass: null });
    expect(out.numbers.longPlainOnLensPercent).toBeLessThan(100);
  });

  it("counts one long look-away even when the eyes went down", () => {
    expect(evaluate({ ...good, long: measure("long", withLookAway(20, 8000, 5000, LOOK_DOWN)) }).pass).toBe(true);
  });

  it("fails when the glances are long enough to count against you", () => {
    const slow = withGlances(20, GLANCE_CUES, 2000);
    const out = evaluate({ ...good, short: measure("short", slow) });
    expect(out.pass).toBe(false);
    expect(out.checks.find((c) => c.label.startsWith("Short glances: on the lens"))?.pass).toBe(false);
  });

  it("fails when the long look-away isn't counted, or is counted twice", () => {
    expect(evaluate({ ...good, long: measure("long", withLookAway(20, 8000, 2000)) }).pass).toBe(false);
    const twice = timeline([{ sec: 4 }, { sec: 4, over: LOOK_SIDE }, { sec: 4 }, { sec: 4, over: LOOK_SIDE }, { sec: 4 }]);
    expect(evaluate({ ...good, long: measure("long", twice) }).pass).toBe(false);
  });

  it("can't say anything with no data", () => {
    expect(evaluate({}).pass).toBeNull();
    expect(evaluate({ short: good.short }).pass).toBeNull();
    expect(evaluate({ long: good.long }).pass).toBeNull();
  });
});

describe("presence.preview", () => {
  const { evaluate } = entry("presence.preview");

  it("passes on the lens step and says the cut-offs count the preview the same", () => {
    const out = evaluate(measures(measure("lens", lookingAtLens(20)), measure("preview", lookingAtLens(20))));
    expect(out.pass).toBe(true);
    expect(out.numbers).toMatchObject({ lensLookingPercent: 100, previewLookingPercent: 100, differencePoints: 0, decision: "counts them the same, keep the generous cut-off" });
    const info = out.checks.find((c) => c.label.includes("difference"));
    expect(info?.pass).toBeNull();
    expect(info?.value).toContain("counts them the same, keep the generous cut-off");
  });

  it("says the cut-offs tell them apart when the preview reads as looking away", () => {
    const out = evaluate(measures(measure("lens", lookingAtLens(20)), measure("preview", staring(LOOK_DOWN))));
    expect(out.pass).toBe(true);
    expect(out.numbers).toMatchObject({ differencePoints: 100, decision: "tells them apart" });
    expect(out.summary).toContain("tells them apart");
  });

  it("fails when the lens step doesn't read as looking", () => {
    const out = evaluate(measures(measure("lens", staring(LOOK_SIDE)), measure("preview", lookingAtLens(20))));
    expect(out.pass).toBe(false);
  });

  it("can't say anything with no data or only the lens step", () => {
    expect(evaluate({}).pass).toBeNull();
    const lensOnly = evaluate(measures(measure("lens", lookingAtLens(20))));
    expect(lensOnly.pass).toBeNull();
    expect(lensOnly.numbers.decision).toBeNull();
    expect(evaluate(measures(measure("preview", lookingAtLens(20)))).pass).toBeNull();
  });
});

describe("presence.expression", () => {
  const { evaluate } = entry("presence.expression");

  it("passes when the animated face is at least double a near-zero still face", () => {
    const out = evaluate(measures(measure("still", stillFace(20)), measure("animated", animatedFace(20))));
    expect(out.pass).toBe(true);
    expect(out.numbers.stillExpressiveness).toBeLessThanOrEqual(8);
    expect(out.numbers.animatedExpressiveness as number).toBeGreaterThanOrEqual(2 * (out.numbers.stillExpressiveness as number));
  });

  it("reports the motion index for both", () => {
    const out = evaluate(measures(measure("still", stillFace(20)), measure("animated", animatedFace(20))));
    expect(out.numbers.stillMotionIndex).toBe(0);
    expect(out.numbers.animatedMotionIndex as number).toBeGreaterThan(40);
    expect(out.checks.some((c) => c.label.includes("Motion index") && c.pass === null)).toBe(true);
  });

  it("fails when the animated face reads no livelier than the still one", () => {
    const out = evaluate(measures(measure("still", stillFace(20)), measure("animated", stillFace(20))));
    expect(out.pass).toBe(false);
  });

  it("fails when the still face isn't near zero", () => {
    const out = evaluate(measures(measure("still", animatedFace(20)), measure("animated", animatedFace(20))));
    expect(out.pass).toBe(false);
    expect(out.checks[0].pass).toBe(false);
  });

  it("can't say anything with no data or one step", () => {
    expect(evaluate({}).pass).toBeNull();
    expect(evaluate(measures(measure("still", stillFace(20)))).pass).toBeNull();
    expect(evaluate(measures(measure("animated", animatedFace(20)))).pass).toBeNull();
    expect(evaluate(measures(measure("still", stillFace(1)), measure("animated", animatedFace(1)))).pass).toBeNull();
  });
});

describe("presence.face_events", () => {
  const { evaluate, def } = entry("presence.face_events");
  const cues = def.steps[0].cues!;
  const cueMeasure = (face: PresenceSample[]) => measure("events", face, { cues: cues.map((c) => ({ tMs: c.atMs, label: c.label })) });
  const lifts = (every: (i: number) => boolean, lagMs = 300): Lift[] =>
    cues.flatMap((c, i) => (every(i) ? [{ kind: /smile/i.test(c.label) ? ("smile" as const) : ("brow" as const), atMs: c.atMs + lagMs, durMs: 800 }] : []));

  it("passes when nearly every cue is answered with the right kind of event", () => {
    const out = evaluate(measures(cueMeasure(withFaceEvents(60, lifts(() => true)))));
    expect(out.pass).toBe(true);
    expect(out.numbers).toMatchObject({ cues: 15, counted: 15, browCues: 10, browCounted: 10, smileCues: 5, smileCounted: 5, extraEvents: 0 });
  });

  it("still passes at 12 of 15 (80%) and fails at 11", () => {
    expect(evaluate(measures(cueMeasure(withFaceEvents(60, lifts((i) => i >= 3))))).pass).toBe(true);
    const eleven = evaluate(measures(cueMeasure(withFaceEvents(60, lifts((i) => i >= 4)))));
    expect(eleven.pass).toBe(false);
    expect(eleven.numbers.counted).toBe(11);
  });

  it("doesn't count an event of the wrong kind, or one more than a second from its cue", () => {
    const swapped = lifts(() => true).map((l) => ({ ...l, kind: l.kind === "brow" ? ("smile" as const) : ("brow" as const) }));
    const wrongKind = evaluate(measures(cueMeasure(withFaceEvents(60, swapped))));
    expect(wrongKind.pass).toBe(false);
    expect(wrongKind.numbers.counted).toBe(0);
    const late = evaluate(measures(cueMeasure(withFaceEvents(60, lifts(() => true, 1500)))));
    expect(late.pass).toBe(false);
    expect(late.numbers.counted).toBe(0);
  });

  it("fails when only the brows were lifted", () => {
    const out = evaluate(measures(cueMeasure(withFaceEvents(60, lifts((i) => i % 3 !== 2)))));
    expect(out.pass).toBe(false);
    expect(out.numbers).toMatchObject({ browCounted: 10, smileCounted: 0 });
  });

  it("reports events that matched no cue", () => {
    const extra = evaluate(measures(cueMeasure(withFaceEvents(60, [...lifts(() => true), { kind: "brow", atMs: 2500, durMs: 800 }]))));
    expect(extra.pass).toBe(true);
    expect(extra.numbers.extraEvents).toBe(1);
  });

  it("uses the definition's cue times when the measure doesn't carry them", () => {
    const out = evaluate(measures(measure("events", withFaceEvents(60, lifts(() => true)))));
    expect(out.pass).toBe(true);
  });

  it("can't say anything with no data or a take too thin to use", () => {
    expect(evaluate({}).pass).toBeNull();
    expect(evaluate(measures(cueMeasure(lookingAtLens(1)))).pass).toBeNull();
    // No face in the frame: nothing to count. A visible face that did nothing is a fail.
    expect(evaluate(measures(cueMeasure(timeline([{ sec: 60, over: { present: false } }])))).pass).toBeNull();
    expect(evaluate(measures(cueMeasure(withFaceEvents(60, [])))).pass).toBe(false);
  });
});
