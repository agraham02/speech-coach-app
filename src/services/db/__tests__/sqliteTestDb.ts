// A real SQLite database for repo tests, with the slice of expo-sqlite's async
// API the repos use, on top of Node's built-in node:sqlite (Node 22.13+).
// process.getBuiltinModule is used because Jest's resolver doesn't know the
// prefix-only "node:sqlite" module.

type Params = (string | number | null)[];

interface NodeStatement {
  run(...params: Params): { changes: number | bigint };
  all(...params: Params): unknown[];
  get(...params: Params): unknown;
}
interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
}

export function sqliteAvailable(): boolean {
  try {
    return typeof (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.("node:sqlite") === "object";
  } catch {
    return false;
  }
}

export function createTestDatabase() {
  const mod = (process as unknown as { getBuiltinModule: (id: string) => { DatabaseSync: new (path: string) => NodeDatabase } }).getBuiltinModule("node:sqlite");
  const raw = new mod.DatabaseSync(":memory:");
  const clean = (params?: Params) => (params ?? []).map((p) => (p === undefined ? null : p));
  return {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params?: Params) {
      const result = raw.prepare(sql).run(...clean(params));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params?: Params): Promise<T[]> {
      return raw.prepare(sql).all(...clean(params)) as T[];
    },
    async getFirstAsync<T>(sql: string, params?: Params): Promise<T | null> {
      return (raw.prepare(sql).get(...clean(params)) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
