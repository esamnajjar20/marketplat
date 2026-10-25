import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestCategory } from '../helpers/category.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('Categories API', () => {
  describe('GET /api/v1/categories', () => {
    it('returns all categories publicly', async () => {
      await createTestCategory();

      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/categories/:id', () => {
    it('returns category by id', async () => {
      const category = await createTestCategory();

      const res = await request(app).get(`/api/v1/categories/${category.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(category.id);
    });

    it('returns 404 for non-existent category', async () => {
      const res = await request(app).get('/api/v1/categories/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/categories/slug/:slug', () => {
    it('returns category by slug', async () => {
      const category = await createTestCategory({ slug: `slug-${Date.now()}` });

      const res = await request(app).get(`/api/v1/categories/slug/${category.slug}`);

      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe(category.slug);
    });

    it('returns 404 for unknown slug', async () => {
      const res = await request(app).get('/api/v1/categories/slug/unknown-slug-xyz');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/categories', () => {
    it('creates category as admin', async () => {
      const admin = await createTestAdmin();
      const slug = `new-cat-${Date.now()}`;

      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Electronics', nameAr: 'إلكترونيات', slug });

      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe(slug);
    });

    it('returns 403 for regular user', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Test', nameAr: 'اختبار', slug: 'test-cat' });

      expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ name: 'Test', nameAr: 'اختبار', slug: 'test-cat' });

      expect(res.status).toBe(401);
    });

    it('returns 400 for duplicate slug', async () => {
      const admin = await createTestAdmin();
      const slug = `dup-${Date.now()}`;
      await createTestCategory({ slug, name: 'First', nameAr: 'أول' });

      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Second', nameAr: 'ثاني', slug });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid slug format', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Bad Slug', nameAr: 'سلug', slug: 'Invalid Slug!' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/categories/:id', () => {
    it('updates category as admin', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();

      const res = await request(app)
        .patch(`/api/v1/categories/${category.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('returns 404 for non-existent category', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/categories/non-existent-id')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/categories/:id', () => {
    it('deletes empty category as admin', async () => {
      const admin = await createTestAdmin();
      const category = await createTestCategory();

      const res = await request(app)
        .delete(`/api/v1/categories/${category.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      const inDb = await prisma.category.findUnique({ where: { id: category.id } });
      expect(inDb).toBeNull();
    });

    it('returns 400 when category has active ads', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const category = await createTestCategory();
      await createTestAd(user.id, { categoryId: category.id });

      // Re-fetch admin token after DB writes to avoid stale auth state
      const freshAdmin = await createTestAdmin();

      const res = await request(app)
        .delete(`/api/v1/categories/${category.id}`)
        .set('Authorization', `Bearer ${freshAdmin.accessToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/active ads/i);
    });
  });
});
