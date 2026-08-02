import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';

describe('Audit Logs API', () => {
  describe('GET /api/v1/admin/audit-logs', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('returns paginated audit logs with related user info for an admin', async () => {
      const admin = await createTestAdmin();
      const target = await createTestUser();

      await prisma.auditLog.create({
        data: {
          event: 'ADMIN_USER_STATUS_CHANGED',
          userId: admin.id,
          ip: '127.0.0.1',
          userAgent: 'jest-test',
          details: { targetUserId: target.id, isActive: false },
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta.pagination).toBeDefined();
      expect(res.body.meta.pagination.total).toBeGreaterThan(0);

      const entry = res.body.data.find(
        (log: { event: string; userId: string }) =>
          log.event === 'ADMIN_USER_STATUS_CHANGED' && log.userId === admin.id
      );
      expect(entry).toBeDefined();
      expect(entry.user).toMatchObject({ id: admin.id, name: admin.name, email: admin.email });
    });

    it('filters by event type', async () => {
      const admin = await createTestAdmin();
      await prisma.auditLog.create({
        data: { event: 'LOGIN_SUCCESS', userId: admin.id },
      });
      await prisma.auditLog.create({
        data: { event: 'LOGOUT', userId: admin.id },
      });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({ event: 'LOGIN_SUCCESS' })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every((log: { event: string }) => log.event === 'LOGIN_SUCCESS')
      ).toBe(true);
    });

    it('filters by userId', async () => {
      const admin = await createTestAdmin();
      const otherAdmin = await createTestAdmin();
      await prisma.auditLog.create({ data: { event: 'LOGIN_SUCCESS', userId: admin.id } });
      await prisma.auditLog.create({ data: { event: 'LOGIN_SUCCESS', userId: otherAdmin.id } });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({ userId: admin.id })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every((log: { userId: string }) => log.userId === admin.id)
      ).toBe(true);
    });

    it('filters by date range (from/to)', async () => {
      const admin = await createTestAdmin();
      const old = await prisma.auditLog.create({
        data: { event: 'LOGIN_SUCCESS', userId: admin.id },
      });
      // Backdate one entry outside the query window.
      await prisma.auditLog.update({
        where: { id: old.id },
        data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      await prisma.auditLog.create({ data: { event: 'LOGIN_SUCCESS', userId: admin.id } });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({ from: '2025-01-01', userId: admin.id })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.find((log: { id: string }) => log.id === old.id)).toBeUndefined();
    });

    it('rejects an invalid date range (from after to)', async () => {
      const admin = await createTestAdmin();
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({ from: '2026-02-01', to: '2026-01-01' })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(400);
    });

    it('supports sorting by event', async () => {
      const admin = await createTestAdmin();
      await prisma.auditLog.create({ data: { event: 'LOGOUT', userId: admin.id } });
      await prisma.auditLog.create({ data: { event: 'LOGIN_SUCCESS', userId: admin.id } });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({ sortBy: 'event', sortOrder: 'asc', userId: admin.id })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      const events = res.body.data.map((log: { event: string }) => log.event);
      const sorted = [...events].sort();
      expect(events).toEqual(sorted);
    });
  });
});
