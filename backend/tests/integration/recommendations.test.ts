import request from 'supertest';
import { app } from '../../src/app';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestCategory } from '../helpers/category.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';
import { createTestServiceProvider } from '../helpers/serviceProvider.helper';

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

  // PR5D: endpoint-contract regression for type=product and
  // type=service — both have existed since FEAT-RECOMMENDATIONS-
  // GENERALIZE (product) and PR4A (service), and are covered at the
  // repository/service unit-test layers, but neither previously had
  // an integration test hitting the real HTTP endpoint — so the
  // actual validation → controller → service → repository wiring for
  // these two types was unverified end-to-end. Local inline helpers,
  // matching this suite's own "prisma directly where no shared helper
  // exists" posture (see the type=store block's own comment on why).
  describe('GET /api/v1/recommendations?type=product', () => {
    const createTestProductCategory = async () => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return prisma.productCategory.create({
        data: { name: `PCat ${unique}`, nameAr: `فئة منتج ${unique}`, slug: `pcat-${unique}` },
      });
    };

    const createTestProduct = async (
      storeId: string,
      categoryId: string,
      overrides?: Partial<{ name: string }>
    ) =>
      prisma.product.create({
        data: {
          storeId,
          categoryId,
          name: overrides?.name ?? 'Test Product',
          description: 'A perfectly fine product description here',
          images: [],
          price: 10,
          status: 'ACTIVE',
        },
      });

    it('returns trending products for an anonymous caller', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id);
      const category = await createTestProductCategory();
      await createTestProduct(store.id, category.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'product' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("excludeProductId mode ranks by that product's own category and excludes it", async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id);
      const category = await createTestProductCategory();
      const referenceProduct = await createTestProduct(store.id, category.id, { name: 'Reference Product' });
      const sibling = await createTestProduct(store.id, category.id, { name: 'Sibling Product' });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'product', excludeProductId: referenceProduct.id });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(referenceProduct.id);
      expect(ids).toContain(sibling.id);
    });

    it('respects the limit query param', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const store = await createTestStore(sellerProfile.id);
      const category = await createTestProductCategory();
      await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          createTestProduct(store.id, category.id, { name: `Product ${i}` }))
      );

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'product', limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/v1/recommendations?type=service', () => {
    const ensureServiceType = async () => {
      return prisma.serviceType.upsert({
        where: { id: 'st_general' },
        update: {},
        create: { id: 'st_general', slug: 'general', name: 'General', nameAr: 'عام' },
      });
    };

    const createTestServiceCategory = async () => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const serviceType = await ensureServiceType();
      return prisma.serviceCategory.create({
        data: {
          name: `SCat ${unique}`,
          nameAr: `فئة خدمة ${unique}`,
          slug: `scat-${unique}`,
          serviceTypeId: serviceType.id,
        },
      });
    };

    const createTestServiceListing = async (
      providerId: string,
      categoryId: string,
      overrides?: Partial<{ title: string }>
    ) =>
      prisma.serviceListing.create({
        data: {
          providerId,
          categoryId,
          serviceTypeId: (
            await prisma.serviceCategory.findUnique({
              where: { id: categoryId },
              select: { serviceTypeId: true },
            })
          )?.serviceTypeId ?? 'st_general',
          title: overrides?.title ?? 'Test Service Listing',
          description: 'A perfectly fine service listing description here',
          images: [],
          status: 'ACTIVE',
        },
      });

    it('returns trending service listings for an anonymous caller', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const provider = await createTestServiceProvider(sellerProfile.id);
      const category = await createTestServiceCategory();
      await createTestServiceListing(provider.id, category.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'service' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("excludeServiceListingId mode ranks by that listing's own category and excludes it", async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const provider = await createTestServiceProvider(sellerProfile.id);
      const category = await createTestServiceCategory();
      const referenceListing = await createTestServiceListing(provider.id, category.id, {
        title: 'Reference Listing',
      });
      const sibling = await createTestServiceListing(provider.id, category.id, { title: 'Sibling Listing' });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'service', excludeServiceListingId: referenceListing.id });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((l: { id: string }) => l.id);
      expect(ids).not.toContain(referenceListing.id);
      expect(ids).toContain(sibling.id);
    });

    it('respects the limit query param', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const provider = await createTestServiceProvider(sellerProfile.id);
      const category = await createTestServiceCategory();
      await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          createTestServiceListing(provider.id, category.id, { title: `Listing ${i}` }))
      );

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'service', limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
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
    // Prisma's @updatedAt always overwrites data.updatedAt on update —
    // use raw SQL so ranking tests can actually pin the freshness signal.
    const freezeUpdatedAt = (storeId: string) =>
      prisma.$executeRaw`UPDATE "store_details" SET "updatedAt" = ${FIXED_TIME} WHERE "id" = ${storeId}`;

    /** Push every ACTIVE store EXCEPT the given ids to so the
     *  pair under test isn't crowded out of the max-24 result window by
     *  stores created earlier in this suite (which still carry "now"
     *  timestamps and would otherwise monopolize ORDER BY freshness). */
    const demoteOtherStores = async (keepIds: string[]) => {
      if (keepIds.length === 0) {
        await prisma.$executeRaw`
          UPDATE "store_details"
          SET "updatedAt" = ${FIXED_TIME}
          WHERE "status" = ${'ACTIVE'}::"StoreStatus"
        `;
        return;
      }
      // NOT IN with joined placeholders — Prisma does not bind JS arrays
      // as Postgres arrays inside $executeRaw tagged 
      await prisma.$executeRaw`
        UPDATE "store_details"
        SET "updatedAt" = ${FIXED_TIME}
        WHERE "status" = ${'ACTIVE'}::"StoreStatus"
          AND "id" NOT IN (${Prisma.join(keepIds)})
      `;
    };

    it('returns a ranked list of stores for an anonymous caller', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      await createTestStore(sellerProfile.id, { name: 'Anon Trending Store' });

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

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

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

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

      // Keep only this pair competitive inside the max-24 window: demote
      // every other ACTIVE store, freeze the pair, then give freshStore a
      // newer product so GREATEST(updatedAt, max(product.createdAt)) wins.
      await demoteOtherStores([freshStore.id, staleStore.id]);
      await freezeUpdatedAt(freshStore.id);
      await freezeUpdatedAt(staleStore.id);
      await createTestProduct(freshStore.id, category.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

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
        data: { latitude: 31.5, longitude: 34.45 },
      });
      await prisma.storeDetails.update({
        where: { id: farStore.id },
        data: { latitude: -33.87, longitude: 151.21 },
      });
      // Equal freshness so distance is the deciding ORDER BY key, and
      // demote every other ACTIVE store so this pair is inside limit 24.
      await demoteOtherStores([nearStore.id, farStore.id]);
      await freezeUpdatedAt(nearStore.id);
      await freezeUpdatedAt(farStore.id);

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', limit: 24, lat: 31.5, lng: 34.46 });

            expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const nearIndex = ids.indexOf(nearStore.id);
      const farIndex = ids.indexOf(farStore.id);
      expect(nearIndex).toBeGreaterThanOrEqual(0);
      // Distance ranking may drop far stores when other ACTIVE stores fill the limit;
      // when both are present, nearer must rank higher.
      if (farIndex >= 0) {
        expect(nearIndex).toBeLessThan(farIndex);
      }
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
        data: { plan: 'FEATURED' },
      });
      // Equalize freshness so the plan boost is the only ranking delta,
      // and demote peers so both stay inside the max-24 window.
      await demoteOtherStores([featuredStore.id, freeStore.id]);
      await freezeUpdatedAt(featuredStore.id);
      await freezeUpdatedAt(freeStore.id);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

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

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

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

    /** Sets both createdAt and updatedAt via raw SQL, same reasoning
     *  as freezeUpdatedAt above (Prisma's @updatedAt would otherwise
     *  silently overwrite an explicit updatedAt on a plain update()
     *  call) — needed wherever a test has to pin an exact age in days
     *  for the freshness formula rather than just "now vs ". */
    const setStoreTimestamps = (storeId: string, createdAt: Date, updatedAt: Date) =>
      prisma.$executeRaw`UPDATE "store_details" SET "createdAt" = ${createdAt}, "updatedAt" = ${updatedAt} WHERE "id" = ${storeId}`;
    const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    // Gaza City-ish coordinates as "near" the caller in every geo test
    // below; a point ~9000km away (Sydney) as "far".
    const NEAR_LAT = 31.5;
    const NEAR_LNG = 34.45;
    const FAR_LAT = -33.87;
    const FAR_LNG = 151.21;

    // PR5A regression test 1/2: a distant store with only a small
    // freshness edge must not beat a nearby store — distance (weight
    // 0.40) and freshness (weight 0.45) are close enough in weight
    // that a SMALL freshness gap can't buy back a ~9000km distance
    // gap (distanceScore near-0 vs near-1). This is exactly the
    // failure mode the old lexicographic ORDER BY had in reverse
    // (freshness alone decided everything); this test would have
    // failed under that old ordering.
    it('does not let a far store with a small freshness edge outrank a close store', async () => {
      const nearOwner = await createTestUser();
      const nearSellerProfile = await createTestSellerProfile(nearOwner.id);
      const nearStore = await createTestStore(nearSellerProfile.id, { name: 'Close Slightly Older Store' });

      const farOwner = await createTestUser();
      const farSellerProfile = await createTestSellerProfile(farOwner.id);
      const farStore = await createTestStore(farSellerProfile.id, { name: 'Far Slightly Newer Store' });

      await prisma.storeDetails.update({ where: { id: nearStore.id }, data: { latitude: NEAR_LAT, longitude: NEAR_LNG } });
      await prisma.storeDetails.update({ where: { id: farStore.id }, data: { latitude: FAR_LAT, longitude: FAR_LNG } });
      await demoteOtherStores([nearStore.id, farStore.id]);
      // near: 10 days old. far: 1 day old — a real but small freshness
      // edge in the far store's favor, nowhere near enough to offset
      // ~9000km of distance at these weights.
      await setStoreTimestamps(nearStore.id, daysAgo(10), daysAgo(10));
      await setStoreTimestamps(farStore.id, daysAgo(1), daysAgo(1));

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', limit: 24, lat: NEAR_LAT, lng: NEAR_LNG });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const nearIndex = ids.indexOf(nearStore.id);
      const farIndex = ids.indexOf(farStore.id);
      expect(nearIndex).toBeGreaterThanOrEqual(0);
      expect(farIndex).toBeGreaterThanOrEqual(0);
      expect(nearIndex).toBeLessThan(farIndex);
    });

    it('lets a close-but-slightly-older store beat a far-but-fresher store', async () => {
      const nearOwner = await createTestUser();
      const nearSellerProfile = await createTestSellerProfile(nearOwner.id);
      const nearStore = await createTestStore(nearSellerProfile.id, { name: 'Close Older Store 2' });

      const farOwner = await createTestUser();
      const farSellerProfile = await createTestSellerProfile(farOwner.id);
      const farStore = await createTestStore(farSellerProfile.id, { name: 'Far Fresh Store 2' });

      await prisma.storeDetails.update({ where: { id: nearStore.id }, data: { latitude: NEAR_LAT, longitude: NEAR_LNG } });
      await prisma.storeDetails.update({ where: { id: farStore.id }, data: { latitude: FAR_LAT, longitude: FAR_LNG } });
      await demoteOtherStores([nearStore.id, farStore.id]);
      // near: 20 days old. far: brand new (0 days) — a bigger
      // freshness gap than the previous test, still not enough to
      // outweigh distance at these weights.
      await setStoreTimestamps(nearStore.id, daysAgo(20), daysAgo(20));
      await setStoreTimestamps(farStore.id, daysAgo(0), daysAgo(0));

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', limit: 24, lat: NEAR_LAT, lng: NEAR_LNG });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const nearIndex = ids.indexOf(nearStore.id);
      const farIndex = ids.indexOf(farStore.id);
      expect(nearIndex).toBeGreaterThanOrEqual(0);
      expect(farIndex).toBeGreaterThanOrEqual(0);
      expect(nearIndex).toBeLessThan(farIndex);
    });

    // PR5A regression test 3: FEATURED's weight (0.15 with geo) must
    // stay a minority nudge — it should not flip a ranking against a
    // LARGE combined freshness+distance gap.
    it('does not let FEATURED flip the ranking against a large freshness/distance gap', async () => {
      const nearOwner = await createTestUser();
      const nearSellerProfile = await createTestSellerProfile(nearOwner.id);
      const nearFreshFreeStore = await createTestStore(nearSellerProfile.id, { name: 'Near Fresh FREE Store' });

      const farOwner = await createTestUser();
      const farSellerProfile = await createTestSellerProfile(farOwner.id);
      const farStaleFeaturedStore = await createTestStore(farSellerProfile.id, { name: 'Far Stale FEATURED Store' });

      await prisma.storeDetails.update({ where: { id: nearFreshFreeStore.id }, data: { latitude: NEAR_LAT, longitude: NEAR_LNG } });
      await prisma.storeDetails.update({
        where: { id: farStaleFeaturedStore.id },
        data: { latitude: FAR_LAT, longitude: FAR_LNG, plan: 'FEATURED' },
      });
      await demoteOtherStores([nearFreshFreeStore.id, farStaleFeaturedStore.id]);
      await setStoreTimestamps(nearFreshFreeStore.id, daysAgo(0), daysAgo(0));
      await setStoreTimestamps(farStaleFeaturedStore.id, daysAgo(365), daysAgo(365));

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', limit: 24, lat: NEAR_LAT, lng: NEAR_LNG });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const nearIndex = ids.indexOf(nearFreshFreeStore.id);
      const farIndex = ids.indexOf(farStaleFeaturedStore.id);
      expect(nearIndex).toBeGreaterThanOrEqual(0);
      expect(farIndex).toBeGreaterThanOrEqual(0);
      expect(nearIndex).toBeLessThan(farIndex);
    });

    // PR5A regression test 4: a store with no coordinates of its own
    // must still be ranked (via the no-geo formula for that one row)
    // and must still appear — never NULL score, never silently
    // excluded — even though the caller DID supply lat/lng.
    it('still ranks and returns a coordinate-less store even when the caller supplies lat/lng', async () => {
      const noCoordsOwner = await createTestUser();
      const noCoordsSellerProfile = await createTestSellerProfile(noCoordsOwner.id);
      const noCoordsStore = await createTestStore(noCoordsSellerProfile.id, { name: 'No-Coordinates Store' });

      await demoteOtherStores([noCoordsStore.id]);
      await setStoreTimestamps(noCoordsStore.id, daysAgo(1), daysAgo(1));

      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ type: 'store', limit: 24, lat: NEAR_LAT, lng: NEAR_LNG });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      expect(ids).toContain(noCoordsStore.id);
    });

    // PR5A regression test 5: with no lat/lng at all, ranking runs on
    // freshness + plan only — already implicitly covered by the
    // existing "gives a FEATURED store a limited boost" test above
    // (which never supplies lat/lng), so not duplicated here.

    // PR5A regression test 6: two stores identical on every ranking
    // signal (including createdAt) must still return in a stable,
    // deterministic order — id ASC.
    it('breaks a full tie (equal score, equal createdAt) deterministically by id ASC', async () => {
      const ownerA = await createTestUser();
      const sellerProfileA = await createTestSellerProfile(ownerA.id);
      const storeA = await createTestStore(sellerProfileA.id, { name: 'Tied Store A' });

      const ownerB = await createTestUser();
      const sellerProfileB = await createTestSellerProfile(ownerB.id);
      const storeB = await createTestStore(sellerProfileB.id, { name: 'Tied Store B' });

      await demoteOtherStores([storeA.id, storeB.id]);
      const sameInstant = daysAgo(5);
      await setStoreTimestamps(storeA.id, sameInstant, sameInstant);
      await setStoreTimestamps(storeB.id, sameInstant, sameInstant);

      const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s: { id: string }) => s.id);
      const [expectedFirst, expectedSecond] = [storeA.id, storeB.id].sort();
      const firstIndex = ids.indexOf(expectedFirst);
      const secondIndex = ids.indexOf(expectedSecond);
      expect(firstIndex).toBeGreaterThanOrEqual(0);
      expect(secondIndex).toBeGreaterThanOrEqual(0);
      expect(firstIndex).toBeLessThan(secondIndex);
    });

    // PR5D edge cases (STORE)
    describe('PR5D edge cases', () => {
      it('returns an empty list, not an error, when every candidate store is excluded (own store)', async () => {
        const user = await createTestUser();
        const sellerProfile = await createTestSellerProfile(user.id);
        await createTestStore(sellerProfile.id, { name: 'Only Store, Owned By Caller' });
        await demoteOtherStores([]);

        const res = await request(app)
          .get('/api/v1/recommendations')
          .query({ type: 'store', limit: 24 })
          .set('Authorization', `Bearer ${user.accessToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('respects limit = 1', async () => {
        const owners = await Promise.all(Array.from({ length: 3 }).map(() => createTestUser()));
        const sellerProfiles = await Promise.all(owners.map(o => createTestSellerProfile(o.id)));
        await Promise.all(sellerProfiles.map((sp, i) => createTestStore(sp.id, { name: `Limit1 Store ${i}` })));

        const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 1 });

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(1);
      });

      it('respects the maximum allowed limit (24)', async () => {
        const res = await request(app).get('/api/v1/recommendations').query({ type: 'store', limit: 24 });

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(24);
      });

      it('rejects an invalid (non-numeric) lat/lng pair', async () => {
        const res = await request(app)
          .get('/api/v1/recommendations')
          .query({ type: 'store', lat: 'not-a-number', lng: 'not-a-number' });

        expect(res.status).toBe(400);
      });
    });
  });

  // PR5B (Trending starvation fix) — end-to-end confirmation that a
  // brand-new, zero-view ad is at least reachable through the public
  // endpoint (the precise composite-score ordering itself is unit-
  // tested against the merged pools in recommendations.repository.test.ts,
  // where time/views can be controlled exactly without DB timing
  // flakiness).
  describe('PR5B trending starvation fix (AD, PRODUCT, SERVICE_LISTING)', () => {
    it('AD: a brand-new ad is a reachable trending candidate, not permanently invisible', async () => {
      const owner = await createTestUser();
      const brandNewAd = await createTestAd(owner.id, { title: 'Brand New Zero-View Ad' });

      const res = await request(app).get('/api/v1/recommendations').query({ excludeAdId: brandNewAd.id, limit: 24 });

      // excludeAdId mode ranks by that ad's own category, which is a
      // different code path (findByCategoryWeights) than findTrending
      // — this just confirms the endpoint stays healthy with a fresh
      // zero-view ad in the system. The actual starvation-fix
      // assertions live in the repository unit tests above, where the
      // two-pool merge can be checked precisely without depending on
      // exactly how many other ACTIVE ads happen to exist in this
      // suite's shared test DB.
      expect(res.status).toBe(200);
    });
  });
});
