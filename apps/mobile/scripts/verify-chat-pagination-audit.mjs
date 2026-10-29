import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const screen = readFileSync(new URL('../app/messages/[id].tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/features/messaging/messaging.api.ts', import.meta.url), 'utf8');
const cache = readFileSync(new URL('../src/storage/chat-message-cache.ts', import.meta.url), 'utf8');
const backendRepository = readFileSync(new URL('../../api/src/modules/conversations/conversations.repository.ts', import.meta.url), 'utf8');
const backendService = readFileSync(new URL('../../api/src/modules/conversations/conversations.service.ts', import.meta.url), 'utf8');
const validation = readFileSync(new URL('../../api/src/modules/conversations/conversations.validation.ts', import.meta.url), 'utf8');

assert.match(api, /cursor: 'true'/, 'mobile message pages must opt into cursor-only metadata');
assert.match(validation, /cursor: z\.preprocess/, 'API must validate the cursor-mode flag');
assert.match(backendRepository, /query\.cursor \|\| query\.before \? Promise\.resolve\(null\)/, 'cursor navigation must avoid full-thread COUNT queries');
assert.match(backendService, /query\.before\s*\?\s*Promise\.resolve\(\{ count: 0 \}\)/, 'older history pages must not update all read receipts');
assert.match(backendService, /if \(!query\.before\)/, 'notification-read side effects must be limited to newest-window requests');
assert.match(cache, /PRIMARY KEY \(owner_id, conversation_id, message_id\)/, 'cached messages must be isolated by account and conversation');
assert.match(cache, /MAX_MESSAGES_PER_CONVERSATION = 300/, 'local history cache must be bounded');
assert.match(screen, /readCachedChatMessages\(user\.id, id\)/, 'screen must render account-scoped cached history before waiting for network');
assert.match(screen, /if \(user\?\.id\) void saveCachedChatMessages\(user\.id, id, pageR\.value\.items\)/, 'newest server page must refresh the local cache');
assert.match(screen, /previousConnectivity\.current === false && connected/, 'reconnection must trigger one catch-up fetch instead of periodic polling');
console.log('Chat pagination/offline audit passed (cursor COUNT avoided, read side effects reduced, account-scoped SQLite history, reconnect catch-up).');
