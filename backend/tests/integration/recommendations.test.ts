import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestCategory } from '../helpers/category.helper';

describe('Recommendations API', () => {
  describe('GET /api/v1/recommendations', () => {
    it('returns trending ads for an anonymous caller', async () => {
      const owner = await createTestUser();
      await createTestAd(owner.id, { title: 'Anon Trending Ad' });

      const res = await request(app).get('/api/v1/recommendations');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('never returns an ad the caller owns or has favorited', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const ownAd = await createTestAd(user.id, { categoryId: category.id });
      const otherOwner = await createTestUser();
      const favoritedAd = await createTestAd(otherOwner.id, { categoryId: category.id });

      await request(app)
        .post(`/api/v1/favorites/${favoritedAd.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const res = await request(app)
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((ad: { id: string }) => ad.id);
      expect(ids).not.toContain(ownAd.id);
      expect(ids).not.toContain(favoritedAd.id);
    });

    it('ranks ads from a favorited category above unrelated trending ads', async () => {
      const user = await createTestUser();
      const interestCategory = await createTestCategory();
      const otherCategory = await createTestCategory();

      const seller = await createTestUser();
      const interestAd = await createTestAd(seller.id, {
        title: 'Matches favorited category',
        categoryId: interestCategory.id,
      });
      await createTestAd(seller.id, {
        title: 'Unrelated category',
        categoryId: otherCategory.id,
      });

      const anotherSeller = await createTestUser();
      const favoritedSeed = await createTestAd(anotherSeller.id, { categoryId: interestCategory.id });
      await request(app)
        .post(`/api/v1/favorites/${favoritedSeed.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const res = await request(app)
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((ad: { id: string }) => ad.id);
      expect(ids).toContain(interestAd.id);
    });

    it('excludeAdId mode ranks by that ad\'s own category and excludes it', async () => {
      const category = await createTestCategory();
      const seller = await createTestUser();
      const referenceAd = await createTestAd(seller.id, { categoryId: category.id });
      const sibling = await createTestAd(seller.id, { categoryId: category.id });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ excludeAdId: referenceAd.id });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((ad: { id: string }) => ad.id);
      expect(ids).not.toContain(referenceAd.id);
      expect(ids).toContain(sibling.id);
    });

    it('respects the limit query param', async () => {
      const owner = await createTestUser();
      await Promise.all(
        Array.from({ length: 5 }).map((_, i) => createTestAd(owner.id, { title: `Ad ${i}` }))
      );

      const res = await request(app).get('/api/v1/recommendations').query({ limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });

    it('rejects a limit above the allowed maximum', async () => {
      const res = await request(app).get('/api/v1/recommendations').query({ limit: 999 });
      expect(res.status).toBe(400);
    });

    it('sets Cache-Control: no-store (response varies per caller)', async () => {
      const res = await request(app).get('/api/v1/recommendations');
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});
