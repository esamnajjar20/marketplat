/**
 * NOTIF-QUIET-TZ-01: quiet hours are evaluated in the user's own IANA zone
 * (User.notificationPreferences.quietHoursTimeZone), falling back to Asia/Gaza.
 */
jest.mock('../../src/config/env', () => ({
  env: { webPush: { isConfigured: false, publicKey: '', privateKey: '', subject: '' } },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../src/shared/utils/pushSubscriptionsRepository', () => ({
  pushSubscriptionsRepository: { findManyByUserId: jest.fn(), deleteByEndpoints: jest.fn() },
}));
jest.mock('../../src/shared/utils/fcmPushService', () => ({
  fcmPushService: { notifyUser: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/config/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));

import { resolveQuietTimeZone } from '../../src/shared/utils/pushService';
import { updateNotificationPreferencesSchema } from '../../src/modules/users/users.validation';

describe('resolveQuietTimeZone', () => {
  it('keeps a valid IANA zone', () => {
    expect(resolveQuietTimeZone('Europe/Istanbul')).toBe('Europe/Istanbul');
  });

  it.each([undefined, null, '', 'Not/AZone', 42, 'x'.repeat(100)])(
    'falls back to Asia/Gaza for %p',
    (bad) => {
      expect(resolveQuietTimeZone(bad)).toBe('Asia/Gaza');
    },
  );
});

describe('updateNotificationPreferencesSchema — quietHoursTimeZone', () => {
  const parse = (body: unknown) => updateNotificationPreferencesSchema.safeParse({ body });

  it('accepts a valid zone', () => {
    expect(parse({ quietHoursTimeZone: 'Asia/Gaza' }).success).toBe(true);
  });

  it('rejects an unknown zone', () => {
    expect(parse({ quietHoursTimeZone: 'Mars/Olympus' }).success).toBe(false);
  });
});
