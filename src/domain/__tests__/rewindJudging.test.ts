import { checkRewindReview, coverageSentence, contradictions } from "../rewind/reviewPrompt";
import { dayCoverage } from "../rewind/stats";
import { quoteIn, snapToSource } from "../analysis/quotes";
import cases from "../../../spikes/inference-eval/cases_synthetic.json";

// Session 10: judging a Rewind. The judge's answer is scripted here (no model
// is called), once the way a good judge answers and once the way the old
// prompt went wrong, to prove the phone keeps the first and refuses the
// second. The hosted eval (spikes/inference-eval) is what measures a model.

type Gold = { morning: string; midday: string; evening: string };
const byId = (id: string) => (cases.rewind as { id: string; transcript: string; gold: Gold }[]).find((c) => c.id === id)!;

const NAP = byId("rewind_day_with_nap").transcript;
const MORNING = byId("rewind_morning_only").transcript;
const THIN = byId("rewind_thin").transcript;
const RICH = byId("rewind_rich").transcript;

const notes = {
  specificity: "You gave a clock time and named what you cooked, but 'a few other small things' stayed vague.",
  storytelling: "The overcooked eggs were a small moment; most of the rest was a list of what you did.",
  flow: "You went in order through the day and each part followed from the one before.",
  tryTomorrow: "Pick one meeting and say what happened in it.",
};

const answer = (parts: Record<string, [string, string]>, vividDetail: string, over: Record<string, unknown> = {}) => ({
  parts: Object.fromEntries(Object.entries(parts).map(([k, [status, evidence]]) => [k, { status, evidence }])),
  ...notes,
  vividDetail,
  ...over,
});

describe("the regression: a full day told from morning to a nap at night", () => {
  const good = answer(
    {
      morning: ["covered", "I said my morning prayer, brushed my teeth"],
      midday: ["covered", "I headed to the office"],
      evening: ["covered", "got in my bed at around five"],
    },
    "scrambled eggs that I accidentally overcooked, but the breakfast was still good",
  );

  it("keeps all three parts, with quotes found in the transcript, and words the coverage itself", () => {
    const checked = checkRewindReview(good, NAP);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.review.parts.morning.status).toBe("covered");
    expect(checked.review.parts.midday.status).toBe("covered");
    expect(checked.review.parts.evening.status).toBe("covered");
    expect(checked.review.coverage).toBe("All three parts of your day came up with real detail: the morning, midday and evening.");
    for (const p of ["morning", "midday", "evening"] as const) expect(quoteIn(checked.review.parts[p].evidence, NAP)).toBe(true);
  });

  it("makes the most vivid line a real moment, word for word from the transcript", () => {
    const checked = checkRewindReview(good, NAP);
    expect(checked.ok && checked.review.vividDetail).toBe("scrambled eggs that I accidentally overcooked, but the breakfast was still good");
    expect(quoteIn((checked.ok && checked.review.vividDetail) || "", NAP)).toBe(true);
  });

  it("refuses the old failure: the evening called missing when a nap at night was told", () => {
    const old = answer(
      {
        morning: ["covered", "I said my morning prayer, brushed my teeth"],
        midday: ["brief", "I headed to the office"],
        evening: ["missing", ""],
      },
      "scrambled eggs that I accidentally overcooked, but the breakfast was still good",
    );
    const first = checkRewindReview(old, NAP);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.problems.join(" ")).toMatch(/evening as missing/);
  });

  it("refuses notes that say only the morning was covered when the statuses say otherwise", () => {
    const wrong = answer(
      { morning: ["covered", "I said my morning prayer"], midday: ["covered", "I headed to the office"], evening: ["covered", "got in my bed at around five"] },
      "scrambled eggs that I accidentally overcooked, but the breakfast was still good",
      { tryTomorrow: "You only covered the morning in detail, so tell the afternoon and evening too." },
    );
    const checked = checkRewindReview(wrong, NAP);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.problems.join(" ")).toMatch(/contradict/);
  });

  it("the phone's own keywords now see the whole day too", () => {
    expect(dayCoverage(NAP)).toEqual({ morning: true, midday: true, evening: true });
  });
});

