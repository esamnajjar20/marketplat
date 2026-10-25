import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../src/storage/', import.meta.url);
const sync = fs.readFileSync(new URL('outbox-sync.ts', root), 'utf8');
const transport = fs.readFileSync(new URL('outbox-transport.ts', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const token of [
  'syncNextOutboxMutation', 'getOldestOutboxMutation()', "decideOutboxHeadAction(candidate, Date.now())",
  'claimMutation(candidate.id, leaseOwner, OUTBOX_LEASE_DURATION_MS)', 'sendOutboxCreateAd(claimed, token, csrfToken)',
  'markMutationFailed(claimed.id, message, leaseOwner)', 'acknowledgeMutation(claimed.id, leaseOwner)',
  "status: 'server-succeeded-local-ack-pending'", "error.status === 401 || error.status === 403",
  "status: 'blocked-by-unsupported'", "throw new ApiError('سجّل الدخول قبل مزامنة الإعلانات المحفوظة دون اتصال.', 401)",
]) assert.ok(sync.includes(token), `Phase 29 sync contract missing: ${token}`);
assert.ok(sync.indexOf('await sendOutboxCreateAd') < sync.indexOf('await acknowledgeMutation'), 'Outbox must be acknowledged only after transport success');
assert.ok(sync.indexOf('await markMutationFailed') < sync.indexOf('return { status: \'retry-scheduled\''), 'Failures must be recorded before returning retry status');
assert.ok(transport.includes("response.success !== true") && transport.includes('response.data === undefined'), 'Transport must validate successful API envelope');
assert.ok(pkg.scripts.test.includes('verify-phase29.mjs'), 'Phase 29 verifier must be included in npm test');
console.log('Phase 29 outbox lifecycle checks passed (static source checks; no native SQLite/API integration).');
