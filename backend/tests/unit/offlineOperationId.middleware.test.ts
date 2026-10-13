import { Request, Response, NextFunction } from 'express';
import { offlineOperationIdMiddleware } from '../../src/middlewares/offlineOperationId.middleware';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

describe('offlineOperationIdMiddleware', () => {
  const invoke = (header?: string | string[]) => {
    const req = { headers: { 'x-offline-op-id': header } } as unknown as Request;
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    offlineOperationIdMiddleware(req, {} as Response, next);
    return next;
  };

  it('allows requests without an offline operation ID', () => {
    const next = invoke(undefined);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    '550e8400-e29b-41d4-a716-446655440000',
    'op_1728830000_ab12cd34',
    'client.operation-1:retry',
    'a',
    'x'.repeat(128),
    'op_1728830000_ab12cd34:retry.2',
  ])('accepts a valid generated token: %s', (id) => {
    const next = invoke(id);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    '',
    ' contains-space',
    'bad\nheader',
    'bad\theader',
    'id,another-id',
    '/path-like-id',
    'عربي',
    'x'.repeat(129),
    ['op-one', 'op-two'],
  ])('rejects malformed operation IDs', (id) => {
    const next = invoke(id as string | string[]);
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as unknown as BadRequestError).code).toBe('OFFLINE_OP_ID_INVALID');
  });
});
