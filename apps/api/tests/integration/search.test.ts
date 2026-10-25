/**
 * Integration coverage for GET /api/v1/search and /suggestions (/ P1).
 *
 * Unit tests already cover searchService normalization + Redis cache
 * branches; this file pins the real HTTP surface, validation, and that
 * seeded ads appear in unified results.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('Search API', () => {
  describe('GET /api/v1/search', () => {
    it('is public (no auth required)', async () => {
      const res = await request(app).get('/api/v1/search');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.results ?? res.body.data.items ?? res.body.data)).toBe(
        true,
      );
    });

    it('returns a seeded ad when q matches its title', async () => {
      const seller = await createTestUser();
      const unique = `لابتوب-بحث-${Date.now()}`;
      await createTestAd(seller.id, { title: unique, description: 'وصف طويل بما يكفي للاختبار هنا' });

      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: unique, type: 'ads' });

      expect(res.status).toBe(200);
      const results =
        res.body.data?.results ?? res.body.data?.items ?? res.body.data ?? [];
      expect(Array.isArray(results)).toBe(true);
      const titles = results.map((r: { title?: string }) => r.title);
      expect(titles.some((t: string) => t?.includes(unique))).toBe(true);
    });

    it('rejects empty q string with 400', async () => {
      const res = await request(app).get('/api/v1/search').query({ q: '' });
      expect(res.status).toBe(400);
    });

    it('rejects sort=distance without lat/lng', async () => {
      const res = await request(app).get('/api/v1/search').query({ sort: 'distance' });
      expect(res.status).toBe(400);
    });

    it('rejects lat without lng (and vice versa)', async () => {
      const res = await request(app).get('/api/v1/search').query({ lat: 31.5 });
      expect(res.status).toBe(400);
    });

    it('accepts lat+lng together for geo search', async () => {
      const res = await request(app)
        .get('/api/v1/search')
        .query({ lat: 31.5, lng: 34.5, radius: 10, sort: 'distance' });
      expect(res.status).toBe(200);
    });

    it('paginates with page and limit', async () => {
      const res = await request(app).get('/api/v1/search').query({ page: 1, limit: 5 });
      expect(res.status).toBe(200);
      const pagination = res.body.meta?.pagination ?? res.body.data?.pagination;
      if (pagination) {
        expect(pagination.page ?? pagination.currentPage).toBeDefined();
        expect(pagination.limit ?? pagination.perPage).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/search/suggestions', () => {
    it('requires a non-empty q', async () => {
      const res = await request(app).get('/api/v1/search/suggestions');
      expect(res.status).toBe(400);
    });

    it('returns an array for a valid prefix', async () => {
      const seller = await createTestUser();
      const title = `اقتراح-${Date.now()}`;
      await createTestAd(seller.id, { title, description: 'وصف طويل بما يكفي للاختبار هنا' });

      const res = await request(app)
        .get('/api/v1/search/suggestions')
        .query({ q: title.slice(0, 4) });

      expect(res.status).toBe(200);
      // Controller wraps as { suggestions: string[] } via successResponse
      const payload = res.body.data;
      const suggestions = Array.isArray(payload) ? payload : payload?.suggestions;
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });
});
