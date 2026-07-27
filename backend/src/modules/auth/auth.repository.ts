import { prisma } from '../../config/prisma';
import { User } from '@prisma/client';
import { handlePrismaError } from '../../shared/utils/prismaErrors';

export const authRepository = {
  findByEmail: async (email: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { email } }),

  findByPhone: async (phone: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { phone } }),

  // D-04: wrap create in handlePrismaError to catch P2002 race conditions
  // (two simultaneous registrations with same email/phone)
  create: async (data: {
    name: string;
    email: string;
    passwordHash: string;
    phone?: string;
    city?: string;
  }): Promise<User> => {
    try {
      return await prisma.user.create({ data });
    } catch (error) {
      return handlePrismaError(error);
    }
  },
};
