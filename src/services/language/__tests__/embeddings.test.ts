const mockEmbed = jest.fn();
jest.mock("../../../../modules/tono-language", () => ({ embed: (...args: unknown[]) => mockEmbed(...args) }));

import { cosine, similarity } from "../embeddings";

describe("cosine", () => {
  it("is 1 for the same direction, 0 for unrelated, -1 for opposite", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("can't say for empty, mismatched or zero vectors", () => {
    expect(cosine([], [])).toBeNull();
    expect(cosine([1, 2], [1, 2, 3])).toBeNull();
    expect(cosine([0, 0], [1, 1])).toBeNull();
  });
});

describe("similarity", () => {
  beforeEach(() => mockEmbed.mockReset());

  it("compares the two vectors, ignoring case and spacing", async () => {
    mockEmbed.mockImplementation(async (_kind: string, text: string) => (text === "dog" ? [1, 0] : text === "puppy" ? [0.9, 0.1] : null));
    expect(await similarity("word", "  Dog ", "PUPPY")).toBeGreaterThan(0.9);
    expect(mockEmbed).toHaveBeenCalledWith("word", "dog");
  });

  it("is null when either side can't be embedded: not checked, never a failure", async () => {
    mockEmbed.mockImplementation(async (_kind: string, text: string) => (text === "dog" ? [1, 0] : null));
    expect(await similarity("word", "dog", "zzzxq")).toBeNull();
    expect(await similarity("sentence", "", "")).toBeNull();
  });
});
