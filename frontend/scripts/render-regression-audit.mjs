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
check(/useNowAfterMount\(enabled:\s*boolean\s*=\s*true\)/.test(clock), 'card clock: conditional subscription gate missing');
check(/enabled \? subscribeToNow : noopSubscribe/.test(clock), 'card clock: disabled cards still subscribe to the shared clock');

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
