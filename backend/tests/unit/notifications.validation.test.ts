import {
  getNotificationsSchema,
  notificationIdSchema,
  broadcastNotificationSchema,
  createPushSubscriptionSchema,
  deletePushSubscriptionSchema,
} from '../../src/modules/notifications/notifications.validation';

describe('notifications.validation', () => {
  describe('getNotificationsSchema', () => {
    it('parses with no query params at all', () => {
      const result = getNotificationsSchema.parse({ query: {} });
      expect(result.query.page).toBeUndefined();
      expect(result.query.limit).toBeUndefined();
      expect(result.query.unreadOnly).toBeUndefined();
    });

    it('coerces string page/limit query params to numbers', () => {
      const result = getNotificationsSchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page below the minimum', () => {
      expect(() => getNotificationsSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('rejects a limit above the maximum', () => {
      expect(() => getNotificationsSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('coerces the string "true" for unreadOnly to a real boolean', () => {
      const result = getNotificationsSchema.parse({ query: { unreadOnly: 'true' } });
      expect(result.query.unreadOnly).toBe(true);
    });

    it('coerces the string "false" for unreadOnly to a real boolean', () => {
      const result = getNotificationsSchema.parse({ query: { unreadOnly: 'false' } });
      expect(result.query.unreadOnly).toBe(false);
    });

    it('accepts a real boolean for unreadOnly unchanged', () => {
      const result = getNotificationsSchema.parse({ query: { unreadOnly: true } });
      expect(result.query.unreadOnly).toBe(true);
    });
  });

  describe('notificationIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = notificationIdSchema.parse({ params: { id: 'notif-1' } });
      expect(result.params.id).toBe('notif-1');
    });

    it('rejects an empty id', () => {
      expect(() => notificationIdSchema.parse({ params: { id: '' } })).toThrow();
    });

    it('rejects a missing id', () => {
      expect(() => notificationIdSchema.parse({ params: {} })).toThrow();
    });
  });

  describe('broadcastNotificationSchema', () => {
    it('accepts a valid broadcast body', () => {
      const result = broadcastNotificationSchema.parse({
        body: { userIds: ['u1', 'u2'], title: 'عرض خاص', body: 'خصم 20% اليوم فقط' },
      });
      expect(result.body.userIds).toEqual(['u1', 'u2']);
      expect(result.body.allUsers).toBeUndefined();
    });

    it('accepts an optional allUsers flag', () => {
      const result = broadcastNotificationSchema.parse({
        body: { userIds: ['placeholder'], allUsers: true, title: 'عرض', body: 'نص' },
      });
      expect(result.body.allUsers).toBe(true);
    });

    it('rejects an empty userIds array', () => {
      expect(() =>
        broadcastNotificationSchema.parse({ body: { userIds: [], title: 'عرض', body: 'نص' } })
      ).toThrow();
    });

    it('rejects userIds over the 10,000 cap', () => {
      expect(() =>
        broadcastNotificationSchema.parse({
          body: { userIds: Array.from({ length: 10_001 }, (_, i) => `u${i}`), title: 'عرض', body: 'نص' },
        })
      ).toThrow();
    });

    it('rejects a missing title', () => {
      expect(() =>
        broadcastNotificationSchema.parse({ body: { userIds: ['u1'], body: 'نص' } })
      ).toThrow();
    });

    it('rejects a title over 200 characters', () => {
      expect(() =>
        broadcastNotificationSchema.parse({
          body: { userIds: ['u1'], title: 'x'.repeat(201), body: 'نص' },
        })
      ).toThrow();
    });

    it('rejects a body over 500 characters', () => {
      expect(() =>
        broadcastNotificationSchema.parse({
          body: { userIds: ['u1'], title: 'عنوان', body: 'x'.repeat(501) },
        })
      ).toThrow();
    });
  });

  describe('createPushSubscriptionSchema', () => {
    const validBody = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };

    it('accepts a valid subscription body matching PushSubscription.toJSON() shape', () => {
      const result = createPushSubscriptionSchema.parse({ body: validBody });
      expect(result.body.endpoint).toBe(validBody.endpoint);
      expect(result.body.keys).toEqual(validBody.keys);
    });

    it('rejects a non-URL endpoint', () => {
      expect(() =>
        createPushSubscriptionSchema.parse({ body: { ...validBody, endpoint: 'not-a-url' } })
      ).toThrow();
    });

    it('rejects an endpoint over 1000 characters', () => {
      expect(() =>
        createPushSubscriptionSchema.parse({
          body: { ...validBody, endpoint: `https://fcm.googleapis.com/${'a'.repeat(1000)}` },
        })
      ).toThrow();
    });

    it('rejects a missing keys object', () => {
      expect(() =>
        createPushSubscriptionSchema.parse({ body: { endpoint: validBody.endpoint } })
      ).toThrow();
    });

    it('rejects an empty p256dh key', () => {
      expect(() =>
        createPushSubscriptionSchema.parse({
          body: { ...validBody, keys: { ...validBody.keys, p256dh: '' } },
        })
      ).toThrow();
    });

    it('rejects an empty auth key', () => {
      expect(() =>
        createPushSubscriptionSchema.parse({
          body: { ...validBody, keys: { ...validBody.keys, auth: '' } },
        })
      ).toThrow();
    });
  });

  describe('deletePushSubscriptionSchema', () => {
    it('accepts a valid endpoint', () => {
      const result = deletePushSubscriptionSchema.parse({
        body: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' },
      });
      expect(result.body.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc123');
    });

    it('rejects a missing endpoint', () => {
      expect(() => deletePushSubscriptionSchema.parse({ body: {} })).toThrow();
    });

    it('rejects a non-URL endpoint', () => {
      expect(() =>
        deletePushSubscriptionSchema.parse({ body: { endpoint: 'not-a-url' } })
      ).toThrow();
    });
  });
});
