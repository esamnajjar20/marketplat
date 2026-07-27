import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestCategory } from '../helpers/category.helper';
import { env } from '../../src/config/env';

// FIX LOAD-TEST-01 regression setup: POST /ads now requires at least
// one image (ads.controller.ts's createAd) — that check runs BEFORE
// the active-ad-cap check in ads.service.ts, so without attaching a
// real file below, "rejects ad creation with 400 once at the cap"
// would still get a 400, but for the WRONG reason (missing image, not
// the cap), silently passing even if the cap check itself broke. Same
// Cloudinary mock pattern as ads.test.ts.
jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/test/image/upload/mock.webp',
    publicId: 'classifieds/ads/mock',
  }),
  deleteImage: jest.fn(),
}));

const TEST_IMAGE_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]);

describe('Ads API — extended coverage', () => {
  describe('GET /api/v1/ads/search', () => {
    it('searches ads by query string', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'UniqueSearchableItem XYZ' });

      const res = await request(app)
        .get('/api/v1/ads/search')
        .query({ q: 'UniqueSearchableItem' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when search query is missing', async () => {
      const res = await request(app).get('/api/v1/ads/search');
      expect(res.status).toBe(400);
    });

    // FIX PERF-01: the raw-SQL search branch (ads.repository.ts
    // findMany, search !== undefined) switched its city clause from
    // `city ILIKE '%value%'` to an exact `city = value` for the same
    // indexing reason as the non-search branch. Verify the combined
    // search+city filter still narrows correctly with an exact match
    // and correctly excludes a partial one.
    it('combines search with an exact city filter', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'GazaMarketSearchable laptop', city: 'غزة' });
      await createTestAd(user.id, { title: 'GazaMarketSearchable laptop', city: 'رفح' });

      const res = await request(app)
        .get('/api/v1/ads/search')
        .query({ q: 'GazaMarketSearchable', city: 'غزة' });

      expect(res.status).toBe(200);
      expect(res.body.data.every((a: any) => a.city === 'غزة')).toBe(true);
      expect(res.body.data.some((a: any) => a.city === 'رفح')).toBe(false);
    });

    /**
     * FIX H-1 (search-branch instance): ads.repository.ts's search
     * branch builds its ORDER BY as raw SQL and previously only
     * special-cased 'price', silently falling back to "createdAt" for
     * any other sortBy — including 'views' — with no error at all.
     * This is the more dangerous half of the bug: after allowing
     * sortBy=views through validation, a search request would have
     * returned 200 with results quietly sorted by the wrong column.
     */
    it('sorts search results by views descending (FIX H-1)', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'SortViewsSearchable low', views: 5 });
      await createTestAd(user.id, { title: 'SortViewsSearchable high', views: 500 });

      const res = await request(app)
        .get('/api/v1/ads/search')
        .query({ q: 'SortViewsSearchable', sortBy: 'views', sortOrder: 'desc' });

      expect(res.status).toBe(200);
      if (res.body.data.length >= 2) {
        expect(res.body.data[0].views).toBeGreaterThanOrEqual(res.body.data[1].views);
      }
    });
  });

  describe('GET /api/v1/ads/:id/related', () => {
    it('returns related ads', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const ad = await createTestAd(user.id, { categoryId: category.id });
      await createTestAd(user.id, { categoryId: category.id, title: 'Related Ad Item' });

      const res = await request(app).get(`/api/v1/ads/${ad.id}/related`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 404 for deleted ad', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      await request(app)
        .delete(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const res = await request(app).get(`/api/v1/ads/${ad.id}/related`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/ads — sorting & category filter', () => {
    it('sorts by price ascending', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { price: 500, title: 'Cheap Item' });
      await createTestAd(user.id, { price: 2000, title: 'Expensive Item' });

      const res = await request(app).get('/api/v1/ads').query({ sortBy: 'price', sortOrder: 'asc' });

      expect(res.status).toBe(200);
      if (res.body.data.length >= 2) {
        expect(Number(res.body.data[0].price)).toBeLessThanOrEqual(Number(res.body.data[1].price));
      }
    });

    it('filters by categoryId', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      await createTestAd(user.id, { categoryId: category.id });

      const res = await request(app).get('/api/v1/ads').query({ categoryId: category.id });

      expect(res.status).toBe(200);
      expect(res.body.data.every((a: { categoryId: string | null }) => a.categoryId === category.id)).toBe(true);
    });

    /**
     * FIX H-1: the frontend's "الأكثر مشاهدة" (Most Viewed) sort option
     * has always sent sortBy=views. getAdsSchema previously only
     * accepted createdAt/price, so this request failed with a 400 —
     * caught here on the non-search list path (Prisma's dynamic
     * `{ [sortBy]: sortOrder }` orderBy in ads.repository.ts).
     */
    it('sorts by views descending (FIX H-1)', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'Low Views Item', views: 5 });
      await createTestAd(user.id, { title: 'High Views Item', views: 500 });

      const res = await request(app).get('/api/v1/ads').query({ sortBy: 'views', sortOrder: 'desc' });

      expect(res.status).toBe(200);
      if (res.body.data.length >= 2) {
        expect(res.body.data[0].views).toBeGreaterThanOrEqual(res.body.data[1].views);
      }
    });
  });

  describe('DELETE /api/v1/ads/:id/images', () => {
    it('returns 400 when imageUrl is missing', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}/images`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when image not found in ad', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}/images`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ imageUrl: 'https://example.com/nonexistent.jpg' });

      expect(res.status).toBe(400);
    });
  });

  // FIX AUDIT-V5-01: previously there was no cap on active ads per user.
  // This exercises the real HTTP → controller → service → repository
  // path end-to-end (countActiveByUserId against the real DB), unlike
  // the mocked unit test in ads.service.test.ts.
  describe('POST /api/v1/ads — MAX_ADS_PER_USER cap', () => {
    it('rejects ad creation with 400 once the user is at the active-ad cap', async () => {
      const user = await createTestUser();

      // Seed the user up to exactly the cap using direct DB inserts —
      // far faster than going through the real (image-upload-backed)
      // creation endpoint env.ads.maxPerUser times.
      await Promise.all(
        Array.from({ length: env.ads.maxPerUser }, (_, i) =>
          createTestAd(user.id, { title: `Seed ad #${i}` })
        )
      );

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'الإعلان الذي يتجاوز الحد')
        .field('description', 'وصف هذا الإعلان يجب أن يُرفض لأن المستخدم وصل للحد الأقصى')
        .field('price', '100')
        .field('city', 'الرياض')
        .attach('images', TEST_IMAGE_BUFFER, { filename: 'item.png', contentType: 'image/png' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/الحد الأقصى/);
    });

    it('does NOT count SOLD or DELETED ads against the cap', async () => {
      const user = await createTestUser();

      // One seed ad at SOLD status and one at DELETED status — neither
      // should count toward the active cap, however high it's configured.
      const soldAd = await createTestAd(user.id, { title: 'Sold ad' });
      const deletedAd = await createTestAd(user.id, { title: 'Deleted ad' });

      const { prisma } = await import('../../src/config/prisma');
      await prisma.ad.update({ where: { id: soldAd.id }, data: { status: 'SOLD' } });
      await prisma.ad.update({ where: { id: deletedAd.id }, data: { status: 'DELETED' } });

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'إعلان جديد بعد البيع والحذف')
        .field('description', 'يجب أن يُقبل لأن الإعلانات السابقة ليست نشطة الآن')
        .field('price', '200')
        .field('city', 'الرياض')
        .attach('images', TEST_IMAGE_BUFFER, { filename: 'item.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
    });
  });
});
