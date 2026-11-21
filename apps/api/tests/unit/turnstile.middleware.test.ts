import type { Request, Response } from 'express';
import { createTurnstileMiddleware } from '../../src/middlewares/turnstile.middleware';

function makeReqRes(body: Record<string, unknown>) {
  const req = { body, ip: '203.0.113.5', requestId: 'r1' } as unknown as Request;
  const res = {
    locals: {},
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    set: jest.fn(),
  } as unknown as Response;
  return { req, res };
}

describe('turnstile middleware', () => {
  it('is a no-op without a secret and still strips the token field', async () => {
    const { req, res } = makeReqRes({ email: 'a@b.c', turnstileToken: 'x' });
    const next = jest.fn();
    await createTurnstileMiddleware(() => undefined)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ email: 'a@b.c' });
  });

  it('rejects a missing token when enabled', async () => {
    const { req, res } = makeReqRes({ email: 'a@b.c' });
    const next = jest.fn();
    const fetchImpl = jest.fn();
    await createTurnstileMiddleware(() => 'secret', fetchImpl as never)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('passes when Cloudflare confirms the token', async () => {
    const { req, res } = makeReqRes({ turnstileToken: 'good' });
    const next = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    await createTurnstileMiddleware(() => 'secret', fetchImpl as never)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({});
  });

  it('rejects when Cloudflare says the token is invalid', async () => {
    const { req, res } = makeReqRes({ turnstileToken: 'bad' });
    const next = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue({ json: async () => ({ success: false }) });
    await createTurnstileMiddleware(() => 'secret', fetchImpl as never)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('fails closed when the verifier is unreachable', async () => {
    const { req, res } = makeReqRes({ turnstileToken: 'x' });
    const next = jest.fn();
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network'));
    await createTurnstileMiddleware(() => 'secret', fetchImpl as never)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
