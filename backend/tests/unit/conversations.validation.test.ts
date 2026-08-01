import {
  startConversationSchema,
  conversationIdSchema,
  getConversationsSchema,
  sendMessageSchema,
  getMessagesSchema,
} from '../../src/modules/conversations/conversations.validation';

describe('conversations.validation', () => {
  describe('startConversationSchema', () => {
    it('accepts a valid adId', () => {
      const result = startConversationSchema.parse({ body: { adId: 'ad-1' } });
      expect(result.body.adId).toBe('ad-1');
    });

    it('rejects a missing adId', () => {
      expect(() => startConversationSchema.parse({ body: {} })).toThrow();
    });

    it('rejects an empty adId', () => {
      expect(() => startConversationSchema.parse({ body: { adId: '' } })).toThrow();
    });
  });

  describe('conversationIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = conversationIdSchema.parse({ params: { id: 'conv-1' } });
      expect(result.params.id).toBe('conv-1');
    });

    it('rejects an empty id', () => {
      expect(() => conversationIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });

  describe('getConversationsSchema', () => {
    it('parses with no query params at all', () => {
      const result = getConversationsSchema.parse({ query: {} });
      expect(result.query.page).toBeUndefined();
      expect(result.query.limit).toBeUndefined();
    });

    it('coerces string page/limit query params to numbers', () => {
      const result = getConversationsSchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page below the minimum', () => {
      expect(() => getConversationsSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('rejects a limit above the maximum', () => {
      expect(() => getConversationsSchema.parse({ query: { limit: '101' } })).toThrow();
    });
  });

  describe('sendMessageSchema', () => {
    it('accepts a valid non-empty body', () => {
      const result = sendMessageSchema.parse({ params: { id: 'conv-1' }, body: { body: 'Hi there' } });
      expect(result.body.body).toBe('Hi there');
    });

    it('rejects an empty message body', () => {
      expect(() =>
        sendMessageSchema.parse({ params: { id: 'conv-1' }, body: { body: '' } })
      ).toThrow();
    });

    it('rejects a message body over 2000 characters', () => {
      expect(() =>
        sendMessageSchema.parse({ params: { id: 'conv-1' }, body: { body: 'x'.repeat(2001) } })
      ).toThrow();
    });

    it('accepts a message body at exactly the 2000 character boundary', () => {
      const result = sendMessageSchema.parse({
        params: { id: 'conv-1' },
        body: { body: 'x'.repeat(2000) },
      });
      expect(result.body.body).toHaveLength(2000);
    });

    it('rejects an empty conversation id param', () => {
      expect(() =>
        sendMessageSchema.parse({ params: { id: '' }, body: { body: 'Hi' } })
      ).toThrow();
    });
  });

  describe('getMessagesSchema', () => {
    it('parses with no query params at all', () => {
      const result = getMessagesSchema.parse({ params: { id: 'conv-1' }, query: {} });
      expect(result.query.page).toBeUndefined();
      expect(result.query.limit).toBeUndefined();
    });

    it('coerces string page/limit query params to numbers', () => {
      const result = getMessagesSchema.parse({
        params: { id: 'conv-1' },
        query: { page: '3', limit: '50' },
      });
      expect(result.query.page).toBe(3);
      expect(result.query.limit).toBe(50);
    });

    it('rejects a limit above the maximum', () => {
      expect(() =>
        getMessagesSchema.parse({ params: { id: 'conv-1' }, query: { limit: '101' } })
      ).toThrow();
    });

    it('rejects a missing conversation id param', () => {
      expect(() => getMessagesSchema.parse({ params: {}, query: {} })).toThrow();
    });
  });
});
