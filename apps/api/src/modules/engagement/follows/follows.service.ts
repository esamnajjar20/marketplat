import { reportBackgroundFailure } from '../../../shared/jobs/backgroundTask';
import { FollowTargetType, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { followsRepository } from './follows.repository';
import { MAX_FEED_PAGE, ToggleFollowInput } from './follows.validation';
import { BadRequestError } from '../../../shared/errors/BadRequestError';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { isPrismaError } from '../../../shared/db/prismaErrors';
import { buildPaginationMeta } from '../../../shared/http/pagination';
import { notificationEvents } from '../notifications';

const parseCategoryTarget = (
  targetId: string
): { kind: 'AD' | 'PRODUCT' | 'SERVICE'; id: string } => {
  const [kind, id] = targetId.split(':', 2);
  if ((kind !== 'AD' && kind !== 'PRODUCT' && kind !== 'SERVICE') || !id) {
    throw new BadRequestError('Invalid category target', 'INVALID_CATEGORY_TARGET');
  }
  return { kind, id };
};

const targetExists = async (targetType: FollowTargetType, targetId: string, actorId: string) => {
  if (targetType === FollowTargetType.USER) {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        name: true,
        isActive: true,
        sellerProfile: { select: { suspended: true } },
      },
    });
    if (!user || !user.isActive) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    if (user.sellerProfile?.suspended) {
      throw new ForbiddenError('This account is blocked or unavailable.', 'PUBLIC_ACCOUNT_BLOCKED');
    }
    if (targetId === actorId)
      throw new BadRequestError('You cannot follow yourself', 'CANNOT_FOLLOW_SELF');
    const blocked = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: actorId, blockedId: targetId },
          { blockerId: targetId, blockedId: actorId },
        ],
      },
      select: { id: true },
    });
    if (blocked) throw new ForbiddenError('You cannot follow this user', 'FOLLOW_BLOCKED');
    return user;
  }

  if (targetType === FollowTargetType.STORE) {
    const store = await prisma.storeDetails.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        name: true,
        status: true,
        sellerProfile: {
          select: {
            userId: true,
            suspended: true,
            user: { select: { isActive: true } },
          },
        },
      },
    });
    if (!store || store.status !== 'ACTIVE')
      throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    if (store.sellerProfile.suspended || !store.sellerProfile.user.isActive) {
      throw new ForbiddenError('This account is blocked or unavailable.', 'PUBLIC_ACCOUNT_BLOCKED');
    }
    if (store.sellerProfile.userId === actorId)
      throw new ForbiddenError('You cannot follow your own store', 'CANNOT_FOLLOW_OWN_STORE');
    return store;
  }

  const categoryTarget = parseCategoryTarget(targetId);
  if (categoryTarget.kind === 'AD') {
    const category = await prisma.category.findUnique({
      where: { id: categoryTarget.id },
      select: { id: true, name: true, nameAr: true },
    });
    if (!category) throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    return category;
  }
  if (categoryTarget.kind === 'PRODUCT') {
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryTarget.id },
      select: { id: true, name: true, nameAr: true, isActive: true },
    });
    if (!category || !category.isActive)
      throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    return category;
  }
  const category = await prisma.serviceCategory.findUnique({
    where: { id: categoryTarget.id },
    select: { id: true, name: true, nameAr: true, isActive: true },
  });
  if (!category || !category.isActive)
    throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
  return category;
};

const displayNameForTarget = (target: any, targetType: FollowTargetType) =>
  targetType === FollowTargetType.CATEGORY ? (target.nameAr ?? target.name) : target.name;

