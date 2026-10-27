import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const chat = read('../components/messages/ChatWindow.tsx');
const stream = read('../hooks/useNotificationStream.ts');
const inbox = read('../app/(protected)/messages/page.tsx');
const tests = read('../__tests__/components/ChatWindow.test.tsx');
const apiRoutes = read('../../api/src/modules/conversations/conversations.routes.ts');

const checks = [
  ['thread search uses already-loaded messages', chat.includes('searchMatches') && chat.includes('الرسائل المحمّلة فقط')],
  ['search supports Ctrl/Cmd+F and Escape', chat.includes("event.key.toLowerCase() === 'f'") && chat.includes("event.key === 'Escape'")],
  ['search can navigate between matches', chat.includes('jumpToSearchMatch(activeSearchIndex - 1)') && chat.includes('jumpToSearchMatch(activeSearchIndex + 1)')],
  ['SSE conversation refreshes are coalesced', stream.includes('scheduleConversationRefresh') && stream.includes('}, 500);')],
  ['new message events refresh unread state', stream.includes('scheduleConversationRefresh(queryClient, conversationId, true)')],
  ['visible active conversation is refreshed to apply read receipts', stream.includes('document.visibilityState === \'visible\'') && stream.includes('queryKeys.conversations.messagesRoot(id)')],
  ['deleted messages refresh conversation preview', stream.includes('scheduleConversationRefresh(queryClient, conversationId);')],
  ['desktop inbox pane includes meaningful navigation and feature guidance', inbox.includes('استكشف الإعلانات') && inbox.includes('استكشف الخدمات') && inbox.includes('ميزات الرسائل')],
  ['message-search regression tests are present', tests.includes('searches within loaded messages') && tests.includes('لا توجد رسائل مطابقة')],
  ['image-message route requires verified email consistently with other attachments', /\/:id\/messages\/image',[\s\S]*?requireVerifiedEmail/.test(apiRoutes)],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  assert.ok(ok, label);
}
console.log(`\n${checks.length}/${checks.length} chat web feature checks passed.`);
