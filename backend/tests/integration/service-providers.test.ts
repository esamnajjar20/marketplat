import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestServiceProvider } from '../helpers/serviceProvider.helper';

// Home discovery plan (): GET /service-providers — public
// city/browse directory. Same convention as stores.test.ts's
// "GET /api/v1/stores" block (public access check, city filter,
// pagination) plus the availability exclusion this endpoint shares
// with /nearby.
describe('Service Providers API', () => {
  describe('GET /api/v1/service-providers', () => {
    it('is publicly accessible without a token', async () => {
      const res = await request(app).get('/api/v1/service-providers');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns general results with no city filter (no city required)', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const provider = await createTestServiceProvider(sellerProfile.id, {
        businessName: `General Provider ${Date.now()}`,
      });

      const res = await request(app).get('/api/v1/service-providers');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.map((p: any) => p.id)).toContain(provider.id);
    });

    it('filters by city (serviceAreaCities contains the given city)', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const uniqueCity = `city-${Date.now()}`;
      const provider = await createTestServiceProvider(sellerProfile.id, {
        serviceAreaCities: [uniqueCity],
      });

      const otherOwner = await createTestUser();
      const otherSellerProfile = await createTestSellerProfile(otherOwner.id);
      await createTestServiceProvider(otherSellerProfile.id, {
        serviceAreaCities: ['a-completely-different-city'],
      });

      const res = await request(app)
        .get('/api/v1/service-providers')
        .query({ city: uniqueCity });

      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toContain(provider.id);
      expect(
        res.body.data.every((p: any) => p.serviceAreaCities.includes(uniqueCity))
      ).toBe(true);
    });

    it('returns an empty array (not an error) for a city with no matching providers', async () => {
      const res = await request(app)
        .get('/api/v1/service-providers')
        .query({ city: `no-such-city-${Date.now()}` });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('matches a provider serving multiple cities on any one of them', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const cityA = `city-a-${Date.now()}`;
      const cityB = `city-b-${Date.now()}`;
      const provider = await createTestServiceProvider(sellerProfile.id, {
        serviceAreaCities: [cityA, cityB],
      });

      const res = await request(app).get('/api/v1/service-providers').query({ city: cityB });

      expect(res.body.data.map((p: any) => p.id)).toContain(provider.id);
    });

    it('excludes UNAVAILABLE providers, same as /nearby', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const uniqueCity = `city-unavail-${Date.now()}`;
      const provider = await createTestServiceProvider(sellerProfile.id, {
        serviceAreaCities: [uniqueCity],
        availabilityStatus: 'UNAVAILABLE',
      });

      const res = await request(app)
        .get('/api/v1/service-providers')
        .query({ city: uniqueCity });

      expect(res.body.data.map((p: any) => p.id)).not.toContain(provider.id);
    });

    it('paginates results', async () => {
      const res = await request(app)
        .get('/api/v1/service-providers')
        .query({ page: 1, limit: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.meta.pagination).toEqual(
        expect.objectContaining({ page: 1, limit: 1 })
      );
    });

    it('returns 400 for an invalid page value', async () => {
      const res = await request(app).get('/api/v1/service-providers').query({ page: '0' });
      expect(res.status).toBe(400);
    });

    it('does not require or accept lat/lng — city-only by design', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const uniqueCity = `city-latlng-${Date.now()}`;
      const provider = await createTestServiceProvider(sellerProfile.id, {
        serviceAreaCities: [uniqueCity],
      });

      // lat/lng passed here should simply be ignored (stripped by the
      // schema), not cause an error or a distance-sorted response —
      // this route is not /nearby.
      const res = await request(app)
        .get('/api/v1/service-providers')
        .query({ city: uniqueCity, lat: '31.5', lng: '34.45' });

      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.id)).toContain(provider.id);
      expect(res.body.data[0]).not.toHaveProperty('distanceKm');
    });

    // SEC-findMany previously had no join/filter on
    // sellerProfile.suspended, so a suspended seller's provider stayed
    // listed in the general directory. See service-providers.repository.ts.
    it('excludes providers whose seller is suspended', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id, { suspended: true });
      const uniqueCity = `city-suspended-${Date.now()}`;
      const provider = await createTestServiceProvider(sellerProfile.id, {
        serviceAreaCities: [uniqueCity],
      });

      const res = await request(app).get('/api/v1/service-providers').query({ city: uniqueCity });

      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.id)).not.toContain(provider.id);
    });
  });

  describe('GET /api/v1/service-providers/:id', () => {
    it('returns the provider with its ACTIVE listings for a normal (non-suspended) provider', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id);
      const provider = await createTestServiceProvider(sellerProfile.id);

      const res = await request(app).get(`/api/v1/service-providers/${provider.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(provider.id);
      expect(Array.isArray(res.body.data.listings)).toBe(true);
    });

    it('returns 404 for a non-existent provider', async () => {
      const res = await request(app).get('/api/v1/service-providers/non-existent-id');
      expect(res.status).toBe(404);
    });

    // SEC-getPublicServiceProvider previously never
    // checked sellerProfile.suspended, so a suspended seller's provider
    // page stayed fully viewable at its direct URL. See
    // service-providers.service.ts's getPublicServiceProvider.
    it('returns 404 for a provider whose seller is suspended', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id, { suspended: true });
      const provider = await createTestServiceProvider(sellerProfile.id);

      const res = await request(app).get(`/api/v1/service-providers/${provider.id}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/service-providers/nearby', () => {
    // SEC-findNearby's raw query previously had no join
    // to seller_profiles at all, so a suspended seller's provider stayed
    // findable by nearby search. See service-providers.repository.ts.
    it('excludes a provider whose seller is suspended', async () => {
      const owner = await createTestUser();
      const sellerProfile = await createTestSellerProfile(owner.id, { suspended: true });
      const provider = await createTestServiceProvider(sellerProfile.id, {
        latitude: 31.5,
        longitude: 34.45,
      });

      const res = await request(app)
        .get('/api/v1/service-providers/nearby')
        .query({ lat: '31.5', lng: '34.45', radius: '10' });

      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.id)).not.toContain(provider.id);
    });
  });
});
