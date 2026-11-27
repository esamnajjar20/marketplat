import { authRepository } from '../../src/modules/identity/auth/auth.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const createData = {
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  phone: '+966501234567',
  city: 'Gaza',
};

describe('authRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findByEmail', () => {
    it('queries by email', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      await authRepository.findByEmail(' Test@Example.com ');
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { email: { equals: 'test@example.com', mode: 'insensitive' } },
        take: 2,
      });
    });

    it('returns null when no user matches', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const result = await authRepository.findByEmail('missing@example.com');
      expect(result).toBeNull();
    });

    it('fails closed when legacy case variants create an ambiguous identity', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-1' }, { id: 'user-2' },
      ]);
      await expect(authRepository.findByEmail('user@example.com'))
        .rejects.toMatchObject({ code: 'EMAIL_IDENTITY_AMBIGUOUS' });
    });
  });

  describe('findByPhone', () => {
    it('queries by phone', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await authRepository.findByPhone('+966501234567');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '+966501234567' } });
    });
  });

  describe('create', () => {
    it('creates a user with the given data', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'user-1', ...createData });
      const result = await authRepository.create(createData);
      expect(prisma.user.create).toHaveBeenCalledWith({ data: createData });
      expect(result).toEqual({ id: 'user-1', ...createData });
    });

    it('creates a user without optional phone/city', async () => {
      const { phone, city, ...minimal } = createData;
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'user-1', ...minimal });
      await authRepository.create(minimal);
      expect(prisma.user.create).toHaveBeenCalledWith({ data: minimal });
    });

    it('translates a P2002 unique-constraint violation into BadRequestError via handlePrismaError', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['email'] },
      });
      (prisma.user.create as jest.Mock).mockRejectedValue(p2002Error);

      await expect(authRepository.create(createData)).rejects.toThrow(BadRequestError);
      await expect(authRepository.create(createData)).rejects.toThrow(
        'A record with this email already exists'
      );
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('Connection lost'));

      await expect(authRepository.create(createData)).rejects.toThrow('Connection lost');
    });
  });
});
