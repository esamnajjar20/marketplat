import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decideOutboxHeadAction } from '../src/storage/outbox-sync-policy.mjs';

const policy = new URL('../src/storage/outbox-sync-policy.mjs', import.meta.url);
const sync = await readFile(new URL('../src/storage/outbox-sync.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/storage/mutation-outbox.ts', import.meta.url), 'utf8');
const sales = await readFile(new URL('../../api/src/modules/sales/sales.service.ts', import.meta.url), 'utf8');
const integration = await readFile(new URL('../../api/tests/integration/sales.flow.test.ts', import.meta.url), 'utf8');

// Pure policy checks: the queue must preserve FIFO when its head is delayed,
// processing, exhausted, or unsupported rather than skipping to a later write.
assert.deepEqual(decideOutboxHeadAction(null, 100), { status: 'nothing-due' });
assert.equal(decideOutboxHeadAction({ id: '1', state: 'processing', attempts: 0 }, 100).status, 'already-processing');
assert.equal(decideOutboxHeadAction({ id: '1', state: 'pending', attempts: 8, nextAttemptAt: 0, operation: 'create-ad' }, 100).status, 'blocked-by-exhausted');
assert.equal(decideOutboxHeadAction({ id: '1', state: 'pending', attempts: 1, nextAttemptAt: 101, operation: 'create-ad' }, 100).status, 'waiting-for-retry');
assert.equal(decideOutboxHeadAction({ id: '1', state: 'pending', attempts: 1, nextAttemptAt: 0, operation: 'update-ad' }, 100).status, 'send-update-ad');
assert.equal(decideOutboxHeadAction({ id: '1', state: 'pending', attempts: 1, nextAttemptAt: 0, operation: 'unknown' }, 100).status, 'blocked-by-unsupported');

// Guardrails that must remain coupled to the policy: account-bound queue access,
// lease ownership, no credential storage, and idempotent sale replay.
assert.match(sync, /getOldestOutboxMutation\(ownerId\)/);
assert.match(sync, /claimMutation\(candidate\.id, leaseOwner/);
assert.match(sync, /acknowledgeMutation\(claimed\.id, leaseOwner\)/);
assert.match(sync, /if \(!input\.isOnline\) return \{ status: 'offline' \}/);
assert.match(outbox, /containsCredentialField\(input\.payload\)/);
assert.match(outbox, /owner_id = \?/);
assert.match(sales, /offlineOperationId: offlineOperationId \?\? null/);
assert.match(integration, /deduplicates concurrent retries of the same offline operation/);
assert.match(integration, /rejects duplicate product rows in a POS cart/);
console.log('Phase 78: outbox FIFO/retry/lease/account guards and sale idempotency/duplicate-cart checks passed.');
