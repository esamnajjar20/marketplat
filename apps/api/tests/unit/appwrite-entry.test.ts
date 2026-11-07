import type { Request, Response } from 'express';

const mockExpressHandler = jest.fn();

jest.mock('serverless-http', () => ({
  __esModule: true,
  default: () => mockExpressHandler,
}));
jest.mock('../../src/instrument', () => ({}));
jest.mock('../../src/app', () => ({ app: {} }));

import appwriteEntry from '../../src/appwrite-entry';

describe('Appwrite Express adapter', () => {
  const send = jest.fn();
  const json = jest.fn();
  const log = jest.fn();
  const error = jest.fn();
  const res = { send, json } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExpressHandler.mockResolvedValue({ statusCode: 200, headers: {}, body: 'ok' });
  });

  it('normalizes path, query, headers and omits hop-by-hop headers', async () => {
    await appwriteEntry({
      req: {
        method: 'GET',
        path: 'api/v1/ads',
        queryString: '?page=1',
        headers: {
          Connection: 'keep-alive, x-private-hop',
          'Keep-Alive': 'timeout=5',
          'X-Private-Hop': 'remove-me',
          Accept: ['application/json', 'text/plain'],
          'X-Count': 2,
        },
      } as unknown as Request,
      res,
      log,
      error,
    });

    const event = mockExpressHandler.mock.calls[0][0];
    expect(event.rawPath).toBe('/api/v1/ads');
    expect(event.rawQueryString).toBe('page=1');
    expect(event.body).toBeUndefined();
    expect(event.headers).toEqual({ accept: 'application/json, text/plain', 'x-count': '2' });
    expect(send).toHaveBeenCalledWith('ok', 200, {});
  });

  it('preserves an explicitly empty raw request body', async () => {
    await appwriteEntry({
      req: { method: 'POST', path: '/api/v1/ads', bodyRaw: '', body: {} },
      res,
      log,
      error,
    });

    const event = mockExpressHandler.mock.calls[0][0];
    expect(event.body).toBe('');
    expect(event.isBase64Encoded).toBe(false);
  });

  it('does not expose internal error messages to clients', async () => {
    mockExpressHandler.mockRejectedValueOnce(new Error('database password leaked'));

    await appwriteEntry({
      req: { method: 'GET', path: '/' },
      res,
      log,
      error,
    });

    expect(json).toHaveBeenCalledWith({ error: 'Internal Server Error' }, 500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('database password leaked');
    expect(error).toHaveBeenCalled();
  });

  it('returns 400 when Appwrite request is missing', async () => {
    await appwriteEntry({ req: null, res, log, error });
    expect(json).toHaveBeenCalledWith({ error: 'Bad Request' }, 400);
    expect(mockExpressHandler).not.toHaveBeenCalled();
  });
});
