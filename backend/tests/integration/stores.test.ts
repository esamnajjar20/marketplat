import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';

const validStoreBody = {
  name: 'My Local Shop',
  description: 'We sell great local products at fair prices',
  city: 'غزة',
  phone: '0599111222',
};

describe('Stores API', () => {
  describe('POST /api/v1/stores', () => {
    it('creates a store for a user with a seller profile', async () => {
      const user = await createTestUser();
      await createTestSellerProfile(user.id);

      const res = await request(app)
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(validStoreBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(validStoreBody.name);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('returns 400 when the user has no seller profile', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(validStoreBody);

      expect(res.status).toBe(400);
    });

    it('returns 403 when the seller profile is suspended', async () => {
      const user = await createTestUser();
      await createTestSellerProfile(user.id, { suspended: true });

      const res = await request(app)
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(validStoreBody);

      expect(res.status).toBe(403);
    });

    it('returns 409 when the seller already has a store', async () => {
      const user = await createTestUser();
      const sellerProfile = await createTestSellerProfile(user.id);
      await createTestStore(sellerProfile.id);

      const res = await request(app)
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(validStoreBody);

      expect(res.status).toBe(409);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).post('/api/v1/stores').send(validStoreBody);
      expect(res.status).toBe(401);
    });

    it('returns 400 for an invalid body (description too short)', async () => {
      const user = await createTestUser();
      await createTestSellerProfile(user.id);

      const res = await request(app)
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ ...validStoreBody, description: 'short' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/stores/me', () => {
    it('returns the current user store', async () => {
      const user = await createTestUser();
      const sellerProfile = await createTestSellerProfile(user.id);
      const store = await createTestStore(sellerProfile.id);

      const res = await request(app)
        .get('/api/v1/stores/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(store.id);
    });

    it('returns 404 when the user has no store', async () => {
      const user = await createTestUser();
      await createTestSellerProfile(user.id);

      const res = await request(app)
        .get('/api/v1/stores/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/stores/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/stores/me', () => {
    it('updates the current user store', async () => {
      const user = await createTestUser();
      const sellerProfile = await createTestSellerProfile(user.id);
      await createTestStore(sellerProfile.id);

      const res = await request(app)
        .patch('/api/v1/stores/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Renamed Shop' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed Shop');
    });

    it('returns 400 when the user has no store yet', async () => {
      const user = await createTestUser();
      await createTestSellerProfile(user.id);

      const res = await request(app)
        .patch('/api/v1/stores/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Renamed Shop' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).patch('/api/v1/stores/me').send({ name: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/stores/:id', () => {
    it('returns the public store with follower/product counts', async () => {
      const user = await createTestUser();
      const sellerProfile = await createTestSellerProfile(user.id);
      const store = await createTestStore(sellerProfile.id);

      const res = await request(app).get(`/api/v1/stores/${store.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(store.id);
      expect(res.body.data._count).toBeDefined();
    });

    it('returns 404 for a non-existent store', async () => {
      const res = await request(app).get('/api/v1/stores/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/stores', () => {
    it('returns only ACTIVE stores publicly', async () => {
      const activeOwner = await createTestUser();
      const activeSellerProfile = await createTestSellerProfile(activeOwner.id);
      const activeStore = await createTestStore(activeSellerProfile.id, {
        name: `Active Store ${Date.now()}`,
        status: 'ACTIVE',
      });

      const pendingOwner = await createTestUser();
      const pendingSellerProfile = await createTestSellerProfile(pendingOwner.id);
      await createTestStore(pendingSellerProfile.id, {
        name: `Pending Store ${Date.now()}`,
        status: 'PENDING',
      });

      const res = await request(app).get('/api/v1/stores');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const ids = res.body.data.map((s: any) => s.id);
      expect(ids).toContain(activeStore.id);
    });

    it('filters by city', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const uniqueCity = `city-${Date.now()}`;
      const store = await createTestStore(sellerProfile.id, { city: uniqueCity, status: 'ACTIVE' });

      const res = await request(app).get('/api/v1/stores').query({ city: uniqueCity });

      expect(res.status).toBe(200);
      expect(res.body.data.every((s: any) => s.city === uniqueCity)).toBe(true);
      expect(res.body.data.map((s: any) => s.id)).toContain(store.id);
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/v1/stores').query({ page: 1, limit: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.meta.pagination).toBeDefined();
    });
  });

  describe('PATCH /api/v1/stores/:id/status', () => {
    it('allows an admin to approve a PENDING store', async () => {
      const admin = await createTestAdmin();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'PENDING' });

      const res = await request(app)
        .patch(`/api/v1/stores/${store.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('returns 403 for a regular user', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'PENDING' });

      const res = await request(app)
        .patch(`/api/v1/stores/${store.id}/status`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(403);
    });

    it('returns 401 without a token', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'PENDING' });

      const res = await request(app)
        .patch(`/api/v1/stores/${store.id}/status`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(401);
    });

    it('returns 404 for a non-existent store', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/stores/non-existent-id/status')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid status value', async () => {
      const admin = await createTestAdmin();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'PENDING' });

      const res = await request(app)
        .patch(`/api/v1/stores/${store.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'CLOSED' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/stores/:id/follow', () => {
    it('follows an ACTIVE store', async () => {
      const follower = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/follow`)
        .set('Authorization', `Bearer ${follower.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.action).toBe('followed');
    });

    it('unfollows on the second call (toggle)', async () => {
      const follower = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      await request(app)
        .post(`/api/v1/stores/${store.id}/follow`)
        .set('Authorization', `Bearer ${follower.accessToken}`);

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/follow`)
        .set('Authorization', `Bearer ${follower.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.action).toBe('unfollowed');
    });

    it('returns 403 when trying to follow your own store', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/follow`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-ACTIVE store', async () => {
      const follower = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'PENDING' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/follow`)
        .set('Authorization', `Bearer ${follower.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without a token', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app).post(`/api/v1/stores/${store.id}/follow`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/stores/me/followed', () => {
    it('returns the stores followed by the current user', async () => {
      const follower = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      await request(app)
        .post(`/api/v1/stores/${store.id}/follow`)
        .set('Authorization', `Bearer ${follower.accessToken}`);

      const res = await request(app)
        .get('/api/v1/stores/me/followed')
        .set('Authorization', `Bearer ${follower.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((f: any) => f.storeId === store.id)).toBe(true);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/stores/me/followed');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/stores/:id/reviews', () => {
    it('creates a review for an ACTIVE store', async () => {
      const rater = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .set('Authorization', `Bearer ${rater.accessToken}`)
        .send({ score: 5, comment: 'Excellent service' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('returns 409 for a duplicate review from the same user', async () => {
      const rater = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .set('Authorization', `Bearer ${rater.accessToken}`)
        .send({ score: 4 });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .set('Authorization', `Bearer ${rater.accessToken}`)
        .send({ score: 2 });

      expect(res.status).toBe(409);
    });

    it('returns 403 when reviewing your own store', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ score: 5 });

      expect(res.status).toBe(403);
    });

    it('returns 400 for a score out of range', async () => {
      const rater = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .set('Authorization', `Bearer ${rater.accessToken}`)
        .send({ score: 10 });

      expect(res.status).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .send({ score: 5 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/stores/:id/reviews', () => {
    it('returns reviews for a store', async () => {
      const rater = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { status: 'ACTIVE' });

      await request(app)
        .post(`/api/v1/stores/${store.id}/reviews`)
        .set('Authorization', `Bearer ${rater.accessToken}`)
        .send({ score: 5, comment: 'Nice' });

      const res = await request(app).get(`/api/v1/stores/${store.id}/reviews`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for a non-existent store', async () => {
      const res = await request(app).get('/api/v1/stores/non-existent-id/reviews');
      expect(res.status).toBe(404);
    });
  });
});
