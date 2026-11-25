import { describe, expect, it } from 'vitest';
import { assertLegacyDataPreserved, type SqliteMigrationDatabase } from '@/storage/sqlite-migration-integrity';

type TestRow = Record<string, unknown>;
function mockDb(
  tables: string[],
  rowCounts: Record<string, number>,
  rowOverrides: Record<string, TestRow[]> = {},
  queryLog: string[] = [],
): SqliteMigrationDatabase {
  return {
    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      queryLog.push(sql);
      if (sql.includes('sqlite_master')) return tables.map((name) => ({ name })) as T[];
      const pragmaMatch = /^PRAGMA table_info\("((?:[^"]|"")*)"\)$/.exec(sql);
      if (pragmaMatch) {
        const table = pragmaMatch[1].replace(/""/g, '"');
        const rows = rowOverrides[table] ?? Array.from({ length: rowCounts[table] ?? 0 }, (_, index) => ({ id: `${table}-${index}`, value: index }));
        const keys = Object.keys(rows[0] ?? { id: '', value: 0 });
        return keys.map((name, cid) => ({ cid, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })) as T[];
      }
      const match = /^SELECT \* FROM "((?:[^"]|"")*)" ORDER BY (.+) LIMIT \? OFFSET \?$/.exec(sql);
      if (!match) throw new Error(`Unexpected query: ${sql}`);
      const table = match[1].replace(/""/g, '"');
      const rows = [...(rowOverrides[table] ?? Array.from({ length: rowCounts[table] ?? 0 }, (_, index) => ({ id: `${table}-${index}`, value: index })))];
      const columns = match[2].split(', ').map((column) => column.slice(1, -1).replace(/""/g, '"'));
      rows.sort((left, right) => {
        for (const column of columns) {
          const a = left[column];
          const b = right[column];
          const comparison = String(a ?? '').localeCompare(String(b ?? ''));
          if (comparison !== 0) return comparison;
        }
        return 0;
      });
      const limit = Number(params[0]);
      const offset = Number(params[1]);
      return rows.slice(offset, offset + limit) as T[];
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

  it('compares large tables in bounded batches instead of loading the full table', async () => {
    const sourceQueries: string[] = [];
    const destinationQueries: string[] = [];
    const rows = Array.from({ length: 601 }, (_, index) => ({ id: `row-${String(index).padStart(4, '0')}`, value: index }));
    await expect(assertLegacyDataPreserved(
      mockDb(['large_table'], { large_table: rows.length }, { large_table: rows }, sourceQueries),
      mockDb(['large_table'], { large_table: rows.length }, { large_table: rows }, destinationQueries),
    )).resolves.toBeUndefined();
    expect(sourceQueries.filter((query) => query.includes('LIMIT ? OFFSET ?'))).toHaveLength(3);
    expect(destinationQueries.filter((query) => query.includes('LIMIT ? OFFSET ?'))).toHaveLength(3);
  });

});
