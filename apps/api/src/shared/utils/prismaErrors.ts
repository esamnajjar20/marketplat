import { Prisma } from '@prisma/client';
import { BadRequestError } from '../errors/BadRequestError';
import { NotFoundError } from '../errors/NotFoundError';

/**
 * Translates Prisma known request errors into application-level errors.
 * Call inside catch blocks in repository methods.
 *
 * P2002 — unique constraint violation → BadRequestError
 * P2025 — record not found → NotFoundError
 */
export const handlePrismaError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        // Extract the conflicting field name from the error meta
        const fields = (error.meta?.target as string[])?.join(', ') ?? 'field';
        throw new BadRequestError(`A record with this ${fields} already exists`);
      }
      case 'P2025':
        throw new NotFoundError('Record not found');
      default:
        break;
    }
  }
  throw error;
};

/**
 * True when `err` is a Prisma known request error with the given code
 * (e.g. 'P2002' unique violation, 'P2003' FK violation, 'P2025' not found).
 * Use in catch blocks that need to branch on a specific code; use
 * handlePrismaError when the default P2002/P2025 translation is enough.
 */
export const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
