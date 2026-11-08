import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser, TestUser } from '../helpers/auth.helper';

describe('Users Endpoints', () => {
  let user: TestUser;

  beforeEach(async () => { user = await createTestUser(); });

  describe('GET /api/v1/users/me', () => {
    it('should return current user profile', async () => {
      const res = await request(app).get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`).expect(200);
      expect(res.body.data.id).toBe(user.id);
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should fail without token', async () => {
      await request(app).get('/api/v1/users/me').expect(401);
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('should update profile', async () => {
      const res = await request(app).patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Updated Name', city: 'الخليل' }).expect(200);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should fail with invalid phone', async () => {
      await request(app).patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ phone: 'not-a-phone' }).expect(400);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return user by id', async () => {
      const res = await request(app).get(`/api/v1/users/${user.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`).expect(200);
      expect(res.body.data.id).toBe(user.id);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app).get('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${user.accessToken}`).expect(404);
    });
  });

  describe('GET /api/v1/users/:id/profile-state', () => {
    it('includes directional block status so profile UI needs only one interaction-state request', async () => {
      const target = await createTestUser();

      const before = await request(app)
        .get(`/api/v1/users/${target.id}/profile-state`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(before.body.data).toEqual(expect.objectContaining({
        following: expect.any(Boolean),
        online: expect.any(Boolean),
        isBlockedByMe: false,
      }));

      await request(app)
        .post(`/api/v1/blocked-users/${target.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const after = await request(app)
        .get(`/api/v1/users/${target.id}/profile-state`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(after.body.data.isBlockedByMe).toBe(true);
    });
  });
});
