import { activityRepository } from '../../src/modules/activity/activity.repository';
import { prisma } from '../../src/config/prisma';
import { UserActivityType } from '@prisma/client';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    userActivity: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('activityRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a row with the input passed straight through as data', async () => {
      const input = {
        userId: 'user-1',
        type: UserActivityType.AD_CREATED,
        title: 'تم نشر إعلان جديد',
        description: 'iPhone 13',
        entityType: 'AD',
        entityId: 'ad-1',
      };
      (prisma.userActivity.create as jest.Mock).mockResolvedValue({ id: 'act-1', ...input });

      await activityRepository.create(input);

      expect(prisma.userActivity.create).toHaveBeenCalledWith({ data: input });
    });
  });

  describe('findManyForUser', () => {
    it('scopes the query to userId with no type/group/q filters when none are given', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', {});

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.userActivity.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('applies page/limit as skip/take', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', { page: 3, limit: 10 });

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('filters by an exact type when query.type is given', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', { type: UserActivityType.AD_CREATED });

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', type: UserActivityType.AD_CREATED },
        })
      );
    });

    it('filters by a groupTypes list (type: { in: [...] }) when groupTypes is given and type is not', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', {}, [
        UserActivityType.AD_CREATED,
        UserActivityType.AD_UPDATED,
      ]);

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            type: { in: [UserActivityType.AD_CREATED, UserActivityType.AD_UPDATED] },
          },
        })
      );
    });

    it('lets an exact type win over groupTypes when both are given', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser(
        'user-1',
        { type: UserActivityType.PRODUCT_CREATED },
        [UserActivityType.AD_CREATED, UserActivityType.AD_UPDATED]
      );

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', type: UserActivityType.PRODUCT_CREATED },
        })
      );
    });

    it('adds a case-insensitive title/description OR clause when q is given', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', { q: 'iPhone' });

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            OR: [
              { title: { contains: 'iPhone', mode: 'insensitive' } },
              { description: { contains: 'iPhone', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('combines a type filter and q in the same where clause', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', {
        type: UserActivityType.AD_CREATED,
        q: 'iPhone',
      });

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            type: UserActivityType.AD_CREATED,
            OR: [
              { title: { contains: 'iPhone', mode: 'insensitive' } },
              { description: { contains: 'iPhone', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('returns activities and total from the resolved Promise.all', async () => {
      const rows = [{ id: 'act-1' }, { id: 'act-2' }];
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue(rows);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(2);

      const result = await activityRepository.findManyForUser('user-1', {});

      expect(result).toEqual({ activities: rows, total: 2 });
    });

    it('orders by createdAt desc', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userActivity.count as jest.Mock).mockResolvedValue(0);

      await activityRepository.findManyForUser('user-1', {});

      expect(prisma.userActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });
  });
});
