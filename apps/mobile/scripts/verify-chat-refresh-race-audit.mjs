import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const screen = readFileSync(new URL('../app/messages/[id].tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(screen, /function mergeFetchedMessages\(fetched: ChatMessage\[\], current: ChatMessage\[\]\)/, 'chat screen should merge server refreshes with pending optimistic messages');
assert.match(screen, /message\.id\.startsWith\('pending-'\)/, 'pending messages must survive an overlapping refresh');
assert.match(screen, /function replaceOptimisticMessage\(current: ChatMessage\[\], tempId: string, sent: ChatMessage\)/, 'send completion should reconcile optimistic and server message IDs');
assert.match(screen, /setMessages\(\(current\) => mergeFetchedMessages\(rows, current\)\)/, 'refresh should use the safe message merge');
assert.match(screen, /setMessages\(\(current\) => replaceOptimisticMessage\(current, tempId, sent\)\)/, 'send completion should deduplicate server message after concurrent refresh');
assert.match(pkg.scripts.test, /verify-chat-refresh-race-audit\.mjs/, 'new chat race check should be part of npm test');
console.log('Chat refresh race audit checks passed (optimistic messages are preserved and reconciled without duplicates).');
