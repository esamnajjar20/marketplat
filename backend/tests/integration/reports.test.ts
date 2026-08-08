import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';

describe('Reports API', () => {
  describe('POST /api/v1/reports/ads/:adId', () => {
    it('creates a report for another users ad', async () => {
      const owner = await createTestUser();
      const reporter = await createTestUser();
      const ad = await createTestAd(owner.id);

      const res = await request(app)
        .post(`/api/v1/reports/ads/${ad.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'SCAM', notes: 'Suspicious listing' });

      expect(res.status).toBe(201);
      expect(res.body.data.reason).toBe('SCAM');
    });

    it('returns 400 when reporting own ad', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .post(`/api/v1/reports/ads/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/own ad/i);
    });

    it('returns 400 for duplicate report', async () => {
      const owner = await createTestUser();
      const reporter = await createTestUser();
      const ad = await createTestAd(owner.id);

      await request(app)
        .post(`/api/v1/reports/ads/${ad.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'FAKE' });

      const res = await request(app)
        .post(`/api/v1/reports/ads/${ad.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'FAKE' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already reported/i);
    });

    it('returns 400 for invalid reason', async () => {
      const owner = await createTestUser();
      const reporter = await createTestUser();
      const ad = await createTestAd(owner.id);

      const res = await request(app)
        .post(`/api/v1/reports/ads/${ad.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'INVALID_REASON' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/reports/ads/some-id')
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(401);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('POST /api/v1/reports/users/:targetId', () => {
    it('creates a report against another user', async () => {
      const target = await createTestUser();
      const reporter = await createTestUser();

      const res = await request(app)
        .post(`/api/v1/reports/users/${target.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'OFFENSIVE', notes: 'Sent abusive messages' });

      expect(res.status).toBe(201);
      expect(res.body.data.reason).toBe('OFFENSIVE');
      expect(res.body.data.targetType).toBe('USER');
      expect(res.body.data.targetId).toBe(target.id);
    });

    it('returns 400 when reporting yourself', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post(`/api/v1/reports/users/${user.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/own user/i);
    });

    it('returns 400 for duplicate report against the same user', async () => {
      const target = await createTestUser();
      const reporter = await createTestUser();

      await request(app)
        .post(`/api/v1/reports/users/${target.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'SCAM' });

      const res = await request(app)
        .post(`/api/v1/reports/users/${target.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'SCAM' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already reported/i);
    });

    it('returns 404 for a non-existent user', async () => {
      const reporter = await createTestUser();

      const res = await request(app)
        .post('/api/v1/reports/users/non-existent-id')
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(404);
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/reports/users/some-id')
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(401);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('POST /api/v1/reports/stores/:targetId', () => {
    it('creates a report against a store', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id);
      const reporter = await createTestUser();

      const res = await request(app)
        .post(`/api/v1/reports/stores/${store.id}`)
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'FAKE', notes: 'Selling counterfeit goods' });

      expect(res.status).toBe(201);
      expect(res.body.data.targetType).toBe('STORE');
      expect(res.body.data.targetId).toBe(store.id);
    });

    it('returns 400 when the store owner reports their own store', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id);

      const res = await request(app)
        .post(`/api/v1/reports/stores/${store.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/own store/i);
    });

    it('returns 404 for a non-existent store', async () => {
      const reporter = await createTestUser();

      const res = await request(app)
        .post('/api/v1/reports/stores/non-existent-id')
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(404);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('POST /api/v1/reports/:targetType/:targetId — invalid target', () => {
    it('returns 400 for an unsupported target type', async () => {
      const reporter = await createTestUser();

      const res = await request(app)
        .post('/api/v1/reports/products/some-id')
        .set('Authorization', `Bearer ${reporter.accessToken}`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(400);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('GET /api/v1/reports/me', () => {
    it("returns only the caller's own submitted reports", async () => {
      const owner = await createTestUser();
      const reporterA = await createTestUser();
      const reporterB = await createTestUser();
      const ad = await createTestAd(owner.id);

      await request(app)
        .post(`/api/v1/reports/ads/${ad.id}`)
        .set('Authorization', `Bearer ${reporterA.accessToken}`)
        .send({ reason: 'SCAM' });
      await request(app)
        .post(`/api/v1/reports/users/${owner.id}`)
        .set('Authorization', `Bearer ${reporterB.accessToken}`)
        .send({ reason: 'SPAM' });

      const res = await request(app)
        .get('/api/v1/reports/me')
        .set('Authorization', `Bearer ${reporterA.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].reason).toBe('SCAM');
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/reports/me');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/reports (admin)', () => {
    it('returns reports list for admin', async () => {
      const admin = await createTestAdmin();
      const owner = await createTestUser();
      const reporter = await createTestUser();
      const ad = await createTestAd(owner.id);

      await prisma.report.create({
        data: { userId: reporter.id, adId: ad.id, reason: 'SPAM' },
      });

      const res = await request(app)
        .get('/api/v1/reports')
        .query({ page: '1', limit: '20' })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.pagination).toBeDefined();
    });
  });

  describe('GET /api/v1/reports/:id (admin)', () => {
    it('returns report by id', async () => {
      const admin = await createTestAdmin();
      const owner = await createTestUser();
      const reporter = await createTestUser();
      const ad = await createTestAd(owner.id);

      const report = await prisma.report.create({
        data: { userId: reporter.id, adId: ad.id, reason: 'OFFENSIVE' },
      });

      const res = await request(app)
        .get(`/api/v1/reports/${report.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(report.id);
    });

    it('returns 404 for non-existent report', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .get('/api/v1/reports/non-existent-id')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/reports/:id/status (admin)', () => {
    it('updates report status', async () => {
      const admin = await createTestAdmin();
      const owner = await createTestUser();
      const reporter = await createTestUser();
      const ad = await createTestAd(owner.id);

      const report = await prisma.report.create({
        data: { userId: reporter.id, adId: ad.id, reason: 'SCAM' },
      });

      const res = await request(app)
        .patch(`/api/v1/reports/${report.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'RESOLVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
    });

    it('returns 400 for invalid status', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/reports/fake-id/status')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'INVALID' });

      expect(res.status).toBe(400);
    });
  });
});
