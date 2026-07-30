import { AppError } from '../../src/shared/errors/AppError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { TooManyRequestsError } from '../../src/shared/errors/TooManyRequestsError';

describe('Error classes', () => {
  it('uses default messages', () => {
    expect(new BadRequestError().message).toBe('Bad request');
    expect(new NotFoundError().message).toBe('Resource not found');
    expect(new ForbiddenError().message).toBe('Forbidden');
    expect(new UnauthorizedError().message).toBe('Unauthorized');
    expect(new TooManyRequestsError().message).toBe('Too many requests');
  });

  it('accepts custom messages and status codes', () => {
    expect(new BadRequestError('Invalid input').statusCode).toBe(400);
    expect(new AppError('Server error', 500, undefined, undefined, false).isOperational).toBe(false);
  });
});
