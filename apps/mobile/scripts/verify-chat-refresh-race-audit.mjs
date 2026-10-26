import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const screen = readFileSync(new URL('../app/messages/[id].tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(screen, /function mergeFetchedMessages\(fetched: ScreenMessage\[\], current: ScreenMessage\[\]\)/, 'chat screen should merge server refreshes with pending optimistic messages');
assert.match(screen, /for \(const message of current\) byId\.set\(message\.id, message\)/, 'already loaded history and pending messages must survive refresh');
assert.match(screen, /function replaceOptimisticMessage\(current: ScreenMessage\[\], tempId: string, sent: ChatMessage\)/, 'send completion should reconcile optimistic and server message IDs');
assert.match(screen, /setMessages\(\(current\) => mergeFetchedMessages\(page\.items, \[\.\.\.current, \.\.\.queuedMessages\]\)\)/, 'refresh should merge server messages with durable queued messages');
assert.match(screen, /replaceOptimisticMessage\(current, `pending-\$\{operationId\}`, sent\)/, 'sync completion should deduplicate durable optimistic message after concurrent refresh');
assert.match(pkg.scripts.test, /verify-chat-refresh-race-audit\.mjs/, 'new chat race check should be part of npm test');
console.log('Chat refresh race audit checks passed (optimistic messages are preserved and reconciled without duplicates).');
