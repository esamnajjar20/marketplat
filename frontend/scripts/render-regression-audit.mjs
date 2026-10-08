#!/usr/bin/env node
/**
 * CI guardrails for the rendering architecture. These checks are intentionally
 * source-level: they catch regressions before a browser profiler is available.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const cards = [
  'components/ads/AdCard.tsx',
  'components/stores/ProductCard.tsx',
  'components/stores/StoreCard.tsx',
  'components/services/ServiceListingCard.tsx',
  'components/services/ServiceProviderCard.tsx',
  'components/ads/AdListItem.tsx',
];
for (const file of cards) {
  const text = read(file);
  check(/memo\s*\(/.test(text), `${file}: high-frequency card/list item lost React.memo`);
  check(/\[content-visibility:auto\]/.test(text), `${file}: missing content-visibility:auto`);
  check(/\[contain-intrinsic-size:auto_[0-9]+px\]/.test(text), `${file}: missing contain-intrinsic-size fallback`);
}

const chatRow = read('components/messages/ChatMessageRow.tsx');
const chatWindow = read('components/messages/ChatWindow.tsx');
check(/isRetrying:\s*boolean/.test(chatRow), 'ChatMessageRow: shared retryingQueueId prop returned');
check(!/retryingQueueId\s*:/.test(chatRow), 'ChatMessageRow: retryingQueueId still exists in Props');
check(/isRetrying=\{retryingQueueId === message\.queueId\}/.test(chatWindow), 'ChatWindow: retry state was not reduced to row-local boolean');

const favorites = read('hooks/queries/useFavorites.ts');
check(!/cache\.subscribe\(\(event\)/.test(favorites), 'useFavorites: per-card QueryCache subscription returned');
check(/WeakMap<object, Map<string, FavoriteSetStore>>/.test(favorites), 'useFavorites: shared subscription registry missing');

const messageInput = read('components/messages/MessageInput.tsx');
check(!/const \[body,\s*setBody\]/.test(messageInput), 'MessageInput: body state is still owned by the whole composer');
check(/MessageBodyEditor/.test(messageInput), 'MessageInput: MessageBodyEditor isolation missing');

const clock = read('components/shared/cards/cardParts.tsx');
check(/setInterval\(notifyNow,\s*60_000\)/.test(clock), 'card clock: minute ticker missing');
check(/useNowAfterMount\(enabled:\s*boolean\s*=\s*true,\s*dateStr\?:\s*string\)/.test(clock), 'card clock: timestamp-aware scheduler API missing');
check(/enabled \? subscribeToNow\(listener,\s*dateStr\) : noopSubscribe\(listener\)/.test(clock), 'card clock: disabled cards still subscribe to the shared clock');
check(/visibilitychange/.test(clock), 'card clock: visibility-aware scheduler missing');
check(/relativeBucket/.test(clock), 'card clock: per-subscriber bucket gating missing');

const conversationList = read('components/messages/ConversationList.tsx');
const conversationRow = read('components/messages/ConversationRow.tsx');
const chatWindowNext = read('components/messages/ChatWindow.tsx');
check(/<ConversationRow/.test(conversationList), 'ConversationList: rows are still rendered inline');
check(/memo\(function ConversationRow/.test(conversationRow), 'ConversationRow: React.memo boundary missing');
check(/pendingFlagId === conversation\.id/.test(conversationList), 'ConversationList: flag pending state is still global');
check(/pendingMarkMessageId === message\.id/.test(chatWindowNext), 'ChatWindow: message mark pending state is still global');

const sharedIdSetStore = read('hooks/queries/sharedIdSetStore.ts');
const storesQuery = read('hooks/queries/useStores.ts');
const blockedUsersQuery = read('hooks/queries/useBlockedUsers.ts');
check(/useQueryIdSetMembership/.test(sharedIdSetStore), 'shared ID-set registry missing');
check(/useQueryIdSetMembership/.test(storesQuery), 'useIsFollowingStore: shared registry not used');
check(/useQueryIdSetMembership/.test(blockedUsersQuery), 'useIsUserBlocked: shared registry not used');

const notificationMutations = read('hooks/mutations/useNotificationMutations.ts');
const conversationMutations = read('hooks/mutations/useConversationMutations.ts');
check(!/queryClient\.invalidateQueries\(\{ queryKey: \['notifications'\] \}\)/.test(notificationMutations), 'notification mutations: root invalidation returned');
check(!/queryClient\.invalidateQueries\(\{ queryKey: \['conversations'\] \}\)/.test(conversationMutations), 'conversation mutations: root invalidation returned');

const notifications = read('components/notifications/NotificationsPage.tsx');
const notificationRow = read('components/notifications/NotificationRow.tsx');
check(/<NotificationRow/.test(notifications), 'NotificationsPage: rows are still rendered inline');
check(/memo\(function NotificationRow/.test(notificationRow), 'NotificationRow: React.memo boundary missing');
check(/\[content-visibility:auto\] \[contain-intrinsic-size:auto_104px\]/.test(notificationRow), 'NotificationRow: offscreen containment missing');

for (const file of fs.readdirSync(path.join(root, 'components/admin')).filter((f) => f.endsWith('Table.tsx'))) {
  const text = read(`components/admin/${file}`);
  check(/memo\s*\(/.test(text), `${file}: admin table lost parent render boundary`);
}

console.log(`render regression checks: ${failures.length ? 'FAILED' : 'PASSED'}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
