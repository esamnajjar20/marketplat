import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

// FIX LOAD-TEST-01 regression setup: POST /ads now requires at least
// one image (see ads.controller.ts's createAd — previously only
// addImages checked files.length === 0). Every "creates an ad..." test
// below now attaches a real in-memory image via .attach() so it
// exercises that real requirement, rather than relying on the old gap
// where zero images was silently accepted. uploadImage is mocked here
// (same pattern as ads.service.test.ts) so these still don't make a
// real network call to Cloudinary — only the multer/validation layer
// under test actually needs a real file; what happens to it afterward
// doesn't.
jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/test/image/upload/mock.webp',
    publicId: 'classifieds/ads/mock',
  }),
  deleteImage: jest.fn(),
}));

// Minimal valid PNG bytes (matches the same magic-byte signature
// fileSignature.ts's real content check requires) — see
// e2e/fixtures/test-image.png in marketplace-v10 for the frontend-side
// equivalent used by Playwright; kept independent here since these are
// different test suites in different repos with no reason to share a
// binary fixture across them.
const TEST_IMAGE_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk start
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]);

// T-04: each describe gets its own user — no shared let variables between suites
describe('Ads API', () => {

  describe('GET /api/v1/ads', () => {
    it('returns paginated ads with correct shape', async () => {
      const user = await createTestUser();
      await createTestAd(user.id);

      const res = await request(app).get('/api/v1/ads');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // T-06: pagination is at res.body.meta.pagination (not res.body.pagination)
      expect(res.body.meta?.pagination).toBeDefined();
      expect(res.body.meta.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('filters by city', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { city: 'جدة' });
      await createTestAd(user.id, { city: 'الرياض' });

      const res = await request(app).get('/api/v1/ads').query({ city: 'جدة' });

      expect(res.status).toBe(200);
      expect(res.body.data.every((a: any) => a.city.includes('جدة'))).toBe(true);
    });

    // FIX PERF-01: city filtering switched from `contains` (ILIKE
    // '%value%', which can't use the [status, city] index) to an exact
    // match, since the frontend only ever sends one of a fixed list of
    // city names. This pins down that a *partial* city string no
    // longer matches — e.g. searching "جد" must not incorrectly return
    // ads in "جدة" the way a substring match would have.
    it('does not partial-match city — only an exact city name returns results', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { city: 'جدة' });

      const res = await request(app).get('/api/v1/ads').query({ city: 'جد' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('filters by price range', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { price: 500 });

      const res = await request(app).get('/api/v1/ads?minPrice=100&maxPrice=1000');

      expect(res.status).toBe(200);
      expect(res.body.data.every((a: any) => a.price <= 1000)).toBe(true);
    });

    it('respects pagination limit', async () => {
      const user = await createTestUser();
      await Promise.all([
        createTestAd(user.id, { title: 'Ad 1' }),
        createTestAd(user.id, { title: 'Ad 2' }),
        createTestAd(user.id, { title: 'Ad 3' }),
      ]);

      const res = await request(app).get('/api/v1/ads?limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('POST /api/v1/ads', () => {
    it('creates an ad when authenticated', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'iPhone 14 Pro للبيع')
        .field('description', 'جهاز بحالة ممتازة استخدام ستة أشهر فقط')
        .field('price', '3500')
        .field('city', 'الرياض')
        .attach('images', TEST_IMAGE_BUFFER, { filename: 'phone.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('iPhone 14 Pro للبيع');
      expect(res.body.data.userId).toBe(user.id);
      expect(Array.isArray(res.body.data.images)).toBe(true);
      expect(res.body.data.images.length).toBeGreaterThanOrEqual(1);
    });

    // FIX INTEG-05 — critical regression coverage. The test above uses
    // supertest's .send() (plain JSON body), which is NOT what the real
    // frontend sends: adsApi.create (ads.api.ts) always builds a
    // multipart/form-data FormData (required for the image files), and
    // multer puts every non-file field into req.body as a raw string.
    // Under that real content type, isNegotiable arrives as the literal
    // string "true"/"false" — .send() never exercised that path at all,
    // which is exactly how this bug (every real ad creation failing
    // with a 400) went undetected. .field() below reproduces the real
    // multipart encoding supertest offers.
    it('creates an ad via real multipart/form-data with isNegotiable="true" (string, as the frontend sends it)', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'سيارة للبيع قابلة للتفاوض')
        .field('description', 'سيارة بحالة جيدة جداً وقابلة للتفاوض على السعر')
        .field('price', '15000')
        .field('city', 'غزة')
        .field('isNegotiable', 'true')
        .attach('images', TEST_IMAGE_BUFFER, { filename: 'car.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.data.isNegotiable).toBe(true);
    });

    it('creates an ad via multipart/form-data with isNegotiable="false" (string "false" must NOT coerce to true)', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'سيارة للبيع بسعر ثابت')
        .field('description', 'سيارة بحالة جيدة جداً بسعر نهائي غير قابل للتفاوض')
        .field('price', '15000')
        .field('city', 'غزة')
        .field('isNegotiable', 'false')
        .attach('images', TEST_IMAGE_BUFFER, { filename: 'car.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      // The exact regression this guards against: z.coerce.boolean()
      // would have made this true (any non-empty string is truthy).
      expect(res.body.data.isNegotiable).toBe(false);
    });

    it('defaults isNegotiable to false via multipart/form-data when the field is omitted entirely', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'إعلان بدون تحديد قابلية التفاوض')
        .field('description', 'وصف الإعلان يجب أن يكون طويلاً بما فيه الكفاية للمرور')
        .field('price', '100')
        .field('city', 'غزة')
        .attach('images', TEST_IMAGE_BUFFER, { filename: 'item.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.data.isNegotiable).toBe(false);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/ads')
        .send({ title: 'x' });
      expect(res.status).toBe(401);
    });

    it('rejects short title with 400', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ title: 'ab', description: 'short', city: 'الرياض' });

      expect(res.status).toBe(400);
    });

    // FIX LOAD-TEST-01 regression coverage: this was a real gap found
    // while building load-test scripts that hit this endpoint directly
    // (bypassing AdForm.tsx's client-side "at least one image" check
    // entirely, the way any non-browser API client — a load test, a
    // script, or a malicious actor — naturally would).
    it('rejects a request with valid fields but zero attached images with 400', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'إعلان بدون أي صور مرفقة')
        .field('description', 'وصف صالح بطول كافٍ لتجاوز الحد الأدنى المطلوب هنا')
        .field('price', '100')
        .field('city', 'غزة');
      // Deliberately no .attach() call — zero images.

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/image/i);
    });
  });

  describe('GET /api/v1/ads/:id', () => {
    it('returns ad by id', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app).get(`/api/v1/ads/${ad.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ad.id);
      expect(res.body.data.title).toBe(ad.title);
    });

    it('increments views on fetch', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      await request(app).get(`/api/v1/ads/${ad.id}`);
      const updated = await prisma.ad.findUnique({ where: { id: ad.id } });

      expect(updated?.views).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent ad', async () => {
      const res = await request(app).get('/api/v1/ads/nonexistentid');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/ads/me', () => {
    it('returns only authenticated user ads', async () => {
      const user = await createTestUser();
      const other = await createTestUser();
      await createTestAd(user.id, { title: 'My Ad' });
      await createTestAd(other.id, { title: 'Other Ad' });

      const res = await request(app)
        .get('/api/v1/ads/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((a: any) => a.user.id === user.id)).toBe(true);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/ads/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/ads/:id', () => {
    it('updates own ad', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .patch(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Title');
    });

    it('returns 403 when updating another user\'s ad', async () => {
      const owner = await createTestUser();
      const attacker = await createTestUser();
      const ad = await createTestAd(owner.id);

      const res = await request(app)
        .patch(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .send({ title: 'Hacked' });

      expect(res.status).toBe(403);
    });

    it('allows admin to update any ad', async () => {
      const owner = await createTestUser();
      const admin = await createTestAdmin();
      const ad = await createTestAd(owner.id);

      const res = await request(app)
        .patch(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'Admin Updated' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/v1/ads/:id', () => {
    it('soft-deletes own ad', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const inDb = await prisma.ad.findUnique({ where: { id: ad.id } });
      expect(inDb?.status).toBe('DELETED');
    });

    it('returns 403 when deleting another user\'s ad', async () => {
      const owner = await createTestUser();
      const attacker = await createTestUser();
      const ad = await createTestAd(owner.id);

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for already-deleted ad', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);
      await prisma.ad.update({ where: { id: ad.id }, data: { status: 'DELETED' } });

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(404);
    });
  });
});
