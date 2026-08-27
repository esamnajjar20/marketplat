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

    // FEAT-CONV-DEDUP scenario 3/4: the same buyer contacting the same
    // seller about a *different* ad must land in the same conversation,
    // not a new one — this is the core bug the (buyerId, sellerId)
    // identity change exists to fix (previously adId was part of the
    // uniqueness key, so a second ad always created a second thread).
    it('reuses the same conversation across multiple different ads from the same seller', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const adOne = await createTestAd(seller.id, { title: 'Ad One' });
      const adTwo = await createTestAd(seller.id, { title: 'Ad Two' });
      const adThree = await createTestAd(seller.id, { title: 'Ad Three' });

      const first = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: adOne.id });
      const second = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: adTwo.id });
      const third = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: adThree.id });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(third.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(third.body.data.id).toBe(first.body.data.id);

      // Exactly one conversation for the pair, not three.
      const list = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`);
      const forThisSeller = list.body.data.filter(
        (c: { buyer: { id: string }; seller: { id: string } }) =>
          c.buyer.id === buyer.id && c.seller.id === seller.id
      );
      expect(forThisSeller).toHaveLength(1);
    });

    // FEAT-CONV-DEDUP: reversed direction — A messaging B's ad, then B
    // separately messaging A's ad, must resolve to one conversation
    // between the pair, not two (one per direction). This is the
    // symmetry findByUserPair's OR-both-orderings lookup exists for.
    it('reuses the same conversation when the two users message each other in opposite directions', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const adOwnedByB = await createTestAd(userB.id, { title: 'Owned by B' });
      const adOwnedByA = await createTestAd(userA.id, { title: 'Owned by A' });

      const aToB = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ adId: adOwnedByB.id });
      expect(aToB.status).toBe(201);

      const bToA = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send({ adId: adOwnedByA.id });
      expect(bToA.status).toBe(201);

      expect(bToA.body.data.id).toBe(aToB.body.data.id);
    });

    // FEAT-CONV-DEDUP scenario 9: concurrent requests for the same pair
    // must not create two rows. The DB's @@unique([buyerId, sellerId])
    // plus conversationsRepository.findOrCreate's P2002-then-refetch
    // handling is what's under test here, not just the app-level
    // findFirst-then-create a single request takes.
    it('does not create duplicate conversations under concurrent requests for the same pair', async () => {
      const seller = await createTestUser();
      const buyer = await createTestUser();
      const ad = await createTestAd(seller.id);

      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/v1/conversations')
          .set('Authorization', `Bearer ${buyer.accessToken}`)
          .send({ adId: ad.id }),
        request(app)
          .post('/api/v1/conversations')
          .set('Authorization', `Bearer ${buyer.accessToken}`)
          .send({ adId: ad.id }),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      expect(resA.body.data.id).toBe(resB.body.data.id);
    });

    it('starts (and reuses) a conversation directly with a user via userId, with no ad', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();

      const first = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ userId: userB.id });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ userId: userB.id });
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
    });

    // Different sellers must never collapse into one conversation —
    // dedup is scoped to the exact (buyer, seller) pair.
    it('creates separate conversations for the same buyer with two different sellers', async () => {
      const sellerOne = await createTestUser();
      const sellerTwo = await createTestUser();
      const buyer = await createTestUser();
      const adOne = await createTestAd(sellerOne.id);
      const adTwo = await createTestAd(sellerTwo.id);

      const first = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: adOne.id });
      const second = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ adId: adTwo.id });

      expect(first.body.data.id).not.toBe(second.body.data.id);
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

    it('forbids a third party from sending a message into a conversation they are not a party to', async () => {
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
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ body: 'مرحبا' });

      expect(res.status).toBe(403);
    });

    // Security requirement: senderId always comes from the authenticated
    // session, never the request body — a spoofed senderId in the body
    // must be ignored, not used to attribute the message to someone else.
    it('ignores a spoofed senderId in the request body and attributes the message to the authenticated caller', async () => {
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
        .send({ body: 'مرحبا', senderId: seller.id });

      expect(res.status).toBe(201);
      expect(res.body.data.senderId).toBe(buyer.id);
      expect(res.body.data.senderId).not.toBe(seller.id);
    });
  });
});
