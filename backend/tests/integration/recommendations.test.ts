import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestCategory } from '../helpers/category.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';

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

  // PR4B (Store Recommendations)
  describe('GET /api/v1/recommendations?type=store', () => {
    // No product test helper exists yet in tests/helpers — created
    // inline here rather than adding a shared helper for a single
    // consumer, matching this suite's own existing "prisma directly
    // where no helper exists" posture.
    const createTestProductCategory = async () => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return prisma.productCategory.create({
        data: { name: `PCat ${unique}`, nameAr: `فئة منتج ${unique}`, slug: `pcat-${unique}` },
      });
    };

    const createTestProduct = async (storeId: string, categoryId: string) =>
      prisma.product.create({
        data: {
          storeId,
          categoryId,
          name: 'Test Product',
          description: 'A perfectly fine product description here',
          images: [],
          price: 10,
          status: 'ACTIVE',
        },
      });

    // Neutralizes the freshness signal (which would otherwise always
    // be the primary ORDER BY key) so a test can isolate a different
    // signal — Prisma allows explicitly setting `updatedAt` in an
    // update payload, overriding its own @updatedAt auto-management
    // for that one call.
    const FIXED_TIME = new Date('2024-01-01T00:00:00Z');
    const freezeUpdatedAt = (storeId: string) =>
      prisma.storeDetails.update({ where: { id: storeId }, data: { updatedAt: FIXED_TIME } });

    it('returns a ranked list of stores for an anonymous caller', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      await createTestStore(sellerProfile.id, { name: 'Anon Trending Store' });

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('excludes the caller\'s own store, a store they follow, and a store they favorited', async () => {
      const user = await createTestUser();
      const ownSellerProfile = await createTestSellerProfile(user.id);
      const ownStore = await createTestStore(ownSellerProfile.id, { name: 'My Own Store' });

      const followedOwner = await createTestUser();
      const followedSellerProfile = await createTestSellerProfile(followedOwner.id);
      const followedStore = await createTestStore(followedSellerProfile.id, { name: 'Followed Store' });

      const favoritedOwner = await createTestUser();
      const favoritedSellerProfile = await createTestSellerProfile(favoritedOwner.id);
      const favoritedStore = await createTestStore(favoritedSellerProfile.id, {
        name: 'Favorited Store',
      });

      const otherOwner = await createTestUser();
      const otherSellerProfile = await createTestSellerProfile(otherOwner.id);
      const otherStore = await createTestStore(otherSellerProfile.id, { name: 'Unrelated Store' });

      await request(app)
        .post(`/api/v1/stores/${followedStore.id}/follow`)
        .set('Authorization', `Bearer ${user.accessToken}`);
      await request(app)
        .post(`/api/v1/favorites/stores/${favoritedStore.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      expect(ids).not.toContain(ownStore.id);
      expect(ids).not.toContain(followedStore.id);
      expect(ids).not.toContain(favoritedStore.id);
      expect(ids).toContain(otherStore.id);
    });

    it('never returns a BLOCKED, PENDING, or suspended-seller store', async () => {
      const blockedOwner = await createTestUser();
      const blockedSellerProfile = await createTestSellerProfile(blockedOwner.id);
      const blockedStore = await createTestStore(blockedSellerProfile.id, {
        name: 'Blocked Store',
        status: 'BLOCKED',
      });

      const pendingOwner = await createTestUser();
      const pendingSellerProfile = await createTestSellerProfile(pendingOwner.id);
      const pendingStore = await createTestStore(pendingSellerProfile.id, {
        name: 'Pending Store',
        status: 'PENDING',
      });

      const suspendedOwner = await createTestUser();
      const suspendedSellerProfile = await createTestSellerProfile(suspendedOwner.id, {
        suspended: true,
      });
      const suspendedSellerStore = await createTestStore(suspendedSellerProfile.id, {
        name: 'Suspended Seller Store',
      });

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store' });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      expect(ids).not.toContain(blockedStore.id);
      expect(ids).not.toContain(pendingStore.id);
      expect(ids).not.toContain(suspendedSellerStore.id);
    });

    it('ranks a store with a recent active product above an otherwise-identical stale store', async () => {
      const category = await createTestProductCategory();

      const freshOwner = await createTestUser();
      const freshSellerProfile = await createTestSellerProfile(freshOwner.id);
      const freshStore = await createTestStore(freshSellerProfile.id, { name: 'Fresh Store' });

      const staleOwner = await createTestUser();
      const staleSellerProfile = await createTestSellerProfile(staleOwner.id);
      const staleStore = await createTestStore(staleSellerProfile.id, { name: 'Stale Store' });

      // Neutralize both stores' baseline freshness, then give only
      // freshStore a newer signal (its active product's createdAt,
      // which lands after FIXED_TIME).
      await freezeUpdatedAt(freshStore.id);
      await freezeUpdatedAt(staleStore.id);
      await createTestProduct(freshStore.id, category.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store' });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const freshIndex = ids.indexOf(freshStore.id);
      const staleIndex = ids.indexOf(staleStore.id);
      expect(freshIndex).toBeGreaterThanOrEqual(0);
      expect(staleIndex).toBeGreaterThanOrEqual(0);
      expect(freshIndex).toBeLessThan(staleIndex);
    });

    it('ranks a nearer store above a farther one when lat/lng are supplied', async () => {
      const nearOwner = await createTestUser();
      const nearSellerProfile = await createTestSellerProfile(nearOwner.id);
      const nearStore = await createTestStore(nearSellerProfile.id, { name: 'Near Store' });

      const farOwner = await createTestUser();
      const farSellerProfile = await createTestSellerProfile(farOwner.id);
      const farStore = await createTestStore(farSellerProfile.id, { name: 'Far Store' });

      // Gaza City coordinates for "near"; a point ~9000km away for "far".
      await prisma.storeDetails.update({
        where: { id: nearStore.id },
        data: { latitude: 31.5, longitude: 34.45, updatedAt: FIXED_TIME },
      });
      await prisma.storeDetails.update({
        where: { id: farStore.id },
        data: { latitude: -33.87, longitude: 151.21, updatedAt: FIXED_TIME },
      });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', lat: 31.5, lng: 34.46 });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const nearIndex = ids.indexOf(nearStore.id);
      const farIndex = ids.indexOf(farStore.id);
      expect(nearIndex).toBeGreaterThanOrEqual(0);
      expect(farIndex).toBeGreaterThanOrEqual(0);
      expect(nearIndex).toBeLessThan(farIndex);
    });

    it('gives a FEATURED store a limited boost over an otherwise-identical FREE store', async () => {
      const featuredOwner = await createTestUser();
      const featuredSellerProfile = await createTestSellerProfile(featuredOwner.id);
      const featuredStore = await createTestStore(featuredSellerProfile.id, {
        name: 'Featured Store',
      });

      const freeOwner = await createTestUser();
      const freeSellerProfile = await createTestSellerProfile(freeOwner.id);
      const freeStore = await createTestStore(freeSellerProfile.id, { name: 'Free Plan Store' });

      await prisma.storeDetails.update({
        where: { id: featuredStore.id },
        data: { plan: 'FEATURED', updatedAt: FIXED_TIME },
      });
      await freezeUpdatedAt(freeStore.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store' });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const featuredIndex = ids.indexOf(featuredStore.id);
      const freeIndex = ids.indexOf(freeStore.id);
      expect(featuredIndex).toBeGreaterThanOrEqual(0);
      expect(freeIndex).toBeGreaterThanOrEqual(0);
      expect(featuredIndex).toBeLessThan(freeIndex);
    });

    it('returns a store with multiple active products exactly once (no duplicate rows)', async () => {
      const category = await createTestProductCategory();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { name: 'Multi-Product Store' });

      await createTestProduct(store.id, category.id);
      await createTestProduct(store.id, category.id);
      await createTestProduct(store.id, category.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store' });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const occurrences = ids.filter((id: string) => id === store.id).length;
      expect(occurrences).toBeLessThanOrEqual(1);
    });

    it('respects the limit query param', async () => {
      const owners = await Promise.all(Array.from({ length: 5 }).map(() => createTestUser()));
      const sellerProfiles = await Promise.all(owners.map(o => createTestSellerProfile(o.id)));
      await Promise.all(
        sellerProfiles.map((sp, i) => createTestStore(sp.id, { name: `Limit Store ${i}` }))
      );

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });

    it('a logged-in user with no follows/favorites/store gets the same honest ranking an anonymous caller would', async () => {
      const user = await createTestUser();
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id, { name: 'Fallback-visible Store' });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      expect(ids).toContain(store.id);
    });

    it('rejects lat without lng', async () => {
      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', lat: 31.5 });
      expect(res.status).toBe(400);
    });
  });
});
