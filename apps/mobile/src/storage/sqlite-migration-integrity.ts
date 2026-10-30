/** Minimal read-only SQLite surface required to verify a legacy-to-encrypted copy. */
export interface SqliteMigrationDatabase {
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { __sqliteBlob: Array.from(value) };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function rowSignature(row: Record<string, unknown>): string {
  return JSON.stringify(stableValue(row));
}

/**
 * Verify every user table from the legacy database exists in the encrypted copy
 * and has identical row contents. The row-count check is a cheap first guard;
 * canonical row comparison also catches equal-count corruption. Never delete the
 * source unless all checks pass. Extra destination tables are allowed because
 * they may belong to a newer app schema.
 */
export async function assertLegacyDataPreserved(
  legacyDb: SqliteMigrationDatabase,
  encryptedDb: SqliteMigrationDatabase,
): Promise<void> {
  const legacyTables = await legacyDb.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const encryptedTables = await encryptedDb.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const encryptedNames = new Set(encryptedTables.map((table) => table.name));
  for (const table of legacyTables) {
    if (!encryptedNames.has(table.name)) {
      throw new Error(`SQLCipher migration verification failed: missing table ${table.name}`);
    }
    // Table names originate from sqlite_master; quote identifiers defensively.
    const identifier = `"${table.name.replace(/"/g, '""')}"`;
    const [legacyCount, encryptedCount] = await Promise.all([
      legacyDb.getFirstAsync<{ count: number | string }>(`SELECT COUNT(*) AS count FROM ${identifier}`),
      encryptedDb.getFirstAsync<{ count: number | string }>(`SELECT COUNT(*) AS count FROM ${identifier}`),
    ]);
    const oldCount = Number(legacyCount?.count ?? -1);
    const newCount = Number(encryptedCount?.count ?? -2);
    if (!Number.isFinite(oldCount) || !Number.isFinite(newCount) || oldCount !== newCount) {
      throw new Error(`SQLCipher migration verification failed: row count mismatch in ${table.name}`);
    }
    const [legacyRows, encryptedRows] = await Promise.all([
      legacyDb.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${identifier}`),
      encryptedDb.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${identifier}`),
    ]);
    const oldSignatures = legacyRows.map(rowSignature).sort();
    const newSignatures = encryptedRows.map(rowSignature).sort();
    if (oldSignatures.length !== newSignatures.length
      || oldSignatures.some((signature, index) => signature !== newSignatures[index])) {
      throw new Error(`SQLCipher migration verification failed: row content mismatch in ${table.name}`);
    }
  }
}
