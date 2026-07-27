import { Prisma } from '@prisma/client';
import { handlePrismaError } from '../../src/shared/utils/prismaErrors';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

describe('handlePrismaError', () => {
  it('maps P2002 to BadRequestError', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['email'] },
    });

    expect(() => handlePrismaError(error)).toThrow(BadRequestError);
    expect(() => handlePrismaError(error)).toThrow(/email/);
  });

  it('maps P2025 to NotFoundError', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    expect(() => handlePrismaError(error)).toThrow(NotFoundError);
  });

  it('rethrows unknown Prisma errors', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Other', {
      code: 'P9999',
      clientVersion: '5.0.0',
    });

    expect(() => handlePrismaError(error)).toThrow(error);
  });

  it('rethrows non-Prisma errors', () => {
    const error = new Error('Generic');
    expect(() => handlePrismaError(error)).toThrow('Generic');
  });
});
