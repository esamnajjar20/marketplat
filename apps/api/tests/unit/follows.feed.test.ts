import { followsService } from '../../src/modules/follows/follows.service';
import { followFeedQuerySchema, MAX_FEED_PAGE } from '../../src/modules/follows/follows.validation';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    ad: { findMany: jest.fn(), count: jest.fn() },
    product: { findMany: jest.fn(), count: jest.fn() },
    serviceListing: { findMany: jest.fn(), count: jest.fn() },
    storeDetails: { findMany: jest.fn() },
    serviceProviderDetails: { findMany: jest.fn() },
  },
}));
jest.mock('../../src/modules/follows/follows.repository', () => ({ followsRepository: {} }));
jest.mock('../../src/modules/stores/store-followers.repository', () => ({ storeFollowersRepository: {} }));
jest.mock('../../src/modules/notifications', () => ({ notificationEvents: {} }));

const at = (iso: string) => new Date(iso);

describe('followsService.getFollowingFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(followsService, 'getFollowedTargetIds').mockImplementation(async (_id: string, type: any) =>
      type === 'USER' ? ['u1'] : [],
    );
    (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.serviceProviderDetails.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.ad.count as jest.Mock).mockResolvedValue(0);
    (prisma.product.count as jest.Mock).mockResolvedValue(0);
    (prisma.serviceListing.count as jest.Mock).mockResolvedValue(0);
  });

  it('fetches skip+limit rows per stream so page 2 is complete', async () => {
    const ads = Array.from({ length: 4 }, (_, i) => ({
      id: `a${i}`, title: `t${i}`, price: 1, images: [], city: null,
      createdAt: at(`2026-01-0${4 - i}T00:00:00Z`), userId: 'u1', storeId: null, categoryId: 'c',
    }));
    (prisma.ad.findMany as jest.Mock).mockResolvedValue(ads);
    (prisma.ad.count as jest.Mock).mockResolvedValue(4);

    const res = await followsService.getFollowingFeed('me', 2, 2);

    expect((prisma.ad.findMany as jest.Mock).mock.calls[0][0].take).toBe(4);
    expect(res.items.map((i) => i.id)).toEqual(['a2', 'a3']);
    expect(res.meta.total).toBe(4);
    expect(res.meta.page).toBe(2);
  });

  it('merges streams by createdAt desc and totals all three counts', async () => {
    (prisma.ad.findMany as jest.Mock).mockResolvedValue([
      { id: 'a1', title: 'a', price: 1, images: [], city: null, createdAt: at('2026-01-01T00:00:00Z'), userId: 'u1', storeId: null, categoryId: 'c' },
    ]);
    (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', title: 's', price: 1, images: [], createdAt: at('2026-01-03T00:00:00Z'), providerId: 'p', categoryId: 'c' },
    ]);
    (prisma.ad.count as jest.Mock).mockResolvedValue(1);
    (prisma.serviceListing.count as jest.Mock).mockResolvedValue(1);
    (prisma.product.count as jest.Mock).mockResolvedValue(5);

    const res = await followsService.getFollowingFeed('me', 1, 10);

    expect(res.items.map((i) => i.id)).toEqual(['s1', 'a1']);
    expect(res.meta.total).toBe(7);
  });

  it('rejects pages beyond the supported depth instead of silently clamping', async () => {
    await expect(followsService.getFollowingFeed('me', MAX_FEED_PAGE + 1, 20)).rejects.toThrow(/cannot exceed/);
    expect(prisma.ad.findMany).not.toHaveBeenCalled();
  });
});

describe('followFeedQuerySchema', () => {
  it('accepts the maximum page and rejects deeper ones', () => {
    expect(followFeedQuerySchema.safeParse({ query: { page: String(MAX_FEED_PAGE) } }).success).toBe(true);
    expect(followFeedQuerySchema.safeParse({ query: { page: String(MAX_FEED_PAGE + 1) } }).success).toBe(false);
  });
});
