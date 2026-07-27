import { errorMiddleware } from '../../src/middlewares/error.middleware';
import { AppError } from '../../src/shared/errors/AppError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ServiceUnavailableError } from '../../src/shared/errors/ServiceUnavailableError';
import { ZodError, z } from 'zod';
import { Request, Response, NextFunction } from 'express';

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const mockReq = (requestId = 'req-123'): Partial<Request> => ({ requestId, path: '/test', method: 'GET' });
const mockRes = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext: NextFunction = jest.fn();

describe('errorMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('handles ZodError with field errors', () => {
    const res = mockRes();
    let zodErr: ZodError;
    try {
      z.object({ email: z.string().email() }).parse({ email: 'bad' });
    } catch (e) {
      zodErr = e as ZodError;
    }

    errorMiddleware(zodErr!, mockReq() as Request, res as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Validation failed', errors: expect.any(Object) })
    );
  });

  it('handles AppError with correct status', () => {
    const res = mockRes();
    errorMiddleware(new BadRequestError('Bad input'), mockReq() as Request, res as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Bad input', statusCode: 400, requestId: 'req-123' })
    );
  });

  // PROD-FIX-12: ServiceUnavailableError (503) is a subclass of
  // AppError, thrown when a circuit breaker (circuitBreaker.ts)
  // rejects a call because an external dependency is currently OPEN —
  // confirms it takes the same AppError branch (correct status code,
  // no stack trace leaked to the client) as every other AppError
  // subclass, and that its statusCode (503) is correctly >= 500 for
  // the "log this as an operational error" branch, since a circuit
  // being open is genuinely worth knowing about in logs/monitoring
  // even though it's an expected, handled condition rather than a bug.
  it('handles ServiceUnavailableError (circuit breaker open) as a 503 AppError and logs it', () => {
    const res = mockRes();
    const { logger } = require('../../src/shared/utils/logger');
    errorMiddleware(
      new ServiceUnavailableError('Image upload is temporarily unavailable, please try again shortly'),
      mockReq() as Request,
      res as Response,
      mockNext,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Image upload is temporarily unavailable, please try again shortly',
        statusCode: 503,
        requestId: 'req-123',
      })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs 5xx AppError', () => {
    const res = mockRes();
    const { logger } = require('../../src/shared/utils/logger');
    errorMiddleware(new AppError('Server issue', 500), mockReq() as Request, res as Response, mockNext);
    expect(logger.error).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles unknown errors as 500', () => {
    const res = mockRes();
    errorMiddleware(new Error('Unexpected'), mockReq() as Request, res as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error' })
    );
  });
});
