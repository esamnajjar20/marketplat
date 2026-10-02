/**
 * PUSH-TOPIC-HASH-01: the RFC 8030 Topic header is limited to 32 URL-safe
 * base64 chars. Truncating the raw tag made distinct long tags collide.
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

import { buildPushTopic } from '../../src/shared/utils/pushService';

describe('buildPushTopic', () => {
  it('returns undefined when there is no tag', () => {
    expect(buildPushTopic(undefined)).toBeUndefined();
    expect(buildPushTopic('')).toBeUndefined();
  });

  it('is at most 32 chars and URL-safe base64 only', () => {
    const t = buildPushTopic('conversation-clh3k2j4x0000abcdefghijklmn')!;
    expect(t.length).toBeLessThanOrEqual(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is stable for the same tag (needed for collapse)', () => {
    expect(buildPushTopic('conversation-abc')).toBe(buildPushTopic('conversation-abc'));
  });

  it('keeps long tags that differ only in their tail distinct', () => {
    const a = 'conversation-clh3k2j4x0000abcdefghijklmnA';
    const b = 'conversation-clh3k2j4x0000abcdefghijklmnB';
    // the old sanitize+slice(0, 32) mapped both to the same value
    expect(a.slice(0, 32)).toBe(b.slice(0, 32));
    expect(buildPushTopic(a)).not.toBe(buildPushTopic(b));
  });
});
