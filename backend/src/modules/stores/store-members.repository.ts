import { prisma } from '../../config/prisma';
import { Prisma, StoreMember, StoreMemberRole, StoreMemberStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type StoreMemberWithUser = Prisma.StoreMemberGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        email: true;
        avatarUrl: true;
        city: true;
      };
    };
    invitedBy: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

const memberInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      city: true,
    },
  },
  invitedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export const storeMembersRepository = {
  findById: (id: string): Promise<StoreMember | null> =>
    prisma.storeMember.findUnique({ where: { id } }),

  findByIdWithUser: (id: string): Promise<StoreMemberWithUser | null> =>
    prisma.storeMember.findUnique({
      where: { id },
      include: memberInclude,
    }),

  findActiveOrPending: (storeId: string, userId: string): Promise<StoreMember | null> =>
    prisma.storeMember.findFirst({
      where: {
        storeId,
        userId,
        status: { in: [StoreMemberStatus.PENDING, StoreMemberStatus.ACTIVE] },
      },
    }),

  findActive: (storeId: string, userId: string): Promise<StoreMember | null> =>
    prisma.storeMember.findFirst({
      where: {
        storeId,
        userId,
        status: StoreMemberStatus.ACTIVE,
      },
    }),

  create: (data: {
    storeId: string;
    userId: string;
    role: StoreMemberRole;
    invitedById: string;
    status?: StoreMemberStatus;
  }): Promise<StoreMember> =>
    prisma.storeMember.create({
      data: {
        storeId: data.storeId,
        userId: data.userId,
        role: data.role,
        invitedById: data.invitedById,
        status: data.status ?? StoreMemberStatus.PENDING,
      },
    }),

  createWithUser: (data: {
    storeId: string;
    userId: string;
    role: StoreMemberRole;
    invitedById: string;
    status?: StoreMemberStatus;
  }): Promise<StoreMemberWithUser> =>
    prisma.storeMember.create({
      data: {
        storeId: data.storeId,
        userId: data.userId,
        role: data.role,
        invitedById: data.invitedById,
        status: data.status ?? StoreMemberStatus.PENDING,
      },
      include: memberInclude,
    }),

  updateRole: (id: string, role: StoreMemberRole): Promise<StoreMember> =>
    prisma.storeMember.update({
      where: { id },
      data: { role },
    }),

  accept: (id: string): Promise<StoreMember> =>
    prisma.storeMember.update({
      where: { id },
      data: {
        status: StoreMemberStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    }),

  softRemove: (id: string): Promise<StoreMember> =>
    prisma.storeMember.update({
      where: { id },
      data: {
        status: StoreMemberStatus.REMOVED,
        removedAt: new Date(),
      },
    }),

  findManyByStoreId: async (
    storeId: string,
    query: { page?: number; limit?: number; status?: StoreMemberStatus }
  ): Promise<{ members: StoreMemberWithUser[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.StoreMemberWhereInput = {
      storeId,
      status: status ?? { in: [StoreMemberStatus.PENDING, StoreMemberStatus.ACTIVE] },
    };

    const [members, total] = await Promise.all([
      prisma.storeMember.findMany({
        where,
        include: memberInclude,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      prisma.storeMember.count({ where }),
    ]);

    return { members, total };
  },

  /** Ordered by invitedAt ASC so multi-store staff resolution is deterministic. */
  findActiveByUserId: (userId: string): Promise<StoreMember[]> =>
    prisma.storeMember.findMany({
      where: {
        userId,
        status: StoreMemberStatus.ACTIVE,
      },
      orderBy: { invitedAt: 'asc' },
    }),

  countActiveByStoreId: (storeId: string): Promise<number> =>
    prisma.storeMember.count({
      where: {
        storeId,
        status: StoreMemberStatus.ACTIVE,
      },
    }),
};
