import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stream = readFileSync(new URL('../src/features/messaging/chat-live-stream.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../app/messages/[id].tsx', import.meta.url), 'utf8');
const cache = readFileSync(new URL('../src/storage/chat-message-cache.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8');

assert.match(stream, /Authorization:\s*`Bearer \$\{currentToken\}`/, 'SSE must use the current bearer token');
assert.match(stream, /Last-Event-ID/, 'SSE reconnects must send the last replay ID');
assert.match(stream, /response\.body[\s\S]*getReader/, 'SSE must consume the response stream instead of JSON parsing');
assert.match(stream, /Math\.min\(30_000/, 'reconnect delay must be bounded');
assert.match(stream, /response\.status === 404 \|\| response\.status === 405/, 'unsupported SSE endpoints must use fallback');
assert.match(stream, /signal:\s*controller\.signal/, 'SSE requests must be abortable');
assert.match(client, /export function getApiBaseUrl/, 'stream transport must reuse the configured API origin');
assert.match(screen, /subscribeChatLiveStream/, 'conversation screen must subscribe while focused');
assert.match(screen, /onEvent:\s*\(event, eventId\) => \{ if \(eventId\) lastEventId = eventId;/, 'reconnect cursor must be retained for the screen session');
assert.match(screen, /fallbackPoll = setInterval[\s\S]*30_000/, 'REST polling fallback must be throttled to 30 seconds');
assert.match(screen, /event\.type === 'message:new'/, 'incoming message events must update the active conversation');
assert.match(screen, /event\.type === 'message:deleted'/, 'deleted messages must be redacted immediately');
assert.match(cache, /markCachedChatMessageDeleted/, 'deleted message redaction must propagate to local cache');
assert.doesNotMatch(stream, /socket\.io|new WebSocket/i, 'this phase must not add a Socket.IO/WebSocket dependency');
console.log('Chat live-stream static audit passed.');
