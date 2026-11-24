import { storeMembersService } from '../../src/modules/commerce/stores/store-members.service';
import { storesRepository } from '../../src/modules/commerce/stores/stores.repository';
import { sellersRepository } from '../../src/modules/identity/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/modules/commerce/stores/store-members.repository');
jest.mock('../../src/modules/commerce/stores/stores.repository');
jest.mock('../../src/modules/identity/sellers/sellers.repository');
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    storeMember: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  },
}));
jest.mock('../../src/shared/audit/auditLog', () => ({ auditLog: jest.fn(), AuditEvent: {} }));
jest.mock('../../src/modules/engagement/notifications/notifications.service', () => ({
  notificationEvents: { onStoreMemberInvited: jest.fn().mockResolvedValue(undefined) },
}));

const actorId = 'owner-user';
const storeId = 'store-1';
const invitedUserId = 'invitee-user';
const accessStore = {
  id: storeId,
  name: 'Test store',
  plan: 'FREE',
  status: 'ACTIVE',
  sellerProfileId: 'seller-1',
  sellerProfile: { id: 'seller-1', userId: actorId, suspended: false },
} as any;

const createTransaction = () => {
  const tx = {
    storeMember: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
  return tx;
};

describe('store member plan-seat capacity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storesRepository.findByIdForAccess as jest.Mock).mockResolvedValue(accessStore);
    (storesRepository.findBySlugForAccess as jest.Mock).mockResolvedValue(null);
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
  });

  it('counts PENDING invitations as reserved seats before creating another invitation', async () => {
    const tx = createTransaction();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: invitedUserId,
      email: 'invitee@example.com',
      name: 'Invitee',
      isActive: true,
    });
    tx.storeMember.findFirst.mockResolvedValue(null);
    tx.storeMember.count.mockResolvedValue(5); // FREE plan cap, including pending invites.

    await expect(
      storeMembersService.invite(actorId, storeId, {
        email: 'invitee@example.com',
        role: 'EDITOR',
      }),
    ).rejects.toMatchObject({ code: 'STORE_MEMBER_LIMIT' });

    expect(tx.storeMember.count).toHaveBeenCalledWith({
      where: { storeId, status: { in: ['PENDING', 'ACTIVE'] } },
    });
    expect(tx.storeMember.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('allows an invitee to accept when the invitation already reserves the final seat', async () => {
    const tx = createTransaction();
    tx.storeMember.findUnique.mockResolvedValue({
      id: 'invite-1',
      userId: invitedUserId,
      storeId,
      status: 'PENDING',
      store: { plan: 'FREE' },
    });
    tx.storeMember.count.mockResolvedValue(5);
    tx.storeMember.updateMany.mockResolvedValue({ count: 1 });
    tx.storeMember.findUniqueOrThrow.mockResolvedValue({ id: 'invite-1', status: 'ACTIVE' });

    await expect(storeMembersService.acceptInvite(invitedUserId, 'invite-1')).resolves.toMatchObject({
      id: 'invite-1',
      status: 'ACTIVE',
    });
    expect(tx.storeMember.updateMany).toHaveBeenCalledWith({
      where: { id: 'invite-1', userId: invitedUserId, status: 'PENDING' },
      data: expect.objectContaining({ status: 'ACTIVE', acceptedAt: expect.any(Date) }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('prevents acceptance when legacy pending and active memberships exceed the current plan cap', async () => {
    const tx = createTransaction();
    tx.storeMember.findUnique.mockResolvedValue({
      id: 'invite-1',
      userId: invitedUserId,
      storeId,
      status: 'PENDING',
      store: { plan: 'FREE' },
    });
    tx.storeMember.count.mockResolvedValue(6);

    await expect(storeMembersService.acceptInvite(invitedUserId, 'invite-1')).rejects.toMatchObject({
      code: 'STORE_MEMBER_LIMIT',
    });
    expect(tx.storeMember.updateMany).not.toHaveBeenCalled();
  });
});
