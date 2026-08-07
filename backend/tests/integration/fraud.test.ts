import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';

// Same mock as ads.test.ts — POST /ads requires a real image upload
// path to exercise, but the actual Cloudinary round-trip is irrelevant
// to fraud scoring, which only reads back title/description/price/
// city/categoryId once the ad row is committed.
jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/test/image/upload/mock.webp',
    publicId: 'classifieds/ads/mock',
  }),
  deleteImage: jest.fn(),
}));

const TEST_IMAGE_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk start
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]);

describe('Fraud Detection API', () => {
  describe('GET /api/v1/admin/fraud/ads', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/admin/fraud/ads');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/admin/fraud/ads')
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('returns only ads flagged for review, highest risk first', async () => {
      const admin = await createTestAdmin();
      const seller = await createTestUser();

      const flaggedHigh = await createTestAd(seller.id, { title: 'Flagged high risk' });
      const flaggedLow = await createTestAd(seller.id, { title: 'Flagged low risk' });
      const unflagged = await createTestAd(seller.id, { title: 'Perfectly normal ad' });

      await prisma.ad.update({
        where: { id: flaggedHigh.id },
        data: { flaggedForReview: true, riskScore: 80 },
      });
      await prisma.ad.update({
        where: { id: flaggedLow.id },
        data: { flaggedForReview: true, riskScore: 30 },
      });

      const res = await request(app)
        .get('/api/v1/admin/fraud/ads')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((ad: { id: string }) => ad.id);
      expect(ids).toContain(flaggedHigh.id);
      expect(ids).toContain(flaggedLow.id);
      expect(ids).not.toContain(unflagged.id);
      // riskScore desc ordering
      expect(ids.indexOf(flaggedHigh.id)).toBeLessThan(ids.indexOf(flaggedLow.id));
    });
  });

  describe('POST /api/v1/admin/fraud/ads/:adId/flag', () => {
    it('rejects non-admin users', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);
      const res = await request(app)
        .post(`/api/v1/admin/fraud/ads/${ad.id}/flag`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ reason: 'Looks suspicious' });
      expect(res.status).toBe(403);
    });

    it('lets an admin manually flag an ad and records a MANUAL_ADMIN_FLAG signal', async () => {
      const admin = await createTestAdmin();
      const seller = await createTestUser();
      const ad = await createTestAd(seller.id);

      const res = await request(app)
        .post(`/api/v1/admin/fraud/ads/${ad.id}/flag`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'Reported by multiple users as a scam pattern', weight: 40 });

      expect(res.status).toBe(200);

      const updatedAd = await prisma.ad.findUnique({ where: { id: ad.id } });
      expect(updatedAd?.flaggedForReview).toBe(true);
      expect(updatedAd?.riskScore).toBeGreaterThanOrEqual(40);

      const signal = await prisma.fraudSignal.findFirst({
        where: { adId: ad.id, type: 'MANUAL_ADMIN_FLAG' },
      });
      expect(signal).toBeDefined();
      expect(signal?.weight).toBe(40);

      const auditEntry = await prisma.auditLog.findFirst({
        where: { event: 'ADMIN_FRAUD_MANUAL_FLAG', userId: admin.id },
      });
      expect(auditEntry).toBeDefined();
    });

    it('returns 404 for a non-existent ad', async () => {
      const admin = await createTestAdmin();
      const res = await request(app)
        .post('/api/v1/admin/fraud/ads/nonexistent-id/flag')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/fraud/ads/:adId/clear', () => {
    it('clears flaggedForReview without deleting historical signals', async () => {
      const admin = await createTestAdmin();
      const seller = await createTestUser();
      const ad = await createTestAd(seller.id);

      await prisma.ad.update({
        where: { id: ad.id },
        data: { flaggedForReview: true, riskScore: 70 },
      });
      await prisma.fraudSignal.create({
        data: { type: 'SUSPICIOUS_KEYWORDS', weight: 35, adId: ad.id, userId: seller.id },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/fraud/ads/${ad.id}/clear`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);

      const updatedAd = await prisma.ad.findUnique({ where: { id: ad.id } });
      expect(updatedAd?.flaggedForReview).toBe(false);

      const signalCount = await prisma.fraudSignal.count({ where: { adId: ad.id } });
      expect(signalCount).toBe(1);
    });
  });

  describe('GET /api/v1/admin/fraud/signals', () => {
    it('filters by type and reviewed status', async () => {
      const admin = await createTestAdmin();
      const seller = await createTestUser();
      const ad = await createTestAd(seller.id);

      await prisma.fraudSignal.create({
        data: { type: 'RAPID_POSTING', weight: 20, adId: ad.id, userId: seller.id },
      });
      await prisma.fraudSignal.create({
        data: {
          type: 'SUSPICIOUS_PRICE',
          weight: 30,
          adId: ad.id,
          userId: seller.id,
          reviewed: true,
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/fraud/signals')
        .query({ type: 'RAPID_POSTING' })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((s: { type: string }) => s.type === 'RAPID_POSTING')
      ).toBe(true);

      const reviewedRes = await request(app)
        .get('/api/v1/admin/fraud/signals')
        .query({ reviewed: 'true' })
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(reviewedRes.status).toBe(200);
      expect(
        reviewedRes.body.data.every((s: { reviewed: boolean }) => s.reviewed === true)
      ).toBe(true);
    });
  });

  describe('PATCH /api/v1/admin/fraud/signals/:id/review', () => {
    it('marks a signal reviewed and writes an audit log entry', async () => {
      const admin = await createTestAdmin();
      const seller = await createTestUser();
      const ad = await createTestAd(seller.id);

      const signal = await prisma.fraudSignal.create({
        data: { type: 'DUPLICATE_LISTING', weight: 20, adId: ad.id, userId: seller.id },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/fraud/signals/${signal.id}/review`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviewed).toBe(true);
      expect(res.body.data.reviewedBy).toBe(admin.id);

      const auditEntry = await prisma.auditLog.findFirst({
        where: { event: 'ADMIN_FRAUD_SIGNAL_REVIEWED', userId: admin.id },
      });
      expect(auditEntry).toBeDefined();
    });

    it('returns 404 for a non-existent signal', async () => {
      const admin = await createTestAdmin();
      const res = await request(app)
        .patch('/api/v1/admin/fraud/signals/nonexistent-id/review')
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('automatic scoring on ad creation', () => {
    it('flags rapid-fire ad creation from the same user (RAPID_POSTING)', async () => {
      const seller = await createTestUser();
      await createTestSellerProfile(seller.id);

      // env default: FRAUD_RAPID_POSTING_MAX_POSTS=5 within 60s — create
      // one more than that in quick succession via the real POST /ads
      // endpoint (fraud scoring only runs from ads.service.ts's
      // createAd, not from the createTestAd Prisma-direct helper used
      // elsewhere in this file), then give the fire-and-forget scoring
      // a moment to land before asserting.
      for (let i = 0; i < 7; i++) {
        const res = await request(app)
          .post('/api/v1/ads')
          .set('Authorization', `Bearer ${seller.accessToken}`)
          .field('title', `Rapid ad number ${i}`)
          .field('description', 'Ad description with enough characters to pass validation')
          .field('price', '100')
          .field('city', 'الرياض')
          .attach('images', TEST_IMAGE_BUFFER, { filename: 'a.png', contentType: 'image/png' });
        expect(res.status).toBe(201);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const signals = await prisma.fraudSignal.findMany({
        where: { userId: seller.id, type: 'RAPID_POSTING' },
      });
      expect(signals.length).toBeGreaterThan(0);
    });
  });
});
