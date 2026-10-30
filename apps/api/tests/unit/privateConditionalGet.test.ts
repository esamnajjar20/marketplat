import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import {
  CACHE,
  privateApiCacheDefault,
} from '../../src/middlewares/cacheControl.middleware';

describe('private conditional GET / ETag isolation', () => {
  const app = express();
  app.set('etag', 'weak');
  app.use((_req, res, next) => {
    res.vary('Origin'); // simulate the upstream CORS middleware
    next();
  });
  app.use(privateApiCacheDefault);
  app.get('/api/v1/favorites', (_req: Request, res: Response) => {
    res.status(401).end();
  });
  app.get(
    '/api/v1/users/me',
    (req: Request, res: Response, next: NextFunction) => {
      CACHE.PRIVATE_REVALIDATE(req, res, next);
    },
    (req: Request, res: Response) => {
      const authorization = req.get('authorization') ?? 'anonymous';
      res.status(200).json({ user: authorization });
    }
  );

  it('defaults authenticated private endpoints to private no-store before auth rejects the request', async () => {
    const response = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', 'Bearer user-a');

    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toContain('Authorization');
    expect(response.headers.vary).toContain('Cookie');
    expect(response.headers.vary).toContain('Origin');
  });

  it('returns 304 for the same private representation after revalidation', async () => {
    const first = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer user-a');

    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-cache, no-transform');
    expect(first.headers.vary).toContain('Authorization');
    expect(first.headers.vary).toContain('Cookie');
    expect(first.headers.vary).toContain('Origin');
    expect(first.headers.etag).toBeTruthy();

    const second = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer user-a')
      .set('If-None-Match', first.headers.etag);

    expect(second.status).toBe(304);
    expect(second.text).toBe('');
    expect(second.headers['cache-control']).toBe('private, no-cache, no-transform');
  });

  it("does not return user A's representation to user B with A's validator", async () => {
    const first = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer user-a');

    const otherUser = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer user-b')
      .set('If-None-Match', first.headers.etag);

    expect(otherUser.status).toBe(200);
    expect(otherUser.body).toEqual({ user: 'Bearer user-b' });
    expect(otherUser.headers['cache-control']).toBe('private, no-cache, no-transform');
  });
});
