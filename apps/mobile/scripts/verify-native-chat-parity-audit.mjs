import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url).pathname, 'utf8');
const inbox = read('../app/messages.tsx');
const thread = read('../app/messages/[id].tsx');
const api = read('../src/features/messaging/messaging.api.ts');
const messageRow = read('../src/features/messaging/ConversationMessageRow.tsx');
const streamLifecycle = read('../src/features/messaging/useChatLiveStream.ts');
const mediaSync = read('../src/features/messaging/chat-media-outbox-sync.ts');
const checks = [
  ['conversation search is local and includes participants/context/message preview', /const visibleItems = useMemo/.test(inbox) && /item\.lastMessage\?\.body/.test(inbox)],
  ['inbox filters unread and archived conversations', /filter === 'unread'/.test(inbox) && /filter === 'archived'/.test(inbox)],
  ['pinned conversations sort before other conversations', /pinnedAt/.test(inbox) && /\.sort\(\(a,b\)/.test(inbox)],
  ['conversation pin/archive/mute uses authenticated API mutations', /setConversationFlags\(/.test(inbox) && /mutedUntil/.test(inbox)],
  ['thread search is local and does not fetch per keystroke', /const visibleMessages = normalizedSearch/.test(thread)],
  ['image attachments use image picker and the existing server route', /launchImageLibraryAsync/.test(thread) && /queueAndTryMedia\('image'/.test(thread) && /sendChatImage\(/.test(mediaSync) && /field === 'image' \? 'image'/.test(api)],
  ['message pin and star use existing server endpoints', /setMessageMark/.test(thread) && /messages\/\$\{encodeURIComponent\(messageId\)\}\/\$\{suffix\}/.test(api)],
  ['message deletion is confirmed before mutation', /Alert\.alert\('حذف الرسالة؟'/.test(thread) && /deleteChatMessage\(/.test(thread)],
  ['typing indicator and API calls are removed', !/signalChatTyping|partyTyping|typingTimer/.test(thread) && !/signalChatTyping/.test(api)],
  ['offline text outbox and SQLite message cache remain integrated', /enqueueChatMessage/.test(thread) && /readCachedChatMessages/.test(thread) && /saveCachedChatMessages/.test(thread)],
  ['SSE remains primary with fallback polling only when unsupported', /useChatLiveStream\(/.test(thread) && /subscribeChatLiveStream/.test(streamLifecycle) && /30_000/.test(streamLifecycle) && /onUnsupported: startFallback/.test(streamLifecycle)],
  ['image upload rejects oversized local files and unsupported MIME types', /5 \* 1024 \* 1024/.test(thread) && /image\/jpeg','image\/png','image\/webp/.test(thread)],
  ['received audio plays in the conversation and files open in the in-app browser', /useAudioPlayer/.test(thread) && /onPlayAudio=\{playChatAudio\}/.test(thread) && /تشغيل الرسالة الصوتية/.test(messageRow) && /WebBrowser\.openBrowserAsync/.test(messageRow) && /isAllowedMediaUrl/.test(messageRow)],
  ['conversation list can show validated participant avatars', /other\?\.avatarUrl/.test(read('../src/features/messaging/ConversationListItem.tsx')) && /<AppImage/.test(read('../src/features/messaging/ConversationListItem.tsx')) && /avatarImage/.test(read('../src/features/messaging/ConversationListItem.tsx'))],
];
let failed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed++; }
assert.equal(failed, 0, `${failed} native messaging audit check(s) failed`);
