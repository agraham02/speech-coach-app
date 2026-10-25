jest.mock("expo-sqlite", () => ({}));
jest.mock("../migrations", () => ({ runMigrations: async () => undefined }));

import { inTransaction } from "../database";

// expo-sqlite's withTransactionAsync sends BEGIN on the one connection, so two
// at once fail with "cannot start a transaction within a transaction". This
// fake behaves the same way: BEGIN while another is open throws.
function fakeDb() {
  let open = false;
  const log: string[] = [];
  return {
    log,
    async withTransactionAsync(task: () => Promise<void>) {
      if (open) throw new Error("cannot start a transaction within a transaction");
      open = true;
      log.push("begin");
      try {
        await task();
        log.push("commit");
      } finally {
        open = false;
      }
    },
  };
}

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("inTransaction", () => {
  it("runs overlapping transactions one after another", async () => {
    const db = fakeDb();
    const order: string[] = [];
    await Promise.all([
      inTransaction(db, async () => {
        order.push("a start");
        await later(20);
        order.push("a end");
      }),
      inTransaction(db, async () => {
        order.push("b start");
        await later(1);
        order.push("b end");
      }),
    ]);
    expect(order).toEqual(["a start", "a end", "b start", "b end"]);
    expect(db.log).toEqual(["begin", "commit", "begin", "commit"]);
  });

  it("lets the next one run after one fails, and still reports the failure to its own caller", async () => {
    const db = fakeDb();
    const failing = inTransaction(db, async () => {
      throw new Error("boom");
    });
    const next = inTransaction(db, async () => undefined);
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBeUndefined();
  });
});
