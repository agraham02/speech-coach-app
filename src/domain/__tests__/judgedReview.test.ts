import { acceptJudgedReview, annotationCategoryFor, JUDGED_LEAF_IDS, TAKE_REVIEW_SCHEMA_VERSION as APP_SCHEMA } from "../analysis/judgedReview";
import { JUDGED_LEAVES, TAKE_REVIEW_SCHEMA_VERSION as SERVER_SCHEMA } from "../../../supabase/functions/_shared/prompts/takeReview";
import { isAdultFromBirthDate } from "../profile";

const TRANSCRIPT = "um so my point is simple, start small and keep going";
const leaf = (level: number, quote = "start small and keep going") => ({ level, quote, notes: "Grounded note." });
const answer = (over: Record<string, unknown> = {}) => ({
  transcript_clean: "So my point is simple: start small and keep going.",
  structure_used: "what/why/how",
  scorable: true,
  not_scorable_reason: "",
  leaves: { answers_question: leaf(3), point_first: leaf(4, "my point is simple"), has_shape: leaf(2), hits_beats: leaf(2), ideas_connect: leaf(3), specifics: leaf(1) },
  annotations: [{ quote: "start small and keep going", subcategory: "has_shape", note: "The point." }],
  coaching: { summary: "s", strength: "t", focus: "f", drill: "d" },
  quick_coach: { tip: "x" },
  ...over,
});
const take = { kind: "impromptu" as const, transcript: TRANSCRIPT };

