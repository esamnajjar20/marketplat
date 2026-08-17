import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestServiceProvider } from '../helpers/serviceProvider.helper';

// Home discovery plan (Phase 1): GET /service-providers — public
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
  });
});
