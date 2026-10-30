import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const api = readFileSync(new URL('../src/features/messaging/messaging.api.ts', import.meta.url), 'utf8');
const schemas = readFileSync(new URL('../src/api/response-schemas.ts', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../src/api/__tests__/response-validation.test.ts', import.meta.url), 'utf8');

for (const name of [
  'conversationListEnvelopeResponseSchema',
  'chatMessageListEnvelopeResponseSchema',
  'chatMessageEnvelopeResponseSchema',
  'conversationCreatedEnvelopeResponseSchema',
  'conversationEnvelopeResponseSchema',
  'notificationListEnvelopeResponseSchema',
  'unreadCountEnvelopeResponseSchema',
]) {
  assert.match(schemas, new RegExp(`export const ${name}\\s*=`), `${name} must be exported`);
}
assert.match(api, /responseSchema: conversationListEnvelopeResponseSchema/);
assert.match(api, /responseSchema: chatMessageListEnvelopeResponseSchema/);
assert.match(api, /responseSchema: chatMessageEnvelopeResponseSchema/);
assert.match(api, /responseSchema: notificationListEnvelopeResponseSchema/);
assert.match(api, /responseSchema: unreadCountEnvelopeResponseSchema/);
assert.match(tests, /describe\('messaging and notification contracts'/);
assert.match(tests, /rejecting malformed IDs/);
console.log('Messaging API contract checks passed (runtime schemas are attached to the high-traffic messaging and notification calls).');
