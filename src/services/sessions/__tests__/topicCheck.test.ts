jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const mockPhone = jest.fn();
jest.mock("../../language/meaningCheck", () => ({ checkTopic: (...args: unknown[]) => mockPhone(...args) }));

const mockServer = jest.fn();
jest.mock("../../analysis", () => ({ requestAnalysis: (...args: unknown[]) => mockServer(...args) }));

const mockArtifacts = new Map<string, unknown>();
jest.mock("../../db/artifactsRepo", () => ({
  getArtifact: async (id: string, kind: string) => mockArtifacts.get(`${id}:${kind}`) ?? null,
  putArtifact: async (id: string, kind: string, value: unknown) => void mockArtifacts.set(`${id}:${kind}`, value),
}));

const mockContext = jest.fn();
jest.mock("../sessionSubject", () => ({ gradingContextFromSession: (...args: unknown[]) => mockContext(...args) }));

import { topicVerdictFor } from "../topicCheck";
import type { Session } from "../../../domain/sessionTypes";

const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
let n = 0;
const take = (patch: Record<string, unknown> = {}): Session =>
  ({ id: `s${++n}`, sessionType: "spontaneous", transcriptVerbatim: text, subjectExtras: {}, ...patch }) as unknown as Session;

beforeEach(() => {
  mockArtifacts.clear();
  mockPhone.mockReset();
  mockServer.mockReset();
  mockContext.mockReset();
  // A library prompt: its words come from the prompt table, not the take.
  mockContext.mockResolvedValue({ kind: "prompt", promptText: "What makes a good teacher?" });
});

describe("topicVerdictFor", () => {
  it("uses this phone's check when it can tell, and never calls the server", async () => {
    mockPhone.mockResolvedValue("off_topic");
    const s = take();
    expect(await topicVerdictFor(s, false)).toBe("off_topic");
    expect(mockServer).not.toHaveBeenCalled();
    expect(mockArtifacts.get(`${s.id}:topic_check`)).toEqual({ verdict: "off_topic", by: "phone", words: 40 });
  });

  it("asks the small check when the phone can't tell, and keeps its answer", async () => {
    mockPhone.mockResolvedValue(null);
    mockServer.mockResolvedValue({ status: "done", value: { level: 0, quote: "word1", note: "Not about it." } });
    const s = take();
    expect(await topicVerdictFor(s, false)).toBe("off_topic");
    expect(mockServer).toHaveBeenCalledWith("check_on_topic", { prompt: "What makes a good teacher?", answer: text }, expect.anything());
    // The second time it reads what was kept.
    mockPhone.mockClear();
    expect(await topicVerdictFor(s, false)).toBe("off_topic");
    expect(mockServer).toHaveBeenCalledTimes(1);
    expect(mockPhone).not.toHaveBeenCalled();
  });

  it("lets a take through when nothing could check it", async () => {
    mockPhone.mockResolvedValue(null);
    mockServer.mockResolvedValue({ status: "unavailable", reason: "signed_out" });
    expect(await topicVerdictFor(take(), false)).toBeNull();
  });

  it("does not ask the server again for a take it already tried this launch", async () => {
    mockPhone.mockResolvedValue(null);
    mockServer.mockResolvedValue({ status: "unavailable", reason: "offline" });
    const s = take();
    await topicVerdictFor(s, false);
    await topicVerdictFor(s, false);
    expect(mockServer).toHaveBeenCalledTimes(1);
  });

  it("survives the server throwing", async () => {
    mockPhone.mockResolvedValue(null);
    mockServer.mockRejectedValue(new Error("boom"));
    expect(await topicVerdictFor(take(), false)).toBeNull();
  });

  it("does not check a take a judge has read, a script, a record with no prompt, or a short one", async () => {
    mockPhone.mockResolvedValue("off_topic");
    expect(await topicVerdictFor(take(), true)).toBeNull();
    expect(await topicVerdictFor(take({ sessionType: "script_practice" }), false)).toBeNull();
    expect(await topicVerdictFor(take({ sessionType: "feeling" }), false)).toBeNull();
    expect(await topicVerdictFor(take({ sessionType: "free_record" }), false)).toBeNull();
    mockContext.mockResolvedValue(null);
    expect(await topicVerdictFor(take(), false)).toBeNull();
    expect(await topicVerdictFor(take({ transcriptVerbatim: "too short to say" }), false)).toBeNull();
    expect(mockPhone).not.toHaveBeenCalled();
    expect(mockServer).not.toHaveBeenCalled();
  });
});

describe("two scorers at once, and a retried transcript", () => {
  it("shares one check between callers that ask while it runs, so a score never beats the verdict", async () => {
    mockPhone.mockResolvedValue(null);
    let release: (v: unknown) => void = () => undefined;
    mockServer.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const s = take();
    const a = topicVerdictFor(s, false);
    const b = topicVerdictFor(s, false);
    await new Promise((r) => setTimeout(r, 0));
    release({ status: "done", value: { level: 0, quote: "x", note: "" } });
    expect(await a).toBe("off_topic");
    expect(await b).toBe("off_topic");
    expect(mockServer).toHaveBeenCalledTimes(1);
  });

  it("checks again when the transcript changed since the verdict was kept", async () => {
    mockPhone.mockResolvedValueOnce("off_topic").mockResolvedValueOnce("ok");
    const s = take();
    expect(await topicVerdictFor(s, false)).toBe("off_topic");
    const retried = { ...s, transcriptVerbatim: `${text} and then some more words to say here` } as Session;
    expect(await topicVerdictFor(retried, false)).toBe("ok");
  });
});
