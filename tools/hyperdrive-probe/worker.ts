import { Client } from 'pg';
import { createHyperdriveProbeWorker, type ProbeDatabaseClient, type ProbeMode } from './src/worker-core.ts';

/**
 * A fresh node-postgres Client is created per request. Hyperdrive performs the
 * reusable origin-side pooling; this Worker intentionally has no module-level
 * Client or pg.Pool that could pin sockets across requests.
 */
const worker = createHyperdriveProbeWorker((connectionString, mode: ProbeMode) => {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 8_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    application_name: mode === 'hyperdrive'
      ? 'marketplat-hyperdrive-probe'
      : 'marketplat-direct-probe',
  });

  return {
    connect: async () => {
      await client.connect();
    },
    query: async (statement: string) => {
      const result = await client.query(statement);
      return { rows: result.rows as readonly unknown[] };
    },
    end: () => client.end(),
  } satisfies ProbeDatabaseClient;
});

export default worker;
