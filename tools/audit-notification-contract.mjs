import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const prisma = read('apps/api/prisma/schema.prisma');
const contract = read('packages/contracts/src/notifications.ts');

function quotedValues(block) {
  return [...block.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map(match => match[1]);
}
function compareSets(label, actual, expected) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  assert.deepEqual(a, e, `${label} mismatch\nmissing: ${e.filter(x => !a.includes(x)).join(', ')}\nextra: ${a.filter(x => !e.includes(x)).join(', ')}`);
}

const prismaEnum = prisma.match(/enum NotificationType\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(prismaEnum, 'Prisma NotificationType enum not found');
const prismaTypes = prismaEnum.split('\n').map(line => line.replace(/\/\/.*$/, '').trim()).map(line => line.match(/^([A-Z][A-Z0-9_]*)\b/)?.[1]).filter(Boolean);
const sharedTuple = contract.match(/export const NOTIFICATION_TYPES = \[([\s\S]*?)\] as const/)?.[1];
assert.ok(sharedTuple, 'Shared NOTIFICATION_TYPES tuple not found');
const sharedTypes = quotedValues(sharedTuple);
compareSets('Prisma ↔ shared notification types', sharedTypes, prismaTypes);
assert.equal(sharedTypes.length, prismaTypes.length, 'Shared notification tuple contains duplicates');

const metaBlock = contract.match(/export const NOTIFICATION_TYPE_META:[\s\S]*?=\s*\{([\s\S]*?)\n\};/)?.[1];
assert.ok(metaBlock, 'Shared notification metadata not found');
const metaTypes = [...metaBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*:/gm)].map(match => match[1]);
compareSets('Notification type metadata coverage', metaTypes, prismaTypes);

const categoryBlock = contract.match(/export const NOTIFICATION_CATEGORY_TYPES = \{([\s\S]*?)\n\} as const/)?.[1];
assert.ok(categoryBlock, 'Shared notification category partition not found');
const categoryTypes = quotedValues(categoryBlock);
compareSets('Notification category partition', categoryTypes, prismaTypes);
assert.equal(categoryTypes.length, prismaTypes.length, 'Each notification type must occur in exactly one category');

for (const [label, source, pattern] of [
  ['API shared contract', 'apps/api/src/modules/engagement/notifications/notifications.validation.ts', /@marketplat\/contracts/],
  ['Web shared contract', 'frontend/lib/notificationMeta.ts', /@marketplat\/contracts/],
  ['Mobile shared contract', 'apps/mobile/app/notifications.tsx', /@marketplat\/contracts/],
  ['Web target resolution', 'frontend/lib/notificationMeta.ts', /resolveNotificationTarget\(/],
  ['Mobile target resolution', 'apps/mobile/app/notifications.tsx', /resolveNotificationTarget\(/],
  ['Lifecycle create dispatcher', 'apps/api/src/shared/notifications/notificationLifecycle.ts', /publishCreatedNotifications/],
  ['Lifecycle state dispatcher', 'apps/api/src/shared/notifications/notificationLifecycle.ts', /publishNotificationStateChange/],
  ['Read state SSE publication', 'apps/api/src/modules/engagement/notifications/notifications.repository.ts', /action: 'read'/],
  ['Delete state SSE publication', 'apps/api/src/modules/engagement/notifications/notifications.repository.ts', /action: 'deleted'/],
  ['Native live stream', 'apps/mobile/src/features/notifications/useNotificationLiveStream.ts', /subscribeChatLiveStream/],
  ['Web live stream', 'frontend/hooks/useNotificationStream.ts', /notification/],
  ['BullMQ delivery retained', 'apps/api/src/shared/notifications/pushService.ts', /notificationQueue|Queue/],
  ['Durable per-device push retained', 'apps/api/src/shared/go-worker/publishDurableNotifications.ts', /notification_push_dispatches|notification/],
]) {
  const sourceText = read(source);
  assert.match(sourceText, pattern, `${label} check failed in ${source}`);
}

console.log(`Notification contract audit passed: ${prismaTypes.length} Prisma types, ${categoryTypes.length} category assignments, ${metaTypes.length} metadata entries.`);
