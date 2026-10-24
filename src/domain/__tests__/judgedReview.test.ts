import { acceptJudgedReview, annotationCategoryFor } from "../analysis/judgedReview";
import { isAdultFromAge } from "../profile";

const sub = (score: number) => ({ score, notes: "Grounded note.", evidence: "keep going" });
const TRANSCRIPT = "um so my point is simple, start small and keep going";
const answer = (over: Record<string, unknown> = {}) => ({
  transcript_clean: "So my point is simple: start small and keep going.",
  structure_used: "what/why/how",
  subscores: { pace: sub(7), pauses: sub(6), structure: sub(5), relevance: sub(6), clarity: sub(6), conviction: sub(4) },
  annotations: [{ quote: "start small and keep going", subcategory: "structure", note: "The point." }],
  coaching: { summary: "s", strength: "t", focus: "f", drill: "d" },
  quick_coach: { tip: "x" },
  ...over,
});

describe("acceptJudgedReview", () => {
  it("keeps a judgement in the taxonomy's terms", () => {
    const review = acceptJudgedReview(answer(), { kind: "impromptu", transcript: TRANSCRIPT })!;
    expect(review.subscores.structure).toEqual({ score: 5, notes: "Grounded note.", evidence: "keep going" });
    expect(review.structureUsed).toBe("what/why/how");
    expect(review.transcriptVerbatim).toBeNull();
    expect(review.annotations).toEqual([{ quote: "start small and keep going", category: "structure", note: "The point." }]);
    expect(review.quickCoach).toEqual({ tip: "x" });
  });

  it("holds scores to 1-10 and drops what isn't a judged subcategory for this take", () => {
    const review = acceptJudgedReview(answer({ subscores: { ...answer().subscores, pace: sub(14), fluency: sub(9), congruence: sub(3), tone: sub(0) } }), {
      kind: "impromptu",
      transcript: TRANSCRIPT,
    })!;
    expect(review.subscores.pace?.score).toBe(10);
    expect(review.subscores.tone?.score).toBe(1);
    expect(review.subscores).not.toHaveProperty("fluency");
    expect(review.subscores).not.toHaveProperty("congruence");
    const script = acceptJudgedReview(answer(), { kind: "script", transcript: TRANSCRIPT });
    expect(script).toBeNull(); // only pace and pauses apply to a script here: too little to count
  });

  it("drops annotations that quote words never said, and any it can't show", () => {
    const review = acceptJudgedReview(
      answer({
        annotations: [
          { quote: "START SMALL", subcategory: "clarity", note: "Case doesn't matter." },
          { quote: "nobody said this", subcategory: "structure", note: "Made up." },
          { quote: "keep going", subcategory: "made_up", note: "Unknown." },
        ],
      }),
      { kind: "impromptu", transcript: TRANSCRIPT },
    )!;
    expect(review.annotations.map((a) => a.quote)).toEqual(["START SMALL"]);
  });

  it("uses the judge's transcript only when the phone had none", () => {
    const review = acceptJudgedReview(answer({ transcript_verbatim: TRANSCRIPT }), { kind: "impromptu", transcript: null })!;
    expect(review.transcriptVerbatim).toBe(TRANSCRIPT);
    expect(acceptJudgedReview(answer({ transcript_verbatim: "other words" }), { kind: "impromptu", transcript: TRANSCRIPT })!.transcriptVerbatim).toBeNull();
  });

  it("refuses junk and empty notes", () => {
    expect(acceptJudgedReview(null, { kind: "impromptu", transcript: TRANSCRIPT })).toBeNull();
    expect(acceptJudgedReview({ subscores: {} }, { kind: "impromptu", transcript: TRANSCRIPT })).toBeNull();
    const empty = { pace: { score: 6, notes: " " }, structure: { score: 6, notes: "" }, clarity: sub(5) };
    expect(acceptJudgedReview(answer({ subscores: empty }), { kind: "impromptu", transcript: TRANSCRIPT })).toBeNull();
  });

  it("files each annotation where the transcript shows it", () => {
    expect(annotationCategoryFor("relevance")).toBe("content");
    expect(annotationCategoryFor("conviction")).toBe("content");
    expect(annotationCategoryFor("restated_point")).toBe("restated_point");
    expect(annotationCategoryFor("nonsense")).toBeNull();
  });
});

describe("isAdultFromAge", () => {
  it("is false under 18, true from 18, and unknown when not answered", () => {
    expect(isAdultFromAge("under_13")).toBe(false);
    expect(isAdultFromAge("13_17")).toBe(false);
    expect(isAdultFromAge("18_24")).toBe(true);
    expect(isAdultFromAge("50_plus")).toBe(true);
    expect(isAdultFromAge("unsaid")).toBeNull();
    expect(isAdultFromAge(undefined)).toBeNull();
  });
});