const hydrateFollowItems = async (
  items: Array<{
    id: string;
    followerId: string;
    targetType: FollowTargetType;
    targetId: string;
    createdAt: Date;
  }>,
  mode: 'following' | 'followers'
) => {
  const userIds = new Set<string>();
  const storeIds = new Set<string>();
  const categoryIds = {
    AD: new Set<string>(),
    PRODUCT: new Set<string>(),
    SERVICE: new Set<string>(),
  };
  items.forEach(item => {
    if (mode === 'followers' || item.targetType === FollowTargetType.USER)
      userIds.add(mode === 'followers' ? item.followerId : item.targetId);
    if (mode === 'following' && item.targetType === FollowTargetType.STORE)
      storeIds.add(item.targetId);
    if (mode === 'following' && item.targetType === FollowTargetType.CATEGORY) {
      const parsed = parseCategoryTarget(item.targetId);
      categoryIds[parsed.kind].add(parsed.id);
    }
  });
  const [users, stores, adCategories, productCategories, serviceCategories] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({
          where: {
          id: { in: Array.from(userIds) },
          isActive: true,
          OR: [
            { sellerProfile: { is: null } },
            { sellerProfile: { is: { suspended: false } } },
          ],
        },
          select: { id: true, name: true, avatarUrl: true, city: true },
        })
      : [],
    storeIds.size
      ? prisma.storeDetails.findMany({
          where: {
            id: { in: Array.from(storeIds) },
            status: 'ACTIVE',
            sellerProfile: { suspended: false, user: { isActive: true } },
          },
          select: { id: true, name: true, logoUrl: true, city: true },
        })
      : [],
    categoryIds.AD.size
      ? prisma.category.findMany({
          where: { id: { in: Array.from(categoryIds.AD) } },
          select: { id: true, name: true, nameAr: true, slug: true },
        })
      : [],
    categoryIds.PRODUCT.size
      ? prisma.productCategory.findMany({
          where: { id: { in: Array.from(categoryIds.PRODUCT) } },
          select: { id: true, name: true, nameAr: true, slug: true },
        })
      : [],
    categoryIds.SERVICE.size
      ? prisma.serviceCategory.findMany({
          where: { id: { in: Array.from(categoryIds.SERVICE) } },
          select: { id: true, name: true, nameAr: true, slug: true },
        })
      : [],
  ]);
  const userMap = new Map(users.map(u => [u.id, u]));
  const storeMap = new Map(stores.map(x => [x.id, x]));
  type CatEntry = {
    id: string;
    name: string;
    nameAr: string;
    slug: string;
    categoryType: 'AD' | 'PRODUCT' | 'SERVICE';
  };
  const categoryMap = new Map<string, CatEntry>([
    ...adCategories.map((x): [string, CatEntry] => [`AD:${x.id}`, { ...x, categoryType: 'AD' }]),
    ...productCategories.map((x): [string, CatEntry] => [
      `PRODUCT:${x.id}`,
      { ...x, categoryType: 'PRODUCT' },
    ]),
    ...serviceCategories.map((x): [string, CatEntry] => [
      `SERVICE:${x.id}`,
      { ...x, categoryType: 'SERVICE' },
    ]),
  ]);
  return items
    .map(item => ({
      ...item,
      target:
        item.targetType === FollowTargetType.USER
          ? (userMap.get(item.targetId) ?? null)
          : item.targetType === FollowTargetType.STORE
            ? (storeMap.get(item.targetId) ?? null)
            : (categoryMap.get(item.targetId) ?? null),
      follower: mode === 'followers' ? (userMap.get(item.followerId) ?? null) : undefined,
    }))
    .filter(item => item.target !== null && (mode !== 'followers' || item.follower !== null));
};