describe("a day that really is only the morning", () => {
  const morningOnly = answer(
    { morning: ["covered", "I made a pour-over coffee"], midday: ["missing", ""], evening: ["missing", ""] },
    "The grass was wet and he kept stopping to sniff every single tree",
    { tryTomorrow: "Carry the story past the morning: what happened after you answered the emails?" },
  );

  it("is kept as it is, and says plainly what didn't come up", () => {
    const checked = checkRewindReview(morningOnly, MORNING);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.review.parts.midday.status).toBe("missing");
    expect(checked.review.coverage).toBe("You told the morning part with real detail. The midday and evening didn't come up.");
  });

  it("does not let a notes line cry 'missing' about a part that was covered", () => {
    const parts = { morning: { status: "covered" as const, evidence: "x" }, midday: { status: "missing" as const, evidence: "" }, evening: { status: "missing" as const, evidence: "" } };
    expect(contradictions(["You didn't mention the evening at all."], parts)).toEqual([]);
    expect(contradictions(["You didn't mention the morning at all."], parts)).toHaveLength(1);
  });
});

describe("a thin day and a rich one", () => {
  it("a thin day is all 'brief' and says so", () => {
    const checked = checkRewindReview(
      answer({ morning: ["brief", "I got up"], midday: ["brief", "went to class, had lunch"], evening: ["brief", "ate dinner and then I went to sleep"] }, "Nothing really happened", {
        specificity: "There were no names, times or details.",
      }),
      THIN,
    );
    // "Nothing really happened" is not a moment (4 words): refused first, then dropped on the last try.
    expect(checked.ok).toBe(false);
    const final = checkRewindReview(
      answer({ morning: ["brief", "I got up"], midday: ["brief", "went to class, had lunch"], evening: ["brief", "ate dinner and then I went to sleep"] }, "Nothing really happened", {
        specificity: "There were no names, times or details.",
      }),
      THIN,
      { final: true },
    );
    expect(final.ok).toBe(true);
    if (final.ok) {
      expect(final.review.vividDetail).toBeUndefined();
      expect(final.review.coverage).toBe("The morning, midday and evening only came up in passing.");
    }
  });

  it("a rich day is covered everywhere, with its best moment quoted", () => {
    const checked = checkRewindReview(
      answer(
        { morning: ["covered", "made oatmeal with too much cinnamon"], midday: ["covered", "the taco truck on Fifth Street with Priya"], evening: ["covered", "cooked a stir fry while my sister called me"] },
        "a guy across from me was asleep holding a full cup of coffee and I spent the whole ride waiting for it to spill",
      ),
      RICH,
    );
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.review.coverage).toMatch(/^All three parts/);
  });
});

describe("what the phone will not show", () => {
  const parts = { morning: ["covered", "I made a pour-over coffee"], midday: ["missing", ""], evening: ["missing", ""] } as Record<string, [string, string]>;

  it("an evidence quote that isn't in the transcript", () => {
    const bad = answer({ ...parts, morning: ["covered", "I ran five miles before sunrise"] }, "The grass was wet and he kept stopping to sniff every single tree");
    expect(checkRewindReview(bad, MORNING).ok).toBe(false);
    expect(checkRewindReview(bad, MORNING, { final: true }).ok).toBe(false);
  });

  it("a near-miss quote is snapped to the words that were really said", () => {
    const near = answer(parts, "The grass was wet and he kept stopping to sniff every tree");
    const checked = checkRewindReview(near, MORNING);
    expect(checked.ok && checked.review.vividDetail).toBe("The grass was wet and he kept stopping to sniff every single tree");
  });

  it("a made-up 'most vivid' line: asked again, then left out", () => {
    const made = answer(parts, "The sunrise over the harbour turned the whole sky orange");
    expect(checkRewindReview(made, MORNING).ok).toBe(false);
    const final = checkRewindReview(made, MORNING, { final: true });
    expect(final.ok && final.review.vividDetail).toBeUndefined();
  });

  it("a score, however it is phrased", () => {
    for (const text of ["Solid, around 7/10 for detail.", "You scored well on order.", "About 80% of the day."]) {
      expect(checkRewindReview(answer(parts, "The grass was wet and he kept stopping to sniff every single tree", { flow: text }), MORNING).ok).toBe(false);
    }
  });

  it("an empty note, or the wrong shape", () => {
    expect(checkRewindReview(answer(parts, "The grass was wet and he kept stopping to sniff every single tree", { storytelling: "  " }), MORNING).ok).toBe(false);
    expect(checkRewindReview({ coverage: "All three." }, MORNING).ok).toBe(false);
  });

  it("a 'missing' that the phone's keywords plainly contradict: asked again, then the judge is trusted", () => {
    const text = "I had breakfast with my sister. She told me about dinner last night, which sounded fun. Then I walked to the park and watched the ducks for a while.";
    const claim = answer({ morning: ["covered", "I had breakfast with my sister"], midday: ["missing", ""], evening: ["missing", ""] }, "Then I walked to the park and watched the ducks for a while");
    expect(checkRewindReview(claim, text).ok).toBe(false);
    expect(checkRewindReview(claim, text, { final: true }).ok).toBe(true);
  });
});