describe("acceptJudgedReview", () => {
  it("keeps a level on each leaf the judge owns", () => {
    const review = acceptJudgedReview(answer(), take)!;
    expect(review.leaves.point_first).toEqual({ level: 4, quote: "my point is simple", notes: "Grounded note." });
    expect(Object.keys(review.leaves)).toHaveLength(6);
    expect(review.notScorable).toBeNull();
    expect(review.structureUsed).toBe("what/why/how");
    expect(review.transcriptVerbatim).toBeNull();
    expect(review.annotations).toEqual([{ quote: "start small and keep going", category: "structure", note: "The point." }]);
    expect(review.quickCoach).toEqual({ tip: "x" });
  });

  it("holds levels to 0-5, and ignores what isn't the judge's", () => {
    const review = acceptJudgedReview(answer({ leaves: { ...answer().leaves, answers_question: leaf(9), specifics: leaf(-2, ""), speaking_rate: leaf(5), pace: leaf(5) } }), take)!;
    expect(review.leaves.answers_question?.level).toBe(5);
    expect(review.leaves.specifics?.level).toBe(0);
    expect(review.leaves).not.toHaveProperty("speaking_rate");
    expect(review.leaves).not.toHaveProperty("pace");
  });

  it("drops a level whose quote was never said: the judge must show it", () => {
    const review = acceptJudgedReview(answer({ leaves: { ...answer().leaves, answers_question: leaf(5, "words nobody said at all") } }), take)!;
    expect(review.leaves).not.toHaveProperty("answers_question");
    expect(Object.keys(review.leaves)).toHaveLength(5);
  });

  it("finds a quote whatever its case and punctuation", () => {
    expect(acceptJudgedReview(answer({ leaves: { ...answer().leaves, answers_question: leaf(3, "My point is simple start small") } }), take)!.leaves.answers_question?.level).toBe(3);
  });

  it("needs no quote at level 0, where there's nothing to show", () => {
    expect(acceptJudgedReview(answer({ leaves: { ...answer().leaves, specifics: leaf(0, "") } }), take)!.leaves.specifics?.level).toBe(0);
    expect(acceptJudgedReview(answer({ leaves: { ...answer().leaves, specifics: leaf(1, "") } }), take)!.leaves).not.toHaveProperty("specifics");
  });

  it("refuses a judgement when too few levels hold up", () => {
    expect(acceptJudgedReview(answer({ leaves: { answers_question: leaf(3), has_shape: leaf(3) } }), take)).toBeNull();
    expect(acceptJudgedReview(answer({ leaves: { answers_question: leaf(3, "made up"), has_shape: leaf(3, "made up"), specifics: leaf(3, "made up") } }), take)).toBeNull();
  });

  it("lets the judge say it can't be scored", () => {
    const review = acceptJudgedReview(answer({ scorable: false, not_scorable_reason: "That was a recital of a recipe.", leaves: {} }), take)!;
    expect(review.notScorable).toBe("That was a recital of a recipe.");
    expect(review.leaves).toEqual({});
    expect(acceptJudgedReview(answer({ scorable: false, not_scorable_reason: " ", leaves: {} }), take)!.notScorable).toContain("couldn't score");
  });

  it("coaches a script and scores nothing on it", () => {
    const review = acceptJudgedReview(answer({ scorable: undefined, leaves: undefined }), { kind: "script", transcript: TRANSCRIPT })!;
    expect(review.leaves).toEqual({});
    expect(review.notScorable).toBeNull();
    expect(review.coaching.summary).toBe("s");
    expect(acceptJudgedReview(answer(), { kind: "script", transcript: TRANSCRIPT })!.leaves).toEqual({});
  });

  it("drops annotations that quote words never said, and any it can't show", () => {
    const review = acceptJudgedReview(
      answer({
        annotations: [
          { quote: "START SMALL", subcategory: "ideas_connect", note: "Case doesn't matter." },
          { quote: "nobody said this", subcategory: "has_shape", note: "Made up." },
          { quote: "keep going", subcategory: "made_up", note: "Unknown." },
        ],
      }),
      take,
    )!;
    expect(review.annotations.map((a) => a.quote)).toEqual(["START SMALL"]);
  });

  it("uses the judge's transcript only when the phone had none", () => {
    const review = acceptJudgedReview(answer({ transcript_verbatim: TRANSCRIPT }), { kind: "impromptu", transcript: null })!;
    expect(review.transcriptVerbatim).toBe(TRANSCRIPT);
    expect(acceptJudgedReview(answer({ transcript_verbatim: "other words" }), take)!.transcriptVerbatim).toBeNull();
  });

  it("refuses junk and empty notes", () => {
    expect(acceptJudgedReview(null, take)).toBeNull();
    expect(acceptJudgedReview({ leaves: {} }, take)).toBeNull();
    const empty = { answers_question: { level: 3, quote: "keep going", notes: " " }, has_shape: { level: 3, quote: "keep going", notes: "" }, specifics: leaf(2) };
    expect(acceptJudgedReview(answer({ leaves: empty }), take)).toBeNull();
  });

  it("files each annotation where the transcript shows it", () => {
    expect(annotationCategoryFor("answers_question")).toBe("content");
    expect(annotationCategoryFor("has_shape")).toBe("structure");
    expect(annotationCategoryFor("restated_point")).toBe("restated_point");
    expect(annotationCategoryFor("nonsense")).toBeNull();
    expect(annotationCategoryFor("pace")).toBeNull();
  });

  it("owns the same leaves as the server", () => {
    expect([...JUDGED_LEAF_IDS].sort()).toEqual(Object.keys(JUDGED_LEAVES).sort());
    expect(APP_SCHEMA).toBe(SERVER_SCHEMA);
  });
});

describe("isAdultFromBirthDate", () => {
  it("is false under 18, true from the 18th birthday, and unknown without a birthday", () => {
    expect(isAdultFromBirthDate("2010-03-04", "2026-10-24")).toBe(false);
    expect(isAdultFromBirthDate("2000-03-04", "2026-10-24")).toBe(true);
    expect(isAdultFromBirthDate(undefined, "2026-10-24")).toBeNull();
    expect(isAdultFromBirthDate("not a date", "2026-10-24")).toBeNull();
    expect(isAdultFromBirthDate("2030-01-01", "2026-10-24")).toBeNull();
  });

  it("flips on the 18th birthday itself, so someone who turns 18 is let in without being asked again", () => {
    expect(isAdultFromBirthDate("2008-10-25", "2026-10-24")).toBe(false);
    expect(isAdultFromBirthDate("2008-10-25", "2026-10-25")).toBe(true);
    expect(isAdultFromBirthDate("2008-10-25", "2027-01-01")).toBe(true);
    expect(isAdultFromBirthDate("2008-12-31", "2026-12-31")).toBe(true);
    expect(isAdultFromBirthDate("2008-12-31", "2026-12-30")).toBe(false);
  });
});
