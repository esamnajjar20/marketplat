import { authRepository } from '../../src/modules/auth/auth.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
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
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await authRepository.findByEmail('test@example.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('returns null when no user matches', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await authRepository.findByEmail('missing@example.com');
      expect(result).toBeNull();
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
