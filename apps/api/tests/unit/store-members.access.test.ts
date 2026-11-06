import { requireStoreAccess, requireStoreAccessForProducts } from '../../src/modules/stores/store-members.service';
import { storeMembersRepository } from '../../src/modules/stores/store-members.repository';
import { storesRepository } from '../../src/modules/stores/stores.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';

jest.mock('../../src/modules/stores/store-members.repository');
jest.mock('../../src/modules/stores/stores.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/config/prisma', () => ({ prisma: {} }));
jest.mock('../../src/modules/notifications/notifications.service', () => ({
  notificationEvents: {},
}));
jest.mock('../../src/shared/utils/auditLog', () => ({
  auditLog: jest.fn(),
  AuditEvent: {},
}));

const userId = 'staff-1';
const store = { id: 'store-1', sellerProfileId: 'owner-seller', status: 'ACTIVE' } as any;
const accessStore = { ...store, sellerProfile: { id: 'owner-seller', userId: 'store-owner', suspended: false } };

const membership = (role: 'MANAGER' | 'EDITOR' | 'STAFF', storeId = store.id, invitedAt = '2026-01-01') =>
  ({ userId, storeId, role, status: 'ACTIVE', invitedAt: new Date(invitedAt) }) as any;

describe('requireStoreAccessForProducts (audit H1: members, not just owners)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Caller has no seller profile of their own → staff path.
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
    (storesRepository.findById as jest.Mock).mockResolvedValue(store);
    (storesRepository.findByIdForAccess as jest.Mock).mockResolvedValue(accessStore);
    (storesRepository.findBySlugForAccess as jest.Mock).mockResolvedValue(null);
    (storesRepository.findManyForStaffAccess as jest.Mock).mockResolvedValue([
      { ...store, sellerProfile: { suspended: false } },
    ]);
  });

  // Role × capability matrix, mirrors ROLE_CAPABILITIES.
  const matrix: Array<['MANAGER' | 'EDITOR' | 'STAFF', 'manageProducts' | 'managePromotions' | 'manageCollections', boolean]> = [
    ['MANAGER', 'manageProducts', true],
    ['MANAGER', 'managePromotions', true],
    ['MANAGER', 'manageCollections', true],
    ['EDITOR', 'manageProducts', true],
    ['EDITOR', 'managePromotions', false],
    ['EDITOR', 'manageCollections', false],
    ['STAFF', 'manageProducts', false],
    ['STAFF', 'managePromotions', false],
    ['STAFF', 'manageCollections', false],
  ];

  it.each(matrix)('%s + %s → allowed=%s', async (role, capability, allowed) => {
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([membership(role)]);

    const call = requireStoreAccessForProducts(userId, capability);

    if (allowed) {
      await expect(call).resolves.toMatchObject(store);
    } else {
      await expect(call).rejects.toThrow(BadRequestError);
    }
  });

  it('defaults to the manageProducts capability', async () => {
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([membership('EDITOR')]);
    await expect(requireStoreAccessForProducts(userId)).resolves.toMatchObject(store);
  });

  it('prefers the caller\'s own store over a membership elsewhere', async () => {
    const own = { id: 'own-store', sellerProfileId: 'me', status: 'ACTIVE' } as any;
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'me', suspended: false });
    (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(own);
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([membership('MANAGER')]);

    await expect(requireStoreAccessForProducts(userId, 'manageProducts')).resolves.toEqual(own);
  });

  it('rejects a suspended owner acting on their own store', async () => {
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'me', suspended: true });

    await expect(requireStoreAccessForProducts(userId)).rejects.toThrow(ForbiddenError);
  });

  it('blocks staff writes while the store owner is suspended', async () => {
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([membership('MANAGER')]);
    (storesRepository.findManyForStaffAccess as jest.Mock).mockResolvedValue([
      { ...store, sellerProfile: { suspended: true } },
    ]);

    await expect(requireStoreAccessForProducts(userId)).rejects.toThrow(ForbiddenError);
  });

  it('skips BLOCKED stores and falls through to the next membership (oldest first)', async () => {
    const blocked = { ...store, id: 'store-blocked', status: 'BLOCKED' };
    const second = { ...store, id: 'store-2' };
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([
      membership('MANAGER', 'store-blocked', '2026-01-01'),
      membership('EDITOR', 'store-2', '2026-02-01'),
    ]);
    (storesRepository.findManyForStaffAccess as jest.Mock).mockResolvedValue([
      { ...blocked, sellerProfile: { suspended: false } },
      { ...second, sellerProfile: { suspended: false } },
    ]);

    await expect(requireStoreAccessForProducts(userId)).resolves.toEqual({
      ...second,
      sellerProfile: { suspended: false },
    });
  });

  it('batches owner access checks for all eligible memberships into one query', async () => {
    const first = { ...store, id: 'store-oldest' };
    const second = { ...store, id: 'store-newer' };
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([
      membership('MANAGER', second.id, '2026-02-01'),
      membership('EDITOR', first.id, '2026-01-01'),
    ]);
    (storesRepository.findManyForStaffAccess as jest.Mock).mockResolvedValue([
      { ...second, sellerProfile: { suspended: false } },
      { ...first, sellerProfile: { suspended: false } },
    ]);

    await expect(requireStoreAccessForProducts(userId)).resolves.toMatchObject({ id: first.id });
    expect(storesRepository.findManyForStaffAccess).toHaveBeenCalledTimes(1);
    expect(storesRepository.findManyForStaffAccess).toHaveBeenCalledWith([second.id, first.id]);
    expect(storesRepository.findById).not.toHaveBeenCalled();
    expect(sellersRepository.findById).not.toHaveBeenCalled();
  });

  it('throws BadRequestError (STORE_REQUIRED) when the user has neither a store nor a membership', async () => {
    (storeMembersRepository.findActiveByUserId as jest.Mock).mockResolvedValue([]);

    await expect(requireStoreAccessForProducts(userId)).rejects.toMatchObject({ code: 'STORE_REQUIRED' });
  });

  it('resolves an owner from the joined store row without extra seller queries', async () => {
    (storesRepository.findByIdForAccess as jest.Mock).mockResolvedValue({
      ...accessStore,
      sellerProfile: { ...accessStore.sellerProfile, userId },
    });

    await expect(requireStoreAccess(userId, store.id, 'manageAds')).resolves.toMatchObject({
      kind: 'owner',
      store: { id: store.id },
    });
    expect(storesRepository.findByIdForAccess).toHaveBeenCalledTimes(1);
    expect(sellersRepository.findById).not.toHaveBeenCalled();
    expect(sellersRepository.findByUserId).not.toHaveBeenCalled();
    expect(storeMembersRepository.findActive).not.toHaveBeenCalled();
  });

  it('uses the joined store row for staff authorization and fetches only the membership', async () => {
    (storeMembersRepository.findActive as jest.Mock).mockResolvedValue(membership('MANAGER'));

    await expect(requireStoreAccess(userId, store.id, 'manageAds')).resolves.toMatchObject({
      kind: 'member',
      role: 'MANAGER',
    });
    expect(storesRepository.findByIdForAccess).toHaveBeenCalledTimes(1);
    expect(sellersRepository.findById).not.toHaveBeenCalled();
    expect(sellersRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('blocks capability writes to a BLOCKED store for owners and members', async () => {
    (storesRepository.findByIdForAccess as jest.Mock).mockResolvedValue({ ...accessStore, status: 'BLOCKED' });
    (storeMembersRepository.findActive as jest.Mock).mockResolvedValue(membership('MANAGER'));

    await expect(requireStoreAccess(userId, store.id, 'manageAds')).rejects.toMatchObject({ code: 'STORE_BLOCKED' });
  });

  it('blocks capability writes when the owning seller is suspended', async () => {
    (storesRepository.findByIdForAccess as jest.Mock).mockResolvedValue({
      ...accessStore,
      sellerProfile: { ...accessStore.sellerProfile, suspended: true },
    });
    (storeMembersRepository.findActive as jest.Mock).mockResolvedValue(membership('MANAGER'));

    await expect(requireStoreAccess(userId, store.id, 'manageAds')).rejects.toMatchObject({ code: 'STORE_OWNER_SUSPENDED' });
  });

  it('keeps read-only access to the member list available for a blocked store', async () => {
    (storesRepository.findByIdForAccess as jest.Mock).mockResolvedValue({ ...accessStore, status: 'BLOCKED' });
    (storeMembersRepository.findActive as jest.Mock).mockResolvedValue(membership('MANAGER'));

    await expect(requireStoreAccess(userId, store.id)).resolves.toMatchObject({ kind: 'member', store: { status: 'BLOCKED' } });
  });
});
