import fs from 'node:fs';
import assert from 'node:assert/strict';

const screen = fs.readFileSync(new URL('../app/notifications.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../api/src/modules/engagement/notifications/notifications.service.ts', import.meta.url), 'utf8');
const validation = fs.readFileSync(new URL('../../api/src/modules/engagement/notifications/notifications.validation.ts', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../../api/prisma/schema.prisma', import.meta.url), 'utf8');
const contract = fs.readFileSync(new URL('../../../packages/contracts/src/notifications.ts', import.meta.url), 'utf8');
const liveHook = fs.readFileSync(new URL('../src/features/notifications/useNotificationLiveStream.ts', import.meta.url), 'utf8');
const messagingApi = fs.readFileSync(new URL('../src/features/messaging/messaging.api.ts', import.meta.url), 'utf8');

assert.match(screen, /resolveNotificationTarget\(item\.type, data\)/, 'Mobile must resolve deep links through the shared contract');
assert.match(screen, /NOTIFICATION_TYPE_META\[item\.type as NotificationType\]/, 'Mobile must use shared type metadata for notification icons');
assert.match(screen, /NOTIFICATION_CATEGORIES\.map/, 'Mobile must render the shared category filters');
assert.match(screen, /activeCategory\)/, 'Mobile must pass selected category to API pagination');
assert.match(screen, /case 'profile':[\s\S]*?case 'following_feed':/, 'Mobile must support follower and followed-activity destinations');
assert.match(screen, /case 'sale': return id \? `\/sales\/\$\{id\}` : '\/my-sales';/, 'Mobile must retain the sale ID in sales deep links');
for (const target of ['service', 'store', 'store_members', 'service_request', 'appointments', 'order', 'installments', 'debts', 'sales']) {
  assert.ok(screen.includes(`case '${target}':`), `Missing shared destination mapping: ${target}`);
}
assert.match(liveHook, /subscribeChatLiveStream/, 'Mobile notification screen must subscribe to the shared SSE stream');
assert.match(liveHook, /event\.type === 'notification' \|\| event\.type === 'resync'/, 'Mobile must refresh after notification changes and resync');
assert.match(messagingApi, /category\?: 'all' \| NotificationCategory/, 'Mobile API client must accept shared notification categories');
assert.match(messagingApi, /query\.set\('category', category\)/, 'Mobile API client must send category filter to API');
assert.match(validation, /notificationCategorySchema/, 'API must validate categories from the shared contract');
assert.match(validation, /NOTIFICATION_CATEGORY_TYPES/, 'API category filters must use the shared type partition');
assert.match(api, /readNotificationPreference/, 'API must parse legacy preference booleans strictly');

const prismaTypes = [...schema.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*$/gm)]
  .map(match => match[1]);
for (const type of ['NEW_FOLLOWER', 'FOLLOWED_USER_ACTIVITY', 'FOLLOWED_STORE_ACTIVITY', 'FOLLOWED_CATEGORY_ACTIVITY', 'SALES_OVERDUE_DEBT', 'SALES_UPCOMING_INSTALLMENT', 'SALES_INACTIVE_CUSTOMER', 'SALES_DAILY_SUMMARY', 'SALES_SMART_INSIGHT']) {
  assert.ok(prismaTypes.includes(type), `Notification type ${type} must exist in Prisma`);
  assert.ok(contract.includes(`${type}:`), `Notification type ${type} must have shared metadata`);
}
console.log('Notification destination and cross-platform contract checks passed.');
