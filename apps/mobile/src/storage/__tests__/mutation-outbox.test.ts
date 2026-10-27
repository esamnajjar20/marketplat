import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = vi.hoisted(async () => {
  const { createSqliteMock } = await import('./helpers/sqlite-mock');
  return createSqliteMock();
});

vi.mock('expo-sqlite', async () => await mock);

import {
  enqueueMutation,
  listAllOutboxMutations,
  countUnownedOutboxMutations,
  discardOutboxMutation,
  listPendingMutations,
  recoverExpiredOutboxLeases,
  getOldestOutboxMutation,
  listExhaustedMutations,
  retryExhaustedMutation,
  claimMutation,
  markMutationFailed,
  acknowledgeMutation,
  clearMutationOutbox,
} from '@/storage/mutation-outbox';

const OWNER = 'user-1';
let counter = 0;

function input(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    id: `op-${Date.now()}-${counter}`,
    ownerId: OWNER,
    operation: 'create-ad' as const,
    resourceId: null,
    payload: { title: 'Test', description: 'Description' },
    idempotencyKey: `idem-${Date.now()}-${counter}`,
    ...overrides,
  };
}

const db = () => mock;
const rawDb = async () => (await mock).getRawDb('marketplat-public-cache.db')!;

// ── Enqueue ────────────────────────────────────────────────────────
describe('enqueueMutation', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('accepts valid input', async () => {
    await enqueueMutation(input());
    const list = await listAllOutboxMutations(OWNER);
    expect(list).toHaveLength(1);
    expect(list[0].state).toBe('pending');
    expect(list[0].attempts).toBe(0);
  });

  it('rejects empty id', async () => {
    await expect(enqueueMutation(input({ id: '   ' }))).rejects.toThrow(/ID and idempotency key/);
  });

  it('rejects empty ownerId', async () => {
    await expect(enqueueMutation(input({ ownerId: '' }))).rejects.toThrow(/account owner/);
  });

  it('rejects unsupported operation', async () => {
    await expect(enqueueMutation(input({ operation: 'delete-user' }))).rejects.toThrow(/Unsupported/);
  });

  it('rejects non-JSON-serializable payload', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(enqueueMutation(input({ payload: circular }))).rejects.toThrow(/JSON-serializable/);
  });

  it('rejects payload over 100,000 chars', async () => {
    await expect(enqueueMutation(input({ payload: { data: 'x'.repeat(100_001) } })))
      .rejects.toThrow(/exceeds the allowed size/);
  });

  it('rejects credential field (password)', async () => {
    await expect(enqueueMutation(input({ payload: { title: 'ok', password: 'x' } })))
      .rejects.toThrow(/Authentication or credential/);
  });

  it('rejects nested credential (accessToken)', async () => {
    await expect(enqueueMutation(input({ payload: { meta: { accessToken: 'x' } } })))
      .rejects.toThrow(/Authentication or credential/);
  });

  it('enforces MAX_PENDING (50)', async () => {
    for (let i = 0; i < 50; i += 1) {
      await enqueueMutation(input());
    }
    await expect(enqueueMutation(input())).rejects.toThrow(/queue is full/);
  });
});

