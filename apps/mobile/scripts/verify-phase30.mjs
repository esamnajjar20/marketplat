import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../src/storage/', import.meta.url);
const sync = fs.readFileSync(new URL('outbox-sync.ts', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const token of [
  'GuardedOutboxSyncResult', 'syncOutboxIfReady(input:', 'if (!input.isOnline) return { status: \'offline\' }',
  "if (!input.token?.trim() || !input.ownerId?.trim()) return { status: 'login-required-before-sync' }",
  'result: await syncNextOutboxMutation(input.token, input.csrfToken, input.ownerId)',
]) assert.ok(sync.includes(token), `Phase 30 guarded-sync contract missing: ${token}`);
assert.ok(sync.indexOf('if (!input.isOnline)') < sync.indexOf('syncNextOutboxMutation(input.token'), 'Offline guard must run before the sync worker');
assert.ok(sync.indexOf("if (!input.token?.trim() || !input.ownerId?.trim())") < sync.indexOf('syncNextOutboxMutation(input.token'), 'Session guard must run before the sync worker');
assert.ok(pkg.scripts.test.includes('verify-phase30.mjs'), 'Phase 30 verifier must be included in npm test');
console.log('Phase 30 guarded outbox entry checks passed (static source checks only).');
