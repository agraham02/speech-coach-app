import { chooseLevel, floorFor, impliedLevel, mainLeafOf } from "../choose";
import { drillActivityId } from "../../../content/activities";

describe("choosing an attempt's difficulty", () => {
  it("starts where your skill is the first time", () => {
    expect(impliedLevel(60)).toBe(4);
    expect(chooseLevel({ stored: null, leafRating: 60, leafStage: null, missesInARow: 0 })).toBe(4);
    expect(chooseLevel({ stored: null, leafRating: 25, leafStage: null, missesInARow: 0 })).toBe(1);
    expect(chooseLevel({ stored: null, leafRating: null, leafStage: null, missesInARow: 0 })).toBe(1);
  });

  it("then follows the staircase, pulled back when it drifts more than 2 from your skill", () => {
    expect(chooseLevel({ stored: 5, leafRating: 60, leafStage: null, missesInARow: 0 })).toBe(5);
    expect(chooseLevel({ stored: 9, leafRating: 60, leafStage: null, missesInARow: 0 })).toBe(6);
    expect(chooseLevel({ stored: 1, leafRating: 80, leafStage: null, missesInARow: 0 })).toBe(4);
  });

  it("never drops under the floor your stage earned, unless three misses ease it", () => {
    expect(floorFor(3, 0)).toBe(2);
    expect(floorFor(4, 0)).toBe(4);
    expect(floorFor(5, 0)).toBe(5);
    expect(floorFor(2, 0)).toBe(1);
    expect(chooseLevel({ stored: 2.5, leafRating: 45, leafStage: 4, missesInARow: 0 })).toBe(4);
    expect(chooseLevel({ stored: 2.5, leafRating: 45, leafStage: 4, missesInARow: 3 })).toBe(3);
  });

  it("follows the activity's main leaf", () => {
    expect(mainLeafOf(drillActivityId("category_fluency"))).toBe("word_retrieval");
    expect(mainLeafOf("no:such")).toBeNull();
  });
});
