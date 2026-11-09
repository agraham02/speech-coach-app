jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const mockToast = jest.fn();
jest.mock("../../../components/common/ToastProvider", () => ({ showGlobalToast: (...args: unknown[]) => mockToast(...args) }));

let mockStored: Record<string, unknown> = {};
jest.mock("../../prefs/prefsStore", () => ({
  getCheckpointRecords: () => mockStored,
  setCheckpointRecords: (records: Record<string, unknown>) => {
    mockStored = records;
  },
}));

// Starting a checkpoint opens screens; these tests are about settling it.
jest.mock("../../practice/launchStep", () => ({ launchStep: jest.fn() }));
jest.mock("../../db/promptsRepo", () => ({ getAllPrompts: jest.fn() }));
jest.mock("../../db/sessionsRepo", () => ({ getRecentlyUsedPromptIds: jest.fn() }));

import { settleCheckpoint, skipCheckpoint } from "../checkpointService";

beforeEach(() => {
  mockStored = {};
  mockToast.mockReset();
});

describe("settleCheckpoint", () => {
  it("records a pass, keeps it, and says so", () => {
    expect(settleCheckpoint("art_sounds", 82)).toEqual({ passed: true });
    expect(mockStored.art_sounds).toMatchObject({ status: "passed", best: 82, attempts: 1 });
    expect(mockToast.mock.calls[0][0]).toContain("Checkpoint passed");
    expect(mockToast.mock.calls[0][1]).toBe("success");
  });

  it("says how far off a miss was, and that it can be tried again", () => {
    expect(settleCheckpoint("art_sounds", 58)).toEqual({ passed: false });
    expect(mockStored.art_sounds).toMatchObject({ status: "tried", best: 58, attempts: 1 });
    expect(mockToast.mock.calls[0][0]).toContain("58 of 70");
    expect(mockToast.mock.calls[0][0]).toContain("Try again");
  });

  it("does not count a rep that could not be scored", () => {
    expect(settleCheckpoint("art_sounds", null)).toEqual({ passed: null });
    expect(mockStored).toEqual({});
    expect(mockToast.mock.calls[0][0]).toContain("couldn't be scored");
  });

  it("a later bad try cannot undo a pass", () => {
    settleCheckpoint("art_sounds", 90);
    settleCheckpoint("art_sounds", 20);
    expect(mockStored.art_sounds).toMatchObject({ status: "passed" });
  });
});

describe("skipCheckpoint", () => {
  it("marks it skipped for now and keeps what was tried", () => {
    settleCheckpoint("art_sounds", 40);
    expect(skipCheckpoint("art_sounds")).toMatchObject({ art_sounds: { status: "skipped", best: 40, attempts: 1 } });
  });
});

describe("a quick check", () => {
  it("cannot pass a checkpoint, and says why", () => {
    expect(settleCheckpoint("art_sounds", null, { quick: true })).toEqual({ passed: null });
    expect(mockStored).toEqual({});
    expect(mockToast.mock.calls[0][0]).toContain("quick check");
  });
});
