import { describe, expect, it } from 'vitest';
import { assertLegacyDataPreserved, type SqliteMigrationDatabase } from '@/storage/sqlite-migration-integrity';

type TestRow = Record<string, unknown>;
function mockDb(
  tables: string[],
  rowCounts: Record<string, number>,
  rowOverrides: Record<string, TestRow[]> = {},
): SqliteMigrationDatabase {
  return {
    async getAllAsync<T>(sql: string): Promise<T[]> {
      if (sql.includes('sqlite_master')) return tables.map((name) => ({ name })) as T[];
      const match = /^SELECT \* FROM "((?:[^"]|"")+)"$/.exec(sql);
      if (!match) throw new Error(`Unexpected query: ${sql}`);
      const table = match[1].replace(/""/g, '"');
      const rows = rowOverrides[table] ?? Array.from({ length: rowCounts[table] ?? 0 }, (_, index) => ({ id: `${table}-${index}`, value: index }));
      return rows as T[];
    },
    async getFirstAsync<T>(sql: string): Promise<T | null> {
      const match = /COUNT\(\*\) AS count FROM "((?:[^"]|"")+)"/.exec(sql);
      if (!match) throw new Error(`Unexpected query: ${sql}`);
      const table = match[1].replace(/""/g, '"');
      const count = rowCounts[table];
      return (count === undefined ? null : { count }) as T | null;
    },
  };
}

describe('SQLCipher migration integrity', () => {
  it('accepts a copy with matching legacy tables and exact row contents', async () => {
    await expect(assertLegacyDataPreserved(
      mockDb(['public_cache', 'mutation_outbox'], { public_cache: 12, mutation_outbox: 3 }),
      mockDb(['public_cache', 'mutation_outbox', 'new_table'], { public_cache: 12, mutation_outbox: 3, new_table: 0 }),
    )).resolves.toBeUndefined();
  });

  it('rejects a missing legacy table', async () => {
    await expect(assertLegacyDataPreserved(
      mockDb(['public_cache'], { public_cache: 1 }), mockDb([], {}),
    )).rejects.toThrow(/missing table public_cache/);
  });

  it('rejects a partial copy before the legacy database can be deleted', async () => {
    await expect(assertLegacyDataPreserved(
      mockDb(['public_cache'], { public_cache: 10 }), mockDb(['public_cache'], { public_cache: 8 }),
    )).rejects.toThrow(/row count mismatch in public_cache/);
  });

  it('rejects content corruption even when source and destination row counts match', async () => {
    await expect(assertLegacyDataPreserved(
      mockDb(['public_cache'], { public_cache: 1 }, { public_cache: [{ cache_key: 'k1', payload: 'original' }] }),
      mockDb(['public_cache'], { public_cache: 1 }, { public_cache: [{ cache_key: 'k1', payload: 'corrupted' }] }),
    )).rejects.toThrow(/row content mismatch in public_cache/);
  });

  it('compares tables independent of physical row order and object-key order', async () => {
    await expect(assertLegacyDataPreserved(
      mockDb(['queue'], { queue: 2 }, { queue: [{ id: 'b', value: 2 }, { value: 1, id: 'a' }] }),
      mockDb(['queue'], { queue: 2 }, { queue: [{ id: 'a', value: 1 }, { value: 2, id: 'b' }] }),
    )).resolves.toBeUndefined();
  });
});