describe("coverage in words", () => {
  const p = (a: string, b: string, c: string) => ({ morning: { status: a, evidence: "" }, midday: { status: b, evidence: "" }, evening: { status: c, evidence: "" } }) as never;
  it("names what was covered, what was in passing and what didn't come up", () => {
    expect(coverageSentence(p("covered", "brief", "missing"))).toBe("You told the morning part with real detail. The midday only came up in passing. The evening didn't come up.");
    expect(coverageSentence(p("covered", "covered", "brief"))).toBe("You told the morning and midday parts with real detail. The evening only came up in passing.");
  });
});

describe("quotes", () => {
  it("compares words, not punctuation or case", () => {
    expect(quoteIn("today i woke up", "Today, I woke up at seven.")).toBe(true);
    expect(quoteIn("I woke at seven", "Today, I woke up at seven.")).toBe(false);
    expect(quoteIn("", "anything")).toBe(false);
  });

  it("snaps a close paraphrase to the source, and refuses a distant one", () => {
    const src = "We walked down to the river and the water was freezing cold, so we ran back.";
    expect(snapToSource("walked down to the river and the water was really freezing cold", src)).toBe("walked down to the river and the water was freezing cold");
    expect(snapToSource("a completely different sentence about trains", src)).toBeNull();
  });
});

// Ahmad's real transcript lives in the session 10 prompt file, never in this
// public repo. Point TONO_REAL_REWIND_PROMPT at that file to run the same
// regression on it:
//   TONO_REAL_REWIND_PROMPT=C:/Users/<you>/.claude/plans/tono-session-prompts/10-exercise-judging.md npx jest rewindJudging
const realFile = process.env.TONO_REAL_REWIND_PROMPT;
(realFile ? describe : describe.skip)("the real transcript (read from your own file)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const text: string = realFile ? require("fs").readFileSync(realFile, "utf8") : "";
  const real = text.match(/this was the transcript it heard:\s*\n\s*\n> "(.+?)"\s*\n/s)?.[1] ?? "";
  // Picks a short run of the transcript's own words around a keyword.
  const around = (needle: string) => {
    const words = real.split(/\s+/);
    const i = words.findIndex((w) => w.toLowerCase().includes(needle));
    return words.slice(Math.max(0, i - 1), i + 5).join(" ");
  };

  it("finds the whole day in the phone's own keywords", () => {
    expect(real.length).toBeGreaterThan(200);
    expect(dayCoverage(real)).toEqual({ morning: true, midday: true, evening: true });
  });

  it("refuses 'only the morning' and keeps a grounded three-part answer", () => {
    const parts = (evening: [string, string]) => ({ morning: ["covered", around("woke")], midday: ["covered", around("office")], evening }) as Record<string, [string, string]>;
    const vivid = real.split(/(?<=[.])\s+/).find((s) => s.length > 40) ?? "";
    expect(checkRewindReview(answer(parts(["missing", ""]), vivid), real).ok).toBe(false);
    const ok = checkRewindReview(answer(parts(["covered", around("nap")]), vivid), real);
    expect(ok.ok && ok.review.coverage).toMatch(/^All three parts/);
    expect(ok.ok && quoteIn(ok.review.vividDetail ?? "", real)).toBe(true);
  });
});
