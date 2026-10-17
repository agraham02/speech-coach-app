jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("../../services/db/database", () => ({ getDatabase: jest.fn() }));
jest.mock("../../services/prefs/prefsStore", () => ({ getGazeYFixed: jest.fn(), setGazeYFixed: jest.fn() }));
jest.mock("../../utils/logger", () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

import { flipGazeY, repairStoredGazeY } from "../../services/face/gazeYRepair";
import { getDatabase } from "../../services/db/database";
import { getGazeYFixed, setGazeYFixed } from "../../services/prefs/prefsStore";
import type { PresenceSample } from "../presenceMetrics";

const sample = (tMs: number, gazeY?: number): PresenceSample => ({ tMs, present: true, yaw: 0, pitch: 0, smile: 0, eyesOpen: 1, framed: true, gazeX: 0, gazeY });

describe("flipGazeY", () => {
  it("negates gazeY and leaves older samples without gaze alone", () => {
    const out = flipGazeY([sample(0, 0.4), sample(200, -0.3), sample(400, 0), sample(600)]);
    expect(out.map((s) => s.gazeY)).toEqual([-0.4, 0.3, 0, undefined]);
  });
});

describe("repairStoredGazeY", () => {
  function fakeDb(rows: { session_id: string; json: string }[]) {
    const runs: unknown[][] = [];
    return {
      runs,
      db: {
        getAllAsync: jest.fn().mockResolvedValue(rows),
        runAsync: jest.fn((...args: unknown[]) => { runs.push(args); return Promise.resolve(); }),
        withTransactionAsync: jest.fn((fn: () => Promise<void>) => fn()),
      },
    };
  }

  it("flips each stored timeline once and marks the repair done", async () => {
    const timeline = Array.from({ length: 6 }, (_, i) => sample(i * 200, -0.5));
    const { db, runs } = fakeDb([{ session_id: "s1", json: JSON.stringify(timeline) }]);
    (getDatabase as jest.Mock).mockResolvedValue(db);
    (getGazeYFixed as jest.Mock).mockReturnValue(false);
    await repairStoredGazeY();
    const update = runs.find((r) => String(r[0]).startsWith("UPDATE"))!;
    expect(JSON.parse((update[1] as string[])[0])[0].gazeY).toBe(0.5);
    expect(runs.some((r) => String(r[0]).includes("'presence'"))).toBe(true);
    expect(setGazeYFixed).toHaveBeenCalledWith(true);
  });

  it("does nothing once it has run", async () => {
    (getDatabase as jest.Mock).mockClear();
    (getGazeYFixed as jest.Mock).mockReturnValue(true);
    await repairStoredGazeY();
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
