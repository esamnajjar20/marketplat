import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideOutboxHeadAction } from '../outbox-sync-policy.mjs';

// ─── Helper builders ────────────────────────────────────────────────
function item(overrides = {}) {
  return {
    id: 'op-1',
    operation: 'create-ad',
    state: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    ...overrides,
  };
}

const NOW = 1_700_000_000_000;

// ─── Tests ──────────────────────────────────────────────────────────
test('null candidate → nothing-due', () => {
  assert.deepEqual(decideOutboxHeadAction(null, NOW), { status: 'nothing-due' });
});

test('state=processing → already-processing', () => {
  const r = decideOutboxHeadAction(item({ state: 'processing' }), NOW);
  assert.equal(r.status, 'already-processing');
  assert.equal(r.id, 'op-1');
});

test('attempts >= 8 → blocked-by-exhausted', () => {
  const r = decideOutboxHeadAction(item({ attempts: 8 }), NOW);
  assert.equal(r.status, 'blocked-by-exhausted');
  assert.equal(r.attempts, 8);
});

test('attempts > 8 (leaked) → still blocked-by-exhausted', () => {
  const r = decideOutboxHeadAction(item({ attempts: 12 }), NOW);
  assert.equal(r.status, 'blocked-by-exhausted');
});

test('nextAttemptAt > now → waiting-for-retry', () => {
  const r = decideOutboxHeadAction(item({ nextAttemptAt: NOW + 5_000 }), NOW);
  assert.equal(r.status, 'waiting-for-retry');
  assert.equal(r.nextAttemptAt, NOW + 5_000);
});

test('nextAttemptAt === now → ready to send', () => {
  const r = decideOutboxHeadAction(item({ nextAttemptAt: NOW }), NOW);
  assert.equal(r.status, 'send-create-ad');
});

test('operation=create-ad → send-create-ad', () => {
  const r = decideOutboxHeadAction(item({ operation: 'create-ad' }), NOW);
  assert.equal(r.status, 'send-create-ad');
});

test('operation=delete-ad → send-delete-ad', () => {
  const r = decideOutboxHeadAction(item({ operation: 'delete-ad' }), NOW);
  assert.equal(r.status, 'send-delete-ad');
});

test('operation=update-ad → send-update-ad', () => {
  const r = decideOutboxHeadAction(item({ operation: 'update-ad' }), NOW);
  assert.equal(r.status, 'send-update-ad');
});

test('unknown operation → blocked-by-unsupported', () => {
  const r = decideOutboxHeadAction(item({ operation: 'wat' }), NOW);
  assert.equal(r.status, 'blocked-by-unsupported');
  assert.equal(r.operation, 'wat');
});

test('processing beats exhausted (order matters)', () => {
  const r = decideOutboxHeadAction(item({ state: 'processing', attempts: 20 }), NOW);
  assert.equal(r.status, 'already-processing');
});

test('exhausted beats waiting-for-retry (order matters)', () => {
  const r = decideOutboxHeadAction(
    item({ attempts: 8, nextAttemptAt: NOW + 10_000 }),
    NOW,
  );
  assert.equal(r.status, 'blocked-by-exhausted');
});