// ── FIFO ordering ─────────────────────────────────────────────────
describe('FIFO ordering', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('listAllOutboxMutations returns FIFO', async () => {
    const a = input(); await enqueueMutation(a);
    await new Promise((r) => setTimeout(r, 2));
    const b = input(); await enqueueMutation(b);
    const list = await listAllOutboxMutations(OWNER);
    expect(list.map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('getOldestOutboxMutation returns true head including failed/processing', async () => {
    const a = input(); await enqueueMutation(a);
    await new Promise((r) => setTimeout(r, 2));
    const b = input(); await enqueueMutation(b);

    // Move 'a' to 'failed' — it's still the FIFO head
    await rawDb().then((db) => db.prepare(
      "UPDATE mutation_outbox SET state='failed', attempts=3 WHERE id=?"
    ).run(a.id));

    const head = await getOldestOutboxMutation(OWNER);
    expect(head?.id).toBe(a.id);
  });

  it('getOldestOutboxMutation returns null when empty', async () => {
    expect(await getOldestOutboxMutation(OWNER)).toBeNull();
  });

  it('listPendingMutations filters by attempts and next_attempt_at', async () => {
    const a = input(); await enqueueMutation(a);
    const b = input(); await enqueueMutation(b);
    const c = input(); await enqueueMutation(c);

    const raw = await rawDb();
    // 'a' exhausted (attempts=8)
    raw.prepare("UPDATE mutation_outbox SET attempts=8 WHERE id=?").run(a.id);
    // 'b' in backoff (next_attempt_at in future)
    raw.prepare("UPDATE mutation_outbox SET next_attempt_at=? WHERE id=?").run(Date.now() + 60_000, b.id);
    // 'c' ready

    const pending = await listPendingMutations(OWNER);
    expect(pending.map((x) => x.id)).toEqual([c.id]);
  });

  it('countUnownedOutboxMutations counts only null/empty ownerId', async () => {
    await enqueueMutation(input());
    const raw = await rawDb();
    raw.exec("INSERT INTO mutation_outbox (id, owner_id, operation, payload_json, idempotency_key, state, attempts, created_at, next_attempt_at, lease_until) VALUES ('legacy', NULL, 'create-ad', '{}', 'legacy-key', 'pending', 0, 0, 0, 0)");
    expect(await countUnownedOutboxMutations()).toBe(1);
  });
});

// ── claimMutation (leases) ────────────────────────────────────────
describe('claimMutation', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('claims a pending row and sets state=processing', async () => {
    const a = input(); await enqueueMutation(a);
    const claimed = await claimMutation(a.id, 'worker-A', 60_000, OWNER);
    expect(claimed).not.toBeNull();
    expect(claimed!.state).toBe('processing');
    expect(claimed!.attempts).toBe(1);
  });

  it('fails when already claimed with active lease', async () => {
    const a = input(); await enqueueMutation(a);
    await claimMutation(a.id, 'worker-A', 60_000, OWNER);
    const second = await claimMutation(a.id, 'worker-B', 60_000, OWNER);
    expect(second).toBeNull();
  });

  it('succeeds when lease has expired (steal)', async () => {
    const a = input(); await enqueueMutation(a);
    // Simulate a stale worker: state=processing, lease expired
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET state='processing', lease_owner='worker-A', lease_until=? WHERE id=?")
      .run(Date.now() - 1_000, a.id);

    const claimed = await claimMutation(a.id, 'worker-B', 60_000, OWNER);
    expect(claimed).not.toBeNull();
    expect(claimed!.leaseOwner).toBe('worker-B');
  });

  it('rejects empty lease owner', async () => {
    const a = input(); await enqueueMutation(a);
    await expect(claimMutation(a.id, '   ', 60_000, OWNER)).rejects.toThrow(/lease owner/);
  });

  it('fails when attempts >= MAX_ATTEMPTS (8)', async () => {
    const a = input(); await enqueueMutation(a);
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET attempts=8 WHERE id=?").run(a.id);
    const claimed = await claimMutation(a.id, 'worker-A', 60_000, OWNER);
    expect(claimed).toBeNull();
  });
});

// ── markMutationFailed (backoff) ──────────────────────────────────
describe('markMutationFailed', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('sets state=failed and schedules backoff based on attempts', async () => {
    const a = input(); await enqueueMutation(a);
    await claimMutation(a.id, 'worker-A', 60_000, OWNER); // attempts=1

    const before = Date.now();
    await markMutationFailed(a.id, 'server error', 'worker-A');
    const after = Date.now();

    const raw = await rawDb();
    const row = raw.prepare("SELECT * FROM mutation_outbox WHERE id=?").get(a.id) as { state: string; next_attempt_at: number; lease_owner: string | null; last_error: string };
    expect(row.state).toBe('failed');
    expect(row.lease_owner).toBeNull();
    expect(row.last_error).toContain('server error');
    // attempts=1 → delay = 5000 * 2^0 = 5000ms
    expect(row.next_attempt_at).toBeGreaterThanOrEqual(before + 5_000);
    expect(row.next_attempt_at).toBeLessThanOrEqual(after + 5_100);
  });

  it('caps backoff at 1 hour even for high attempts', async () => {
    const a = input(); await enqueueMutation(a);
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET state='processing', attempts=20, lease_owner='worker-A', lease_until=? WHERE id=?")
      .run(Date.now() + 60_000, a.id);

    const before = Date.now();
    await markMutationFailed(a.id, 'still failing', 'worker-A');
    const after = Date.now();

    const updated = raw.prepare("SELECT next_attempt_at FROM mutation_outbox WHERE id=?").get(a.id) as { next_attempt_at: number };
    // max delay = 3,600,000ms (1 hour)
    expect(updated.next_attempt_at).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(updated.next_attempt_at).toBeLessThanOrEqual(after + 3_600_100);
  });

  it('ignores when lease owner does not match', async () => {
    const a = input(); await enqueueMutation(a);
    await claimMutation(a.id, 'worker-A', 60_000, OWNER);

    await markMutationFailed(a.id, 'error', 'WRONG-WORKER');

    const raw = await rawDb();
    const row = raw.prepare("SELECT state, lease_owner FROM mutation_outbox WHERE id=?").get(a.id) as { state: string; lease_owner: string };
    expect(row.state).toBe('processing'); // unchanged
    expect(row.lease_owner).toBe('worker-A'); // unchanged
  });
});

