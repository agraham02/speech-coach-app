import { runExclusive, runHeavy } from "../jobQueue";

describe("runExclusive", () => {
  it("returns the in-flight promise for a duplicate call", async () => {
    let calls = 0;
    const task = () =>
      new Promise<number>((resolve) => {
        calls += 1;
        setTimeout(() => resolve(calls), 10);
      });
    const [a, b] = await Promise.all([runExclusive("s1:cloud", task), runExclusive("s1:cloud", task)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    await runExclusive("s1:cloud", task);
    expect(calls).toBe(2);
  });
});

describe("runHeavy", () => {
  it("runs tasks one at a time, even after a failure", async () => {
    const order: string[] = [];
    const slow = (name: string, fail = false) => () =>
      new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          order.push(name);
          if (fail) reject(new Error(name));
          else resolve();
        }, 5),
      );
    const first = runHeavy(slow("a", true)).catch(() => undefined);
    const second = runHeavy(slow("b"));
    await Promise.all([first, second]);
    expect(order).toEqual(["a", "b"]);
  });
});
