import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

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
