import { prisma } from '../../config/prisma';
import { AdStatus, AuditEventType, ReportStatus, Role, Prisma } from '@prisma/client';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { NotFoundError }   from '../../shared/errors/NotFoundError';
import { ForbiddenError }  from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { userCache } from '../../shared/utils/userCache';
import { tokenStore } from '../../shared/utils/tokenStore';
import { auditLog } from '../../shared/utils/auditLog';
import { adminStatsCache } from '../../shared/utils/adminStatsCache';
// BUGFIX (found during a post-implementation code audit): see
// ads.service.ts's own comment on bumpAdsCacheVersion for why this is
// needed here — setAdFeatured/setAdPinned/forceDeleteAd below all
// mutate Ad rows the GET /ads list cache is built from, but previously
// never invalidated it.
import { bumpAdsCacheVersion } from '../ads/ads.service';

export const adminService = {
  /**
   * FIX FEAT-05: previously the frontend's useAdminStats() computed this
   * by firing three separate paginated requests (limit=1 each) just to
   * read each response's meta.total — three round-trips, three full
   * query-building/auth passes, for numbers that are cheap to get with
   * direct count() aggregations. It also had a real accuracy bug: both
   * `totalAds`/`activeAds` and `totalUsers`/`activeUsers` were set to
   * the *same* value (there was no way to distinguish "all" from
   * "active-only" from a single total count), and `viewsToday` was
   * hardcoded to 0 with a comment saying it wasn't available.
   *
   * This single endpoint runs all aggregations in one Promise.all (still
   * N parallel queries, but all within one request/response cycle
   * instead of N separate HTTP round-trips with their own auth/parsing
   * overhead), and computes real distinct numbers for each stat.
   */
  getStats: async () => {
    // FIX PERF-02: see adminStatsCache.ts for the full reasoning.
    const cached = await adminStatsCache.get();
    if (cached) return cached;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalAds,
      activeAds,
      totalUsers,
      activeUsers,
      openReports,
      viewsToday,
    ] = await Promise.all([
      prisma.ad.count(),
      prisma.ad.count({ where: { status: AdStatus.ACTIVE } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.report.count({ where: { status: ReportStatus.PENDING } }),
      // L-5 (audit fix): comment previously claimed this included
      // "today's buffered increments still sitting in Redis" — it does
      // not. viewsBuffer.ts (the Redis view-count buffer) only ever
      // flushes into `ads.views` via an incrBy against the existing
      // stored total; it has no per-day/created-today breakdown, and
      // this aggregate query never touches Redis at all — it's a plain
      // Postgres SUM. So viewsToday is undercounted by however many
      // buffered increments (for ANY ad, not just ones created today)
      // haven't been flushed yet at the moment this runs, and even once
      // flushed it only captures views on ads *created* today, not all
      // views *received* today on older ads — views isn't tracked as a
      // time series (the Ad model only has a running total `views`
      // counter), so this remains the best available approximation
      // without adding a views-history table. Flagged here rather than
      // silently presented as exact.
      prisma.ad.aggregate({
        _sum: { views: true },
        where: { createdAt: { gte: startOfToday } },
      }).then(r => r._sum.views ?? 0),
    ]);

    const stats = {
      totalAds,
      activeAds,
      totalUsers,
      activeUsers,
      openReports,
      viewsToday,
    };

    await adminStatsCache.set(stats);
    return stats;
  },

  // --- Ads ---
  getAllAds: async (query: {
    page?: number;
    limit?: number;
    status?: AdStatus;
    userId?: string;
    q?: string;
  }) => {
    const { page = 1, limit = 20, status, userId, q } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.AdWhereInput = {
      ...(status && { status }),
      ...(userId && { userId }),
      // BUGFIX: AdminAdsTable's search box sent `q` but it was dropped
      // by admin.validation.ts before ever reaching here (see that
      // file's fix). Unlike ads.repository.ts's public-facing search,
      // this does NOT hit the ads_search_gin_idx tsvector index — that
      // index accelerates to_tsvector/plainto_tsquery lookups, not
      // `contains`/ILIKE pattern matching, so this is a sequential scan
      // on `title` for any request that includes `q`. Acceptable here
      // because this is an admin-only, low-traffic, low-QPS endpoint
      // (unlike the public /ads search this table size is fine to
      // scan) — but if this ever needs to scale, either add a
      // pg_trgm GIN index on `title` or switch this to the same
      // to_tsvector approach ads.repository.ts already uses.
      ...(q && { title: { contains: q, mode: 'insensitive' as const } }),
    };
    // FIX AUDIT-V4-11: previously wrapped in $transaction, but both
    // queries are read-only with no write dependency between them —
    // matches the D-05 convention already used in ads.repository.ts's
    // findManyByUserId for the exact same situation. $transaction adds
    // overhead (an extra round-trip to BEGIN/COMMIT) with no consistency
    // benefit here: even inside a transaction, nothing prevents the
    // total count from being momentarily out of sync with the list
    // (e.g. a row inserted between the two queries) unless using a much
    // heavier isolation level than Prisma's default — so the
    // transaction wasn't actually buying the snapshot consistency one
    // might assume it was.
    const [ads, total] = await Promise.all([
      prisma.ad.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          // FIX INTEG-01: frontend's AdCategory type (types/ad.types.ts)
          // requires { id, name, nameAr } — this select only returned
          // { id, name }, silently leaving category.nameAr undefined
          // for any admin UI that ends up displaying the Arabic
          // category name (nothing does yet, but the type contract
          // claims it's always a string, not string | undefined).
          category: { select: { id: true, name: true, nameAr: true } },
          _count: { select: { reports: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ad.count({ where }),
    ]);
    return { items: ads, meta: buildPaginationMeta(total, page, limit) };
  },

  // D-09: removed redundant SELECT — catch P2025 directly instead
  setAdFeatured: async (adId: string, isFeatured: boolean, adminUserId = 'unknown') => {
    try {
      const ad = await prisma.ad.update({ where: { id: adId }, data: { isFeatured } });
      // BUGFIX: without this, GET /ads keeps serving the pre-change
      // isFeatured value from cache for up to its 30s TTL — a featured
      // ad wouldn't actually appear "featured" to browsing users right
      // away, and vice versa when un-featuring.
      await bumpAdsCacheVersion();
      auditLog({
        event: AuditEventType.ADMIN_AD_FEATURED,
        userId: adminUserId,
        details: { adId, isFeatured },
      }).catch(() => {});
      return ad;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('Ad not found');
      throw e;
    }
  },

  setAdPinned: async (adId: string, isPinned: boolean, adminUserId = 'unknown') => {
    try {
      const ad = await prisma.ad.update({ where: { id: adId }, data: { isPinned } });
      // BUGFIX: same reasoning as setAdFeatured above.
      await bumpAdsCacheVersion();
      auditLog({
        event: AuditEventType.ADMIN_AD_PINNED,
        userId: adminUserId,
        details: { adId, isPinned },
      }).catch(() => {});
      return ad;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('Ad not found');
      throw e;
    }
  },

  forceDeleteAd: async (adId: string, adminUserId = 'unknown') => {
    try {
      await prisma.ad.update({ where: { id: adId }, data: { status: AdStatus.DELETED } });
      // BUGFIX (found during a post-implementation code audit):
      // previously missing entirely — the regular, user-initiated
      // deleteAd (ads.service.ts) already calls this, but this admin
      // path (forceDeleteAd) did not. An admin removing an ad for an
      // urgent reason (fraud, a policy violation, a legal takedown
      // request) is exactly the case where "still visible to other
      // users for up to 30 more seconds" matters most — the whole
      // point of an admin force-delete is that it needs to take effect
      // immediately, not on the cache's own schedule.
      await bumpAdsCacheVersion();
      auditLog({
        event: AuditEventType.ADMIN_AD_DELETED,
        userId: adminUserId,
        details: { adId },
      }).catch(() => {});
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('Ad not found');
      throw e;
    }
  },

  // --- Users ---
  getAllUsers: async (query: { page?: number; limit?: number; isActive?: boolean; q?: string }) => {
    const { page = 1, limit = 20, isActive, q } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      ...(isActive !== undefined && { isActive }),
      // BUGFIX: same missing-`q` issue as getAllAds above. No index
      // covers `name`/`email` for pattern matching (see @@index list
      // in schema.prisma — only `[isActive, createdAt]` exists), so
      // this is a sequential scan for any request that includes `q`.
      // Same "acceptable for an admin-only endpoint, revisit if it
      // ever needs to scale" tradeoff as getAllAds.
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
    };
    // FIX AUDIT-V4-11: same fix as getAllAds above — read-only pair,
    // no transaction needed.
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          city: true,
          isActive: true,
          createdAt: true,
          _count: { select: { ads: true, reports: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    return { items: users, meta: buildPaginationMeta(total, page, limit) };
  },

  // S-04: revoke sessions when deactivating a user
  toggleUserActive: async (userId: string, isActive: boolean, adminUserId = 'unknown') => {
    // Guard: prevent self-deactivation.
    if (!isActive && userId === adminUserId) {
      throw new ForbiddenError('لا يمكنك تعطيل حسابك الخاص');
    }

    try {
      // FIX SEC-08: the "last active admin" guard used to read
      // activeAdminCount and then update() as two separate statements.
      // Two concurrent requests demoting/deactivating two *different*
      // admins could both read count=2, both pass the "> 1" check, and
      // both commit — leaving zero active admins, exactly what this
      // guard exists to prevent. Wrapping the read + guard + write in a
      // single Serializable transaction makes Postgres itself detect
      // the conflict: the second transaction to commit fails with
      // P2034 and is retried/rejected rather than silently succeeding
      // alongside the first.
      const user = await prisma.$transaction(async (tx) => {
        if (!isActive) {
          const target = await tx.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          if (target?.role === 'ADMIN') {
            const activeAdminCount = await tx.user.count({
              where: { role: 'ADMIN', isActive: true },
            });
            if (activeAdminCount <= 1) {
              throw new BadRequestError('لا يمكن تعطيل آخر مدير نشط في النظام');
            }
          }
        }

        return tx.user.update({
          where: { id: userId },
          data: { isActive },
          select: { id: true, name: true, email: true, isActive: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      // If deactivating: immediately invalidate all active sessions + cache
      if (!isActive) {
        await Promise.all([
          userCache.invalidate(userId),
          tokenStore.deleteAllRefreshTokens(userId),
        ]);
      }

      auditLog({
        event: AuditEventType.ADMIN_USER_STATUS_CHANGED,
        userId: adminUserId,
        details: { targetUserId: userId, isActive },
      }).catch(() => {});

      return user;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('User not found');
      // P2034: Postgres detected a serialization conflict with a
      // concurrent transaction — most likely another admin-status
      // change racing this one. Safe to surface as a client-retryable
      // error rather than a generic 500.
      if (e?.code === 'P2034') {
        throw new BadRequestError('حدث تعارض مع عملية أخرى، يرجى إعادة المحاولة');
      }
      throw e;
    }
  },

  /**
   * FIX AUDIT-V3-05: PATCH /admin/users/:id/role — previously
   * AuditEventType.ROLE_CHANGED existed in the schema with no code path
   * ever triggering it, and there was no way to promote/demote a user
   * to/from ADMIN without editing the database directly.
   *
   * Mirrors toggleUserActive's guards: an admin can't demote themselves
   * (avoids accidental self-lockout from the admin panel), and the last
   * active admin in the system can't be demoted (system lockout
   * prevention — same rationale as the deactivation guard).
   */
  changeRole: async (userId: string, role: Role, adminUserId = 'unknown') => {
    if (role === 'USER' && userId === adminUserId) {
      throw new ForbiddenError('لا يمكنك تنزيل صلاحياتك الخاصة');
    }

    try {
      // FIX SEC-08: same race as toggleUserActive above — the read
      // (activeAdminCount) and the write (role update) are now inside
      // one Serializable transaction so two concurrent demotions of two
      // different admins can't both pass the "> 1" guard and both
      // commit, which would leave the system with zero admins.
      const user = await prisma.$transaction(async (tx) => {
        if (role === 'USER') {
          const target = await tx.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          if (target?.role === 'ADMIN') {
            const activeAdminCount = await tx.user.count({
              where: { role: 'ADMIN', isActive: true },
            });
            if (activeAdminCount <= 1) {
              throw new BadRequestError('لا يمكن تنزيل صلاحيات آخر مدير نشط في النظام');
            }
          }
        }

        return tx.user.update({
          where: { id: userId },
          data: { role },
          select: { id: true, name: true, email: true, role: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      // Role changed → cached role (used by middleware-adjacent checks)
      // must not keep serving the old value, and a demoted admin's
      // existing sessions should not retain elevated access for up to
      // their remaining 15-minute access-token lifetime.
      await Promise.all([
        userCache.invalidate(userId),
        tokenStore.deleteAllRefreshTokens(userId),
      ]);

      auditLog({
        event: AuditEventType.ROLE_CHANGED,
        userId: adminUserId,
        details: { targetUserId: userId, newRole: role },
      }).catch(() => {});

      return user;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('User not found');
      if (e?.code === 'P2034') {
        throw new BadRequestError('حدث تعارض مع عملية أخرى، يرجى إعادة المحاولة');
      }
      throw e;
    }
  },
};
