import { requestIdMiddleware } from '../../src/middlewares/requestId.middleware';
import { Request, Response, NextFunction } from 'express';

describe('requestIdMiddleware', () => {
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('uses valid client UUID when provided', () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440000';
    const req = { headers: { 'x-request-id': clientId } } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe(clientId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', clientId);
    expect(next).toHaveBeenCalled();
  });

  it('generates UUID when client id is invalid', () => {
    const req = { headers: { 'x-request-id': 'not-a-valid-uuid' } } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).not.toBe('not-a-valid-uuid');
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('generates UUID when header is missing', () => {
    const req = { headers: {} } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(next).toHaveBeenCalled();
  });
});
