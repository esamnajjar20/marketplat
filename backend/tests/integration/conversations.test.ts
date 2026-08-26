/**
 * Integration coverage for /api/v1/conversations (Phase 2 / P1).
 *
 * Unit tests cover service-level Forbidden/NotFound branches; this file
 * exercises the authenticated HTTP path: start from ad, list, send,
 * read messages, and auth gates.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('Conversations API', () => {
  describe('auth gates', () => {
    it('rejects unauthenticated list', async () => {
      const res = await request(app).get('/api/v1/conversations');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated start', async () => {
      const res = await request(app).post('/api/v1/conversations').send({ adId: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/conversations', () => {
    it('starts a conversation from an ad and returns 201', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const ad = await createTestAd(seller.id);

      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: ad.id });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.adId ?? res.body.data.ad?.id).toBeTruthy();
    });

    it('reuses the same conversation on a second start for the same ad', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const ad = await createTestAd(seller.id);

      const first = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: ad.id });
      const second = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: ad.id });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
    });

    it('returns 404 for a non-existent ad', async () => {
      const buyer = await createTestUser();
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(404);
    });

    it('rejects body with neither adId nor userId', async () => {
      const buyer = await createTestUser();
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('messages flow', () => {
    it('lists conversations, sends a message, and reads it back', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const ad = await createTestAd(seller.id);

      const start = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: ad.id });
      expect(start.status).toBe(201);
      const conversationId = start.body.data.id as string;

      const list = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`);
      expect(list.status).toBe(200);
      const items = list.body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.some((c: { id: string }) => c.id === conversationId)).toBe(true);

      const send = await request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ body: 'مرحبا، هل الإعلان متاح؟' });
      expect(send.status).toBe(201);
      expect(send.body.data.body).toContain('مرحبا');

      const messages = await request(app)
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${buyer.accessToken}`);
      expect(messages.status).toBe(200);
      const msgs = messages.body.data;
      expect(Array.isArray(msgs)).toBe(true);
      expect(msgs.some((m: { body: string }) => m.body?.includes('مرحبا'))).toBe(true);
    });

    it('rejects empty message body', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const ad = await createTestAd(seller.id);

      const start = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: ad.id });
      const conversationId = start.body.data.id as string;

      const res = await request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ body: '' });

      expect(res.status).toBe(400);
    });

    it('forbids a third party from reading messages', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const stranger = await createTestUser();
      const ad = await createTestAd(seller.id);

      const start = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: ad.id });
      const conversationId = start.body.data.id as string;

      const res = await request(app)
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${stranger.accessToken}`);

      expect(res.status).toBe(403);
    });
  });
});
