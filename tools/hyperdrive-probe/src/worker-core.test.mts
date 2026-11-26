import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHyperdriveProbeWorker,
  type ProbeDatabaseClient,
} from './worker-core.ts';

const token = 'marketplat-hyperdrive-probe-token-0123456789abcdef';
const env = {
  HYPERDRIVE: { connectionString: 'postgres://redacted.invalid/db' },
  HYPERDRIVE_PROBE_TOKEN: token,
};

function authorizedRequest(path = '/__internal/db-probe'): Request {
  return new Request(`https://probe.example${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

function fakeClient(overrides: Partial<ProbeDatabaseClient> = {}) {
  const calls: string[] = [];
  const client: ProbeDatabaseClient = {
    connect: async () => { calls.push('connect'); },
    query: async (statement) => {
      calls.push(statement);
      return { rows: [{ ok: 1 }] };
    },
    end: async () => { calls.push('end'); },
    ...overrides,
  };
  return { client, calls };
}

test('health endpoint is independent of the database binding', async () => {
  let factoryCalls = 0;
  const worker = createHyperdriveProbeWorker(() => {
    factoryCalls += 1;
    throw new Error('must not be called');
  });
  const response = await worker.fetch(new Request('https://probe.example/health'), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { ok: boolean }).ok, true);
  assert.equal(factoryCalls, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});

test('database probe rejects unauthenticated requests before opening a client', async () => {
  let factoryCalls = 0;
  const worker = createHyperdriveProbeWorker(() => {
    factoryCalls += 1;
    throw new Error('must not be called');
  });
  const response = await worker.fetch(new Request('https://probe.example/__internal/db-probe', { method: 'POST' }), env);
  assert.equal(response.status, 401);
  assert.equal(factoryCalls, 0);
});

test('database probe requires a configured Hyperdrive binding', async () => {
  let factoryCalls = 0;
  const worker = createHyperdriveProbeWorker(() => {
    factoryCalls += 1;
    throw new Error('must not be called');
  });
  const response = await worker.fetch(authorizedRequest(), { HYPERDRIVE_PROBE_TOKEN: token });
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, 'HYPERDRIVE_NOT_CONFIGURED');
  assert.equal(factoryCalls, 0);
});

test('database probe executes only SELECT 1 and closes the request client', async () => {
  const { client, calls } = fakeClient();
  let receivedConnectionString = '';
  const worker = createHyperdriveProbeWorker((connectionString) => {
    receivedConnectionString = connectionString;
    return client;
  });
  const response = await worker.fetch(authorizedRequest(), env);
  const payload = await response.json() as {
    ok: boolean;
    database: string;
    probe: string;
    connectDurationMs: number;
    queryDurationMs: number;
    totalDurationMs: number;
  };
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.database, 'reachable');
  assert.equal(payload.probe, 'read-only');
  assert.equal(typeof payload.connectDurationMs, 'number');
  assert.equal(typeof payload.queryDurationMs, 'number');
  assert.equal(typeof payload.totalDurationMs, 'number');
  assert.equal(receivedConnectionString, env.HYPERDRIVE.connectionString);
  assert.deepEqual(calls, ['connect', 'SELECT 1::int AS ok', 'end']);
});

test('database probe returns a sanitized failure and still closes the client', async () => {
  const { client, calls } = fakeClient({
    query: async () => {
      calls.push('query-failed');
      throw Object.assign(new Error('do not return this message'), { code: '08006' });
    },
  });
  const worker = createHyperdriveProbeWorker(() => client);
  const response = await worker.fetch(authorizedRequest(), env);
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.equal(body.includes('do not return this message'), false);
  assert.equal(body.includes('08006'), false);
  assert.deepEqual(calls, ['connect', 'query-failed', 'end']);
});


test('database probe attempts cleanup when the connection handshake fails', async () => {
  const calls: string[] = [];
  const worker = createHyperdriveProbeWorker(() => ({
    connect: async () => { calls.push('connect'); throw Object.assign(new Error('private connection details'), { code: 'ECONNREFUSED' }); },
    query: async () => { calls.push('query'); return { rows: [{ ok: 1 }] }; },
    end: async () => { calls.push('end'); },
  }));
  const response = await worker.fetch(authorizedRequest(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(calls, ['connect', 'end']);
  assert.equal((await response.text()).includes('private connection details'), false);
});

test('database probe hides unknown paths and rejects methods other than POST', async () => {
  const worker = createHyperdriveProbeWorker(() => {
    throw new Error('must not be called');
  });
  const missing = await worker.fetch(new Request('https://probe.example/private'), env);
  const wrongMethod = await worker.fetch(new Request('https://probe.example/__internal/db-probe'), env);
  assert.equal(missing.status, 404);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
});
