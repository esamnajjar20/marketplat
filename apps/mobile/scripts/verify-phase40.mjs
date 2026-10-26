import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toOutboxCreateAdRequest } from '../src/storage/outbox-transport-contract.mjs';

const transport = await readFile(new URL('../src/storage/outbox-transport.ts', import.meta.url), 'utf8');
const sync = await readFile(new URL('../src/storage/outbox-sync.ts', import.meta.url), 'utf8');
const contract = await readFile(new URL('../src/storage/outbox-transport-contract.mjs', import.meta.url), 'utf8');
const service = await readFile(new URL('../../api/src/modules/ads/ads.service.ts', import.meta.url), 'utf8').catch(() => '');

// Exercise the real pure request-contract function, including stable replay identity.
const item = {
  id: 'queue-item-1', operation: 'create-ad', resourceId: null,
  payloadJson: JSON.stringify({ title: 'Offline ad', images: [{ uri: 'file:///cache/ad.jpg', name: 'ad.jpg', type: 'image/jpeg' }] }), idempotencyKey: 'offline-op:stable-1',
};
const first = toOutboxCreateAdRequest(item);
const replay = toOutboxCreateAdRequest({ ...item });
assert.equal(first.path, '/api/v1/ads');
assert.equal(first.headers['X-Offline-Op-Id'], 'offline-op:stable-1');
assert.equal(replay.headers['X-Offline-Op-Id'], first.headers['X-Offline-Op-Id']);
assert.deepEqual(replay.body, first.body);
assert.deepEqual(first.images, [{ uri: 'file:///cache/ad.jpg', name: 'ad.jpg', type: 'image/jpeg' }]);
assert.match(transport, /timeoutMs: OUTBOX_REQUEST_TIMEOUT_MS/);
assert.match(transport, /OUTBOX_REQUEST_TIMEOUT_MS = 12_000/);
assert.match(sync, /OUTBOX_LEASE_DURATION_MS = 60_000/);
assert.match(sync, /claimMutation\(candidate\.id, leaseOwner, OUTBOX_LEASE_DURATION_MS, ownerId\)/);
assert.match(sync, /await sendOutboxCreateAd\(claimed, token, csrfToken\)/);
assert.match(sync, /await acknowledgeMutation\(claimed\.id, leaseOwner\)/);
assert.match(contract, /X-Offline-Op-Id/);
if (service) {
  assert.match(service, /where: \{ offlineOperationId \}/);
  assert.match(service, /existing\.userId !== userId/);
  assert.match(service, /code\?*: string \}\)\.code === 'P2002'/);
}
console.log('Phase 40 stable replay key, request deadline, and lease-budget checks passed. API service source checked when available; this is not a live SQLite/API integration test.');
