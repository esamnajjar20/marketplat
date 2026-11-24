import { FollowTargetType, Prisma } from '@prisma/client';
import { followsService } from '../../src/modules/engagement/follows/follows.service';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    storeDetails: { findUnique: jest.fn() },
  },
}));
jest.mock('../../src/modules/engagement/follows/follows.repository', () => ({
  followsRepository: {},
}));
jest.mock('../../src/modules/engagement/notifications', () => ({
  notificationEvents: {},
}));

const transactionClient = {
  follow: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  storeFollower: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('followsService.toggle for stores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.storeDetails.findUnique as jest.Mock).mockResolvedValue({
      id: 'store-1',
      name: 'Store',
      status: 'ACTIVE',
      sellerProfile: { userId: 'owner-1' },
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
  });

  it('creates both store-follow representations in one transaction', async () => {
    transactionClient.follow.findUnique.mockResolvedValue(null);

    const result = await followsService.toggle('viewer-1', {
      targetType: FollowTargetType.STORE,
      targetId: 'store-1',
    });

    expect(result.action).toBe('followed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.follow.create).toHaveBeenCalledWith({
      data: { followerId: 'viewer-1', targetType: FollowTargetType.STORE, targetId: 'store-1' },
    });
    expect(transactionClient.storeFollower.upsert).toHaveBeenCalledWith({
      where: { userId_storeId: { userId: 'viewer-1', storeId: 'store-1' } },
      create: { userId: 'viewer-1', storeId: 'store-1' },
      update: {},
    });
  });



  it('treats a concurrent create collision as already followed', async () => {
    transactionClient.follow.findUnique.mockResolvedValue(null);
    transactionClient.follow.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    const result = await followsService.toggle('viewer-1', {
      targetType: FollowTargetType.STORE,
      targetId: 'store-1',
    });

    expect(result.action).toBe('followed');
  });

  it('treats a concurrent delete winner as already unfollowed', async () => {
    transactionClient.follow.findUnique.mockResolvedValue({ id: 'follow-1' });
    transactionClient.follow.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
        code: 'P2025',
        clientVersion: '5.22.0',
      }),
    );

    const result = await followsService.toggle('viewer-1', {
      targetType: FollowTargetType.STORE,
      targetId: 'store-1',
    });

    expect(result.action).toBe('unfollowed');
    expect(transactionClient.storeFollower.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes both store-follow representations in one transaction', async () => {
    transactionClient.follow.findUnique.mockResolvedValue({ id: 'follow-1' });

    const result = await followsService.toggle('viewer-1', {
      targetType: FollowTargetType.STORE,
      targetId: 'store-1',
    });

    expect(result.action).toBe('unfollowed');
    expect(transactionClient.follow.delete).toHaveBeenCalledWith({
      where: {
        followerId_targetType_targetId: {
          followerId: 'viewer-1',
          targetType: FollowTargetType.STORE,
          targetId: 'store-1',
        },
      },
    });
    expect(transactionClient.storeFollower.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'viewer-1', storeId: 'store-1' },
    });
    expect(transactionClient.storeFollower.upsert).not.toHaveBeenCalled();
  });
});
