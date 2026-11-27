import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOTIFICATION_CATEGORY_IDS,
  NOTIFICATION_CATEGORY_TYPES,
  NOTIFICATION_CONTENT_PREFERENCE_KEYS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_TYPE_META,
  NOTIFICATION_TYPES,
  notificationPreferencesPatchSchema,
  notificationPushPayloadSchema,
  readNotificationPreference,
  resolveNotificationTarget,
} from '../dist/notifications.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const prismaSchema = fs.readFileSync(path.join(root, 'apps/api/prisma/schema.prisma'), 'utf8');

describe('shared notification contract', () => {
  it('matches the Prisma NotificationType enum exactly', () => {
    const enumBlock = prismaSchema.match(/enum NotificationType\s*\{([\s\S]*?)\n\}/)?.[1];
    assert.ok(enumBlock);
    const prismaTypes = enumBlock.split('\n').map(line => line.replace(/\/\/.*$/, '').trim()).map(line => line.match(/^([A-Z][A-Z0-9_]*)\b/)?.[1]).filter(Boolean);
    assert.deepEqual([...NOTIFICATION_TYPES].sort(), prismaTypes.sort());
  });

  it('assigns every notification type to exactly one category and supplies metadata', () => {
    const assigned = Object.values(NOTIFICATION_CATEGORY_TYPES).flat();
    assert.equal(assigned.length, NOTIFICATION_TYPES.length);
    assert.deepEqual([...assigned].sort(), [...NOTIFICATION_TYPES].sort());
    assert.deepEqual(Object.keys(NOTIFICATION_TYPE_META).sort(), [...NOTIFICATION_TYPES].sort());
    for (const meta of Object.values(NOTIFICATION_TYPE_META)) {
      assert.ok(meta.label.trim());
      assert.ok(meta.category);
      assert.ok(meta.icon);
    }
    assert.deepEqual(Object.keys(NOTIFICATION_CATEGORY_TYPES).sort(), [...NOTIFICATION_CATEGORY_IDS].sort());
  });

  it('resolves web/mobile logical destinations consistently for the audited cases', () => {
    assert.deepEqual(resolveNotificationTarget('NEW_FOLLOWER', { followerId: 'user-1' }), { kind: 'profile', id: 'user-1' });
    assert.deepEqual(resolveNotificationTarget('FOLLOWED_STORE_ACTIVITY', null), { kind: 'following_feed' });
    assert.deepEqual(resolveNotificationTarget('NEW_SERVICE_QUOTE', { serviceId: 'service-1' }), { kind: 'service', id: 'service-1' });
    assert.deepEqual(resolveNotificationTarget('SERVICE_REQUEST_NEW', { requestId: 'request-1' }), { kind: 'service_request', id: 'request-1' });
    assert.deepEqual(resolveNotificationTarget('MARKETPLACE_ORDER_NEW', { orderId: 'order-1' }), { kind: 'order', id: 'order-1' });
    assert.deepEqual(resolveNotificationTarget('SALES_OVERDUE_INSTALLMENT', null), { kind: 'installments' });
    assert.deepEqual(resolveNotificationTarget('SALES_OVERDUE_DEBT', null), { kind: 'debts' });
  });

  it('does not treat legacy string false as enabled', () => {
    assert.equal(readNotificationPreference({ storeUpdates: 'false' }, 'storeUpdates'), false);
    assert.equal(readNotificationPreference({ followUpdates: 'true' }, 'followUpdates'), true);
    assert.equal(readNotificationPreference({ storeUpdates: 'garbage' }, 'storeUpdates'), NOTIFICATION_PREFERENCE_DEFAULTS.storeUpdates);
    assert.equal(readNotificationPreference(null, 'salesAlerts'), NOTIFICATION_PREFERENCE_DEFAULTS.salesAlerts);
  });

  it('validates only known preference fields and allows partial updates', () => {
    assert.equal(notificationPreferencesPatchSchema.safeParse({ followUpdates: false }).success, true);
    assert.equal(notificationPreferencesPatchSchema.safeParse({ quietHoursStart: '22:15' }).success, true);
    assert.equal(notificationPreferencesPatchSchema.safeParse({ quietHoursStart: '25:00' }).success, false);
    assert.equal(notificationPreferencesPatchSchema.safeParse({ unknownToggle: true }).success, false);
    assert.equal(NOTIFICATION_CONTENT_PREFERENCE_KEYS.length, 14);
    assert.equal(notificationPushPayloadSchema.safeParse({ title: 'تنبيه', body: 'تم تحديث حسابك' }).success, true);
    assert.equal(notificationPushPayloadSchema.safeParse({ title: '', body: 'x' }).success, false);
  });
});