export const followsService = {
  toggle: async (followerId: string, input: ToggleFollowInput) => {
    await targetExists(input.targetType, input.targetId, followerId);

    // Store follows are represented in two read models for historical API
    // compatibility. Keep both rows in one transaction. Upsert repairs a
    // stale secondary-only row when following; deleting the secondary row
    // on unfollow also clears any stale counterpart.
    if (input.targetType === FollowTargetType.STORE) {
      let action: 'followed' | 'unfollowed';
      try {
        action = await prisma.$transaction(async tx => {
          const key = {
            followerId_targetType_targetId: {
              followerId,
              targetType: FollowTargetType.STORE,
              targetId: input.targetId,
            },
          };
          const existing = await tx.follow.findUnique({ where: key, select: { id: true } });
          if (existing) {
            await tx.follow.delete({ where: key });
            await tx.storeFollower.deleteMany({
              where: { userId: followerId, storeId: input.targetId },
            });
            return 'unfollowed';
          }

          await tx.follow.create({
            data: { followerId, targetType: FollowTargetType.STORE, targetId: input.targetId },
          });
          await tx.storeFollower.upsert({
            where: { userId_storeId: { userId: followerId, storeId: input.targetId } },
            create: { userId: followerId, storeId: input.targetId },
            update: {},
          });
          return 'followed';
        });
      } catch (err) {
        // A concurrent request may have committed the same follow first.
        // Its transaction also commits the StoreFollower row, so the
        // unique collision is a successful idempotent outcome here.
        if (isPrismaError(err, 'P2002')) {
          return {
            action: 'followed' as const,
            targetType: input.targetType,
            targetId: input.targetId,
          };
        }
        if (isPrismaError(err, 'P2025')) {
          return {
            action: 'unfollowed' as const,
            targetType: input.targetType,
            targetId: input.targetId,
          };
        }
        throw err;
      }
      return { action, targetType: input.targetType, targetId: input.targetId };
    }

    const existing = await followsRepository.find(followerId, input.targetType, input.targetId);
    if (existing) {
      try {
        await followsRepository.delete(followerId, input.targetType, input.targetId);
      } catch (err) {
        if (!isPrismaError(err, 'P2025')) throw err;
      }
      return {
        action: 'unfollowed' as const,
        targetType: input.targetType,
        targetId: input.targetId,
      };
    }

    try {
      await followsRepository.create(followerId, input.targetType, input.targetId);
    } catch (err) {
      if (!isPrismaError(err, 'P2002')) throw err;
      return {
        action: 'followed' as const,
        targetType: input.targetType,
        targetId: input.targetId,
      };
    }

    if (input.targetType === FollowTargetType.USER) {
      void notificationEvents
        .onNewFollower(input.targetId, followerId)
        .catch(error =>
          reportBackgroundFailure(
            'apps/api/src/modules/engagement/follows/follows.service.ts',
            error
          )
        );
    }
    return { action: 'followed' as const, targetType: input.targetType, targetId: input.targetId };
  },

  status: async (followerId: string, targetType: FollowTargetType, targetId: string) =>
    Boolean(await followsRepository.find(followerId, targetType, targetId)),

  getFollowing: async (
    followerId: string,
    targetType: FollowTargetType | undefined,
    page = 1,
    limit = 20
  ) => {
    const result = await followsRepository.listFollowing(followerId, targetType, page, limit);
    const items = await hydrateFollowItems(result.items, 'following');
    return { items, meta: buildPaginationMeta(result.total, page, limit) };
  },

  getFollowers: async (targetType: FollowTargetType, targetId: string, page = 1, limit = 20) => {
    const result = await followsRepository.listFollowers(targetType, targetId, page, limit);
    const items = await hydrateFollowItems(result.items, 'followers');
    return { items, meta: buildPaginationMeta(result.total, page, limit) };
  },

  getUserFollowers: async (userId: string, page = 1, limit = 20) => {
    await targetExists(FollowTargetType.USER, userId, userId).catch(err => {
      if (err instanceof BadRequestError && err.code === 'CANNOT_FOLLOW_SELF') return null;
      throw err;
    });
    return followsService.getFollowers(FollowTargetType.USER, userId, page, limit);
  },

  getUserFollowing: async (userId: string, page = 1, limit = 20) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, sellerProfile: { select: { suspended: true } } },
    });
    if (!user || !user.isActive) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    if (user.sellerProfile?.suspended) {
      throw new ForbiddenError('This account is blocked or unavailable.', 'PUBLIC_ACCOUNT_BLOCKED');
    }
    return followsService.getFollowing(userId, FollowTargetType.USER, page, limit);
  },

  getCategoryFollowers: async (categoryId: string, page = 1, limit = 20) =>
    followsService.getFollowers(FollowTargetType.CATEGORY, categoryId, page, limit),

  findFollowerIds: (targetType: FollowTargetType, targetIds: string[]) =>
    followsRepository.findFollowerIds(targetType, targetIds),

  async getFollowedTargetIds(followerId: string, targetType: FollowTargetType): Promise<string[]> {
    const rows = await prisma.follow.findMany({
      where: { followerId, targetType },
      select: { targetId: true },
    });
    return rows.map(row => row.targetId);
  },

  async notifyActivity(
    targetType: FollowTargetType,
    targetIds: string[],
    title: string,
    body: string,
    data: Prisma.InputJsonValue
  ) {
    const followerIds = await followsRepository.findFollowerIds(targetType, targetIds);
    if (!followerIds.length) return { count: 0 };
    return notificationEvents.onFollowedActivity(followerIds, { title, body, data });
  },

  async notifyActivityForTargets(
    targets: Array<{ targetType: FollowTargetType; targetId: string }>,
    title: string,
    body: string,
    data: Prisma.InputJsonValue
  ) {
    // Batch follower lookups by target type. The old loop issued one query
    // per target, so publishing an activity for N targets caused N sequential
    // database round trips. At most one query per target type is needed.
    const targetIdsByType = new Map<FollowTargetType, Set<string>>();
    for (const target of targets) {
      const targetIds = targetIdsByType.get(target.targetType) ?? new Set<string>();
      targetIds.add(target.targetId);
      targetIdsByType.set(target.targetType, targetIds);
    }
    const followerGroups = await Promise.all(
      Array.from(targetIdsByType, ([targetType, targetIds]) =>
        followsRepository.findFollowerIds(targetType, Array.from(targetIds))
      )
    );
    const ids = new Set(followerGroups.flat());
    if (!ids.size) return { count: 0 };
    const uniqueTypes = new Set(targets.map(target => target.targetType));
    const type: NotificationType =
      uniqueTypes.size === 1
        ? uniqueTypes.has(FollowTargetType.CATEGORY)
          ? NotificationType.FOLLOWED_CATEGORY_ACTIVITY
          : uniqueTypes.has(FollowTargetType.STORE)
            ? NotificationType.FOLLOWED_STORE_ACTIVITY
            : NotificationType.FOLLOWED_USER_ACTIVITY
        : NotificationType.FOLLOWED_USER_ACTIVITY;
    return notificationEvents.onFollowedActivity(Array.from(ids), { title, body, data, type });
  },

  async getFollowingFeed(followerId: string, page = 1, limit = 20) {
    // The feed merges three independent content streams. Fetch enough records
    // from each stream to compute the requested global page after sorting;
    // taking only `limit` from each stream made every page after page 1 empty
    // or incomplete. The aggregate count is exact because content types are
    // disjoint (ads, products and service listings).
    // Reject (rather than silently clamp) pages beyond the supported depth:
    // a clamped request would return page N's data labelled as another page.
    const safePage = Math.max(1, Math.trunc(page || 1));
    if (safePage > MAX_FEED_PAGE) {
      throw new BadRequestError(`Feed page cannot exceed ${MAX_FEED_PAGE}`);
    }
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit || 20)));
    const skip = (safePage - 1) * safeLimit;
    const windowSize = skip + safeLimit;
    const [userIds, storeIds, categoryTargetIds] = await Promise.all([
      followsService.getFollowedTargetIds(followerId, FollowTargetType.USER),
      followsService.getFollowedTargetIds(followerId, FollowTargetType.STORE),
      followsService.getFollowedTargetIds(followerId, FollowTargetType.CATEGORY),
    ]);

    // Resolve followed stores/providers in batches and apply the same
    // visibility gates as public discovery: active owning user, unsuspended
    // seller profile, and an active store. Directly followed stores are
    // revalidated too because their status can change after the follow.
    const followedStorePredicates: Prisma.StoreDetailsWhereInput[] = [];
    if (storeIds.length) followedStorePredicates.push({ id: { in: storeIds } });
    if (userIds.length)
      followedStorePredicates.push({ sellerProfile: { userId: { in: userIds } } });
    const [eligibleStores, followedProviders] = await Promise.all([
      followedStorePredicates.length
        ? prisma.storeDetails.findMany({
            where: {
              status: 'ACTIVE',
              sellerProfile: { suspended: false, user: { isActive: true } },
              OR: followedStorePredicates,
            },
            select: { id: true },
          })
        : [],
      userIds.length
        ? prisma.serviceProviderDetails.findMany({
            where: {
              sellerProfile: {
                suspended: false,
                user: { isActive: true },
                userId: { in: userIds },
              },
            },
            select: { id: true },
          })
        : [],
    ]);
    const allStoreIds = eligibleStores.map(store => store.id);
    const providerIds = followedProviders.map(provider => provider.id);
    const categoryIds = { AD: [] as string[], PRODUCT: [] as string[], SERVICE: [] as string[] };
    for (const target of categoryTargetIds) {
      const parsed = parseCategoryTarget(target);
      categoryIds[parsed.kind].push(parsed.id);
    }

    const adsWhere: Prisma.AdWhereInput = {
      status: 'ACTIVE',
      flaggedForReview: false,
      sellerProfile: { suspended: false, user: { isActive: true } },
      AND: [
        {
          OR: [
            { storeId: null },
            {
              store: {
                status: 'ACTIVE',
                sellerProfile: { suspended: false, user: { isActive: true } },
              },
            },
          ],
        },
      ],
      OR: [
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        ...(allStoreIds.length ? [{ storeId: { in: allStoreIds } }] : []),
        ...(categoryIds.AD.length ? [{ categoryId: { in: categoryIds.AD } }] : []),
      ],
    };
    const productsWhere: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      store: { status: 'ACTIVE', sellerProfile: { suspended: false, user: { isActive: true } } },
      OR: [
        ...(allStoreIds.length ? [{ storeId: { in: allStoreIds } }] : []),
        ...(categoryIds.PRODUCT.length ? [{ categoryId: { in: categoryIds.PRODUCT } }] : []),
      ],
    };
    const servicesWhere: Prisma.ServiceListingWhereInput = {
      status: 'ACTIVE',
      provider: { sellerProfile: { suspended: false, user: { isActive: true } } },
      OR: [
        ...(providerIds.length ? [{ providerId: { in: providerIds } }] : []),
        ...(categoryIds.SERVICE.length ? [{ categoryId: { in: categoryIds.SERVICE } }] : []),
      ],
    };

    const [ads, products, services, adsCount, productsCount, servicesCount] = await Promise.all([
      prisma.ad.findMany({
        where: adsWhere,
        select: {
          id: true,
          title: true,
          price: true,
          images: true,
          city: true,
          createdAt: true,
          userId: true,
          storeId: true,
          categoryId: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: windowSize,
      }),
      prisma.product.findMany({
        where: productsWhere,
        select: {
          id: true,
          name: true,
          price: true,
          images: true,
          createdAt: true,
          storeId: true,
          categoryId: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: windowSize,
      }),
      prisma.serviceListing.findMany({
        where: servicesWhere,
        select: {
          id: true,
          title: true,
          price: true,
          images: true,
          createdAt: true,
          providerId: true,
          categoryId: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: windowSize,
      }),
      prisma.ad.count({ where: adsWhere }),
      prisma.product.count({ where: productsWhere }),
      prisma.serviceListing.count({ where: servicesWhere }),
    ]);

    const merged = [
      ...ads.map(item => ({
        type: 'AD' as const,
        id: item.id,
        title: item.title,
        price: item.price,
        images: item.images,
        city: item.city,
        createdAt: item.createdAt,
        userId: item.userId,
        storeId: item.storeId,
        categoryId: item.categoryId,
      })),
      ...products.map(item => ({
        type: 'PRODUCT' as const,
        id: item.id,
        title: item.name,
        price: item.price,
        images: item.images,
        city: null,
        createdAt: item.createdAt,
        userId: null,
        storeId: item.storeId,
        categoryId: item.categoryId,
      })),
      ...services.map(item => ({
        type: 'SERVICE' as const,
        id: item.id,
        title: item.title,
        price: item.price,
        images: item.images,
        city: null,
        createdAt: item.createdAt,
        userId: null,
        storeId: null,
        categoryId: item.categoryId,
      })),
    ].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        `${b.type}:${b.id}`.localeCompare(`${a.type}:${a.id}`)
    );

    const items = merged.slice(skip, skip + safeLimit);
    const total = adsCount + productsCount + servicesCount;
    return { items, meta: buildPaginationMeta(total, safePage, safeLimit) };
  },
  displayNameForTarget,
};