// ── recoverExpiredOutboxLeases ────────────────────────────────────
describe('recoverExpiredOutboxLeases', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('recovers expired processing rows', async () => {
    const a = input(); await enqueueMutation(a);
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET state='processing', lease_owner='dead-worker', lease_until=? WHERE id=?")
      .run(Date.now() - 1_000, a.id);

    const count = await recoverExpiredOutboxLeases(Date.now());
    expect(count).toBe(1);

    const row = raw.prepare("SELECT state, lease_owner FROM mutation_outbox WHERE id=?").get(a.id) as { state: string; lease_owner: string | null };
    expect(row.state).toBe('pending');
    expect(row.lease_owner).toBeNull();
  });

  it('does NOT touch active leases (worker may be waiting for server)', async () => {
    const a = input(); await enqueueMutation(a);
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET state='processing', lease_owner='live-worker', lease_until=? WHERE id=?")
      .run(Date.now() + 30_000, a.id);

    const count = await recoverExpiredOutboxLeases(Date.now());
    expect(count).toBe(0);

    const row = raw.prepare("SELECT state, lease_owner FROM mutation_outbox WHERE id=?").get(a.id) as { state: string; lease_owner: string };
    expect(row.state).toBe('processing');
    expect(row.lease_owner).toBe('live-worker');
  });
});

// ── acknowledge + retry + discard + clear ─────────────────────────
describe('acknowledge / retry / discard / clear', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('acknowledgeMutation deletes only for correct lease owner', async () => {
    const a = input(); await enqueueMutation(a);
    await claimMutation(a.id, 'worker-A', 60_000, OWNER);

    expect(await acknowledgeMutation(a.id, 'WRONG')).toBe(false);
    expect(await acknowledgeMutation(a.id, 'worker-A')).toBe(true);

    const list = await listAllOutboxMutations(OWNER);
    expect(list).toHaveLength(0);
  });

  it('listExhaustedMutations only returns failed with attempts >= 8', async () => {
    const a = input(); await enqueueMutation(a);
    const b = input(); await enqueueMutation(b);
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET state='failed', attempts=8 WHERE id=?").run(a.id);
    raw.prepare("UPDATE mutation_outbox SET state='failed', attempts=3 WHERE id=?").run(b.id);

    const exhausted = await listExhaustedMutations(OWNER);
    expect(exhausted.map((x) => x.id)).toEqual([a.id]);
  });

  it('retryExhaustedMutation only retries the FIFO head', async () => {
    const a = input(); await enqueueMutation(a);
    await new Promise((r) => setTimeout(r, 2));
    const b = input(); await enqueueMutation(b);
    const raw = await rawDb();
    raw.prepare("UPDATE mutation_outbox SET state='failed', attempts=8 WHERE id IN (?, ?)").run(a.id, b.id);

    // Retrying 'b' (not head) must fail
    expect(await retryExhaustedMutation(b.id, OWNER)).toBe(false);
    // Retrying 'a' (head) must succeed
    expect(await retryExhaustedMutation(a.id, OWNER)).toBe(true);
  });

  it('discardOutboxMutation refuses processing rows', async () => {
    const a = input(); await enqueueMutation(a);
    await claimMutation(a.id, 'worker-A', 60_000, OWNER);
    expect(await discardOutboxMutation(a.id, OWNER)).toBe(false);
  });

  it('discardOutboxMutation removes pending rows', async () => {
    const a = input(); await enqueueMutation(a);
    expect(await discardOutboxMutation(a.id, OWNER)).toBe(true);
    expect(await listAllOutboxMutations(OWNER)).toHaveLength(0);
  });

  it('clearMutationOutbox preserves processing rows', async () => {
    const a = input(); await enqueueMutation(a);
    const b = input(); await enqueueMutation(b);
    const c = input(); await enqueueMutation(c);
    await claimMutation(b.id, 'worker-A', 60_000, OWNER);

    await clearMutationOutbox();

    const list = await listAllOutboxMutations(OWNER);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
    expect(list[0].state).toBe('processing');
  });
});
