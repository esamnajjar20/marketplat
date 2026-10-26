import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const api = readFileSync(new URL('../src/features/messaging/messaging.api.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../app/messages/[id].tsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../api/src/modules/conversations/conversations.controller.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../api/src/modules/conversations/conversations.service.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(api, /operationId\?: string \| null/, 'text send API should accept a stable operation ID');
assert.match(api, /'X-Offline-Op-Id': operationId/, 'text send API should transmit the idempotency key');
assert.match(backend, /req\.headers\['x-offline-op-id'\]/, 'backend controller should consume the idempotency header');
assert.match(service, /findBySenderAndOperationId\(userId, opId\)/, 'backend should return an existing message for a replayed operation');
assert.match(screen, /retryOperation = useRef<\{ body: string; operationId: string; conversationId: string; userId: string \} \| null>/, 'screen should retain retry operation identity across a failed attempt');
assert.match(screen, /retryOperation\.current\?\.body === body && retryOperation\.current\.conversationId === id && retryOperation\.current\.userId === \(user\?\.id \|\| ''\) \? retryOperation\.current/, 'same message body retry should reuse its original operation ID');
assert.match(screen, /sendMessage\(id, body, accessToken, csrfToken, operationId\)/, 'screen should pass operation identity to the API');
assert.match(screen, /retryOperation\.current = \{ body, operationId, conversationId: id, userId: user\?\.id \|\| '' \}/, 'operation identity should be stored before the network request');
assert.match(pkg.scripts.test, /verify-chat-idempotent-retry-audit\.mjs/, 'idempotent retry audit should run in npm test');
console.log('Chat idempotent retry audit checks passed (stable operation ID is forwarded for same-body retries).');
