import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';

// PR4A (recommendation view signals): PRODUCT_VIEW/SERVICE_VIEW are
// ordinary AnalyticsEventType values, so they go through the exact
// same public POST /analytics/events beacon AD_VIEW/PAGE_VIEW/etc.
// already use (see analytics.routes.ts — unauthenticated by design).
// No dedicated PRODUCT_VIEW/SERVICE_VIEW endpoint exists or is needed;
// these tests exist to confirm the two new enum values actually
// persist through that shared path with the right event/metadata
// shape, and that AD_VIEW's own behavior through the same endpoint is
// unaffected by their addition.
describe('POST /api/v1/analytics/events — PRODUCT_VIEW / SERVICE_VIEW', () => {
  it('accepts a PRODUCT_VIEW event and persists it with productId/categoryId metadata', async () => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            event: 'PRODUCT_VIEW',
            sessionId,
            metadata: { productId: 'product-123', categoryId: 'cat-abc' },
            path: '/stores/store-1',
          },
        ],
      });

    expect(res.status).toBe(202);

    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('PRODUCT_VIEW');
    expect(rows[0].metadata).toMatchObject({ productId: 'product-123', categoryId: 'cat-abc' });
  });

  it('accepts a SERVICE_VIEW event and persists it with serviceListingId/categoryId metadata', async () => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            event: 'SERVICE_VIEW',
            sessionId,
            metadata: { serviceListingId: 'listing-456', categoryId: 'cat-xyz' },
            path: '/services/listing-456',
          },
        ],
      });

    expect(res.status).toBe(202);

    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('SERVICE_VIEW');
    expect(rows[0].metadata).toMatchObject({ serviceListingId: 'listing-456', categoryId: 'cat-xyz' });
  });

  it('attributes a PRODUCT_VIEW event to the caller\'s userId when a valid Bearer token is present', async () => {
    const user = await createTestUser();
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        events: [
          {
            event: 'PRODUCT_VIEW',
            sessionId,
            metadata: { productId: 'product-789' },
          },
        ],
      });

    expect(res.status).toBe(202);

    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
  });

  it('still accepts AD_VIEW through the same endpoint, unaffected by the new event types', async () => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [{ event: 'AD_VIEW', sessionId, metadata: { adId: 'ad-1' } }],
      });

    expect(res.status).toBe(202);

    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('AD_VIEW');
  });

  it('accepts a mixed batch containing AD_VIEW, PRODUCT_VIEW and SERVICE_VIEW in one call', async () => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          { event: 'AD_VIEW', sessionId, metadata: { adId: 'ad-1' } },
          { event: 'PRODUCT_VIEW', sessionId, metadata: { productId: 'product-1' } },
          { event: 'SERVICE_VIEW', sessionId, metadata: { serviceListingId: 'listing-1' } },
        ],
      });

    expect(res.status).toBe(202);

    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId } });
    expect(rows.map(r => r.event).sort()).toEqual(['AD_VIEW', 'PRODUCT_VIEW', 'SERVICE_VIEW']);
  });

  it('rejects an unknown event type (schema still validates against the real enum)', async () => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({ events: [{ event: 'NOT_A_REAL_EVENT', sessionId }] });

    expect(res.status).toBe(400);
  });
});
