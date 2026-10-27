import { createRequire } from 'node:module';

// Lazy-load `node:sqlite` at call time so Vite doesn't try to statically
// resolve it (Vite 5 strips the `node:` prefix and looks for an npm
// package called `sqlite`, which doesn't exist).
const nodeRequire = createRequire(import.meta.url);

type DatabaseSyncInstance = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  close: () => void;
};

type MockDb = DatabaseSyncInstance;

function wrapDb(db: MockDb) {
  const adapter = {
    async execAsync(sql: string): Promise<void> { db.exec(sql); },
    async runAsync(sql: string, ...params: unknown[]) {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    },
    async getFirstAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T | null> {
      return (db.prepare(sql).get(...params) as T) ?? null;
    },
    async getAllAsync<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async withExclusiveTransactionAsync<T>(fn: (txn: typeof adapter) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try { const r = await fn(adapter); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  return adapter;
}

export function createSqliteMock() {
  const dbs = new Map<string, MockDb>();

  return {
    async openDatabaseAsync(name: string) {
      if (!dbs.has(name)) {
        // Deferred require — only happens the first time a test opens this DB.
        const { DatabaseSync } = nodeRequire('node:sqlite') as {
          DatabaseSync: new (path: string) => MockDb;
        };
        dbs.set(name, new DatabaseSync(':memory:'));
      }
      return wrapDb(dbs.get(name)!);
    },
    getRawDb(name: string): MockDb | undefined { return dbs.get(name); },
    _clearAll() {
      for (const db of dbs.values()) {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        ).all() as { name: string }[];
        for (const { name } of tables) db.exec(`DELETE FROM "${name}"`);
      }
    },
    _reset() { dbs.clear(); },
  };
}
