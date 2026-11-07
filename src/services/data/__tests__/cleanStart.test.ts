// The 2.0.0 clean start: files and settings go only when opening the database
// just wiped a pre-2.0 one. The database and file edges are mocked.

const mockTake = jest.fn();
const mockClear = jest.fn();

jest.mock("../../db/database", () => ({ takeOldDataWipe: () => mockTake() }));
jest.mock("../resetApp", () => ({ clearLocalData: () => mockClear() }));
jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));

import { runCleanStart } from "../cleanStart";

beforeEach(() => {
  mockTake.mockReset();
  mockClear.mockReset();
  mockClear.mockResolvedValue(3);
});

describe("runCleanStart", () => {
  it("does nothing on a fresh install or a database already at 2.0", async () => {
    mockTake.mockResolvedValue(false);
    expect(await runCleanStart()).toBe(false);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("clears the files and settings after a wipe", async () => {
    mockTake.mockResolvedValue(true);
    expect(await runCleanStart()).toBe(true);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("never keeps the app from opening if the database or the cleanup fails", async () => {
    mockTake.mockRejectedValueOnce(new Error("open failed"));
    await expect(runCleanStart()).resolves.toBe(false);
    mockTake.mockResolvedValue(true);
    mockClear.mockRejectedValueOnce(new Error("file busy"));
    await expect(runCleanStart()).resolves.toBe(false);
  });
});
