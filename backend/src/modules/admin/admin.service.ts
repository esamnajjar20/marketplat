import { reportBackgroundFailure } from '../../shared/utils/backgroundTask';
import { prisma } from '../../config/prisma';
import { AdStatus, AuditEventType, ReportStatus, Role, Prisma } from '@prisma/client';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { NotFoundError }   from '../../shared/errors/NotFoundError';
import { ForbiddenError }  from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { userCache } from '../../shared/utils/userCache';
import { tokenStore } from '../../shared/utils/tokenStore';
import { auditLog } from '../../shared/utils/auditLog';
import { canManageRole } from '../../shared/utils/roleHierarchy';
import { adminStatsCache } from '../../shared/utils/adminStatsCache';
// BUGFIX (found during a post-implementation code audit): see
// ads.service.ts's own comment on bumpAdsCacheVersion for why this is
// needed here — setAdFeatured/setAdPinned/forceDeleteAd below all
// mutate Ad rows the GET /ads list cache is built from, but previously
// never invalidated it.
import { bumpAdsCacheVersion, bumpAdsCacheVersionAndHome } from '../ads/ads.service';
import { hidePublicEntities } from '../../shared/utils/publicListCache';
import { logger } from '../../shared/utils/logger';

/** كاش دقيقة لصفحة صحة النظام — يقلل PING على Upstash */
let _systemHealthMem: { at: number; value: any } | null = null;

/**
 * RFC 4180 CSV cell escaping + formula-injection guard.
 *
 * a real CSV injection vulnerability: the previous inline
 * .join(',') builders emitted raw values, so a user whose name (or a
 * report's notes) starts with =, +, -, @, tab, or CR would execute as
 * a formula when the exported file is opened in Excel / Google Sheets
 * / LibreOffice Calc. Prefixing those with a single quote is the
 * standard mitigation (OWASP: CSV Injection).
 *
 * Also a structural escaping bug: JSON.stringify was used to
 * quote name/notes, but JSON's escape rules do not match CSV's —
 * a name containing a double quote produced invalid CSV, and a value
 * containing a comma broke the column structure.
 */
function escapeCsvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  // Formula-injection guard (OWASP): prefix with a single quote so the
  // spreadsheet engine treats the leading char as literal text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // RFC 4180 quoting: wrap in double quotes and escape internal quotes
  // by doubling them, only when the value contains , " newline or CR.
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const adminService = {
  /**
   * previously the frontend's useAdminStats() computed this
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
    // see adminStatsCache.ts for the full reasoning.
    const cached = await adminStatsCache.get();
    if (cached) return cached;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // FEAT: new-registration counts ("دخلوا الموقع اليوم/الأسبوع/الشهر").
    // Week starts Sunday (getDay() 0), matching the only other
    // day-of-week convention already in this codebase
    // (stores.service.ts's WEEKDAY_KEYS). Month is the calendar month
    // (1st at 00:00), not a rolling 30-day window — matches how
    // "هذا الشهر" reads to an admin (resets on the 1st), and avoids a
    // second, differently-shaped "last 30 days" number sitting next to
    // viewsToday's own day-based one on the same dashboard.
    //
    // KNOWN EDGE CASE (calendar periods, not a bug to "fix"): for the
    // first few days of any month that doesn't start on a Sunday, the
    // Sunday-start week window reaches back into the *previous* month
    // while the month window resets to the 1st — so newUsersThisWeek
    // can briefly show a higher count than newUsersThisMonth. That's
    // correct for what each label actually asks ("this calendar week"
    // vs "this calendar month" are different, overlapping windows,
    // not a strict month ⊇ week nesting) — flagged here so it isn't
    // mistaken for a counting bug later.
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(1);

    const [
      totalAds,
      activeAds,
      totalUsers,
      activeUsers,
      openReports,
      viewsToday,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
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
      // FEAT: all three read User.createdAt directly — registration
      // time, not last-login (this schema has no lastLoginAt column at
      // all, so "دخل الموقع" is read as "joined/registered", the same
      // event totalUsers/activeUsers above are already counted from).
      // Covered by the existing [isActive, createdAt] index only when
      // Postgres chooses to use its leading column; at this table's
      // current size a plain count() on createdAt alone is cheap either
      // way — a dedicated createdAt-only index isn't worth adding for
      // three cheap dashboard counts refreshed at most every 30s (see
      // adminStatsCache's TTL).
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const stats = {
      totalAds,
      activeAds,
      totalUsers,
      activeUsers,
      openReports,
      viewsToday,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
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
    // previously wrapped in $transaction, but both
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
          // frontend's AdCategory type (types/ad.types.ts)
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
      // fire the audit log first. If
      // bumpAdsCacheVersion threw (Redis blip, quota), the previous
      // ordering skipped the audit row entirely — but the DB write had
      // already succeeded, so there is no trail of the change at all.
      // Audit is the durable record; cache invalidation is
      // best-effort (the version bump will retry implicitly on the
      // next successful call's own bump, or the 30s cache TTL expires
      // it anyway). Order swapped accordingly.
      auditLog({
        event: AuditEventType.ADMIN_AD_FEATURED,
        userId: adminUserId,
        details: { adId, isFeatured },
      }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));
      // BUGFIX: without this, GET /ads keeps serving the pre-change
      // isFeatured value from cache for up to its 30s TTL — a featured
      // ad wouldn't actually appear "featured" to browsing users right
      // away, and vice versa when un-featuring.
      await bumpAdsCacheVersion();
      return ad;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      throw e;
    }
  },

  setAdPinned: async (adId: string, isPinned: boolean, adminUserId = 'unknown') => {
    try {
      // AUDIT-FIX (#5): mark admin pins so seller pin cannot clear them.
      const ad = await prisma.ad.update({
        where: { id: adId },
        data: { isPinned, pinnedByAdmin: isPinned },
      });
      // same reordering as setAdFeatured
      // above — durable audit row first, best-effort cache bump after.
      auditLog({
        event: AuditEventType.ADMIN_AD_PINNED,
        userId: adminUserId,
        details: { adId, isPinned },
      }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));
      // BUGFIX: same reasoning as setAdFeatured above.
      await bumpAdsCacheVersion();
      return ad;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      throw e;
    }
  },

  forceDeleteAd: async (adId: string, adminUserId = 'unknown', reason?: string) => {
    try {
      await prisma.ad.update({ where: { id: adId }, data: { status: AdStatus.DELETED } });
      // same reordering as setAdFeatured
      // above. Particularly important on this path — an urgent admin
      // takedown (fraud, legal) is exactly when the audit trail
      // matters most, so the durable row must not be lost to a
      // transient Redis blip on the cache-bump call.
      //
      // carry the caller-supplied reason (if
      // any) into the audit row so a fraud takedown, a legal request,
      // and a routine policy cleanup are distinguishable months later
      // without cross-referencing other systems. Optional for now —
      // the frontend doesn't send it yet — but the plumbing is done
      // so adding it is a frontend-only change.
      auditLog({
        event: AuditEventType.ADMIN_AD_DELETED,
        userId: adminUserId,
        details: { adId, reason: reason ?? null },
      }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));
      // BUGFIX (found during a post-implementation code audit):
      // previously missing entirely — the regular, user-initiated
      // deleteAd (ads.service.ts) already calls this, but this admin
      // path (forceDeleteAd) did not. An admin removing an ad for an
      // urgent reason (fraud, a policy violation, a legal takedown
      // request) is exactly the case where "still visible to other
      // users for up to 30 more seconds" matters most.
      // also clear the homepage cache — an
      // urgent takedown must not linger on /home until its entry expires.
      await bumpAdsCacheVersionAndHome();
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
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
    // same getAllAds above — read-only pair,
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
  toggleUserActive: async (
    userId: string,
    isActive: boolean,
    adminUserId = 'unknown',
    adminRole: Role = 'ADMIN'
  ) => {
    // Guard: prevent self-deactivation.
    if (!isActive && userId === adminUserId) {
      throw new ForbiddenError('You cannot deactivate your own account', 'CANNOT_DEACTIVATE_SELF');
    }

    try {
      // the "last active admin" guard used to read
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

          // Gap #20: deactivation is a form of "managing" another
          // account, same as a role change — an actor must not be able
          // to deactivate someone at or above their own rank (e.g. an
          // ADMIN silencing a SUPER_ADMIN's account instead of going
          // through the blocked role-change path). Reuses the exact
          // same rank rule as changeRole via canManageRole, checked
          // against the target's *current* role for both sides (a
          // deactivation doesn't change role, so "new role" == "current
          // role" here — canManageRole(adminRole, target.role,
          // target.role) reduces to the single targetCurrentRank <
          // actorRank comparison that's actually meaningful for this
          // action).
          if (target && !canManageRole(adminRole, target.role, target.role)) {
            throw new ForbiddenError(
              'You do not have permission to deactivate this user',
              'DEACTIVATE_NOT_PERMITTED'
            );
          }

          // Gap #20: SUPER_ADMIN is now a distinct rank above ADMIN
          // with its own exclusive capability (granting/revoking
          // admin-tier roles), so it needs the same last-one-standing
          // protection ADMIN already had — deactivating the last active
          // SUPER_ADMIN would leave nobody able to ever create another
          // ADMIN or SUPER_ADMIN again.
          if (target?.role === 'SUPER_ADMIN') {
            const activeCount = await tx.user.count({
              where: { role: 'SUPER_ADMIN', isActive: true },
            });
            if (activeCount <= 1) {
              throw new BadRequestError('Cannot deactivate the last active super admin in the system', 'CANNOT_DEACTIVATE_LAST_SUPER_ADMIN');
            }
          }
          if (target?.role === 'ADMIN') {
            const activeAdminCount = await tx.user.count({
              where: { role: 'ADMIN', isActive: true },
            });
            if (activeAdminCount <= 1) {
              throw new BadRequestError('Cannot deactivate the last active admin in the system', 'CANNOT_DEACTIVATE_LAST_ADMIN');
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
      }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));

      return user;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      // P2034: Postgres detected a serialization conflict with a
      // concurrent transaction — most likely another admin-status
      // change racing this one. Safe to surface as a client-retryable
      // error rather than a generic 500.
      if (e?.code === 'P2034') {
        throw new BadRequestError('This action conflicted with another operation, please try again', 'CONCURRENT_UPDATE_CONFLICT');
      }
      throw e;
    }
  },

  /**
   * / Gap #20 (admin permission tiers): PATCH
   * /admin/users/:id/role.
   *
   * Authorization here is the rank rule from roleHierarchy.ts's
   * canManageRole: the actor can only change a target who is strictly
   * below them in rank, and can only assign a role strictly below
   * their own rank. In practice that means:
   *   - MODERATOR can never call this (requireMinRole(ADMIN) on the
   *     route already blocks it before this function runs, but the
   *     rank check below is the real authorization decision, not the
   *     route gate — defense in depth).
   *   - ADMIN can change USER<->MODERATOR only (can't touch or create
   *     another ADMIN/SUPER_ADMIN).
   *   - SUPER_ADMIN can change USER/MODERATOR/ADMIN freely.
   *   - SUPER_ADMIN is NEVER an assignable `role` value here, for
   *     anyone, including another SUPER_ADMIN — canManageRole already
   *     rejects it (rank 3 is never < actorRank, even for another
   *     rank-3 actor), but it's also blocked explicitly up front so
   *     the rejection reason is unambiguous in logs/responses rather
   *     than surfacing as a generic rank-check failure. Granting or
   *     revoking SUPER_ADMIN is deliberately kept out of any in-app
   *     endpoint — it's a break-glass role, assigned directly in the
   *     database by someone with production access, not something one
   *     admin should be able to hand to another (or to themselves)
   *     through a UI action that could be triggered by a compromised
   *     session or an internal mistake.
   *   - Self-modification is always rejected, at any rank — an actor
   *     can accidentally lock themselves out or, worse, quietly
   *     escalate their own privileges; neither should ever be a single
   *     API call.
   */
  changeRole: async (
    userId: string,
    role: Role,
    adminUserId = 'unknown',
    adminRole: Role = 'ADMIN',
    ip = 'unknown',
    userAgent = 'unknown'
  ) => {
    if (userId === adminUserId) {
      throw new ForbiddenError('You cannot change your own role', 'CANNOT_CHANGE_OWN_ROLE');
    }

    if (role === 'SUPER_ADMIN') {
      throw new ForbiddenError(
        'SUPER_ADMIN cannot be granted through this endpoint',
        'CANNOT_ASSIGN_SUPER_ADMIN'
      );
    }

    try {
      // same race as toggleUserActive above — the read
      // (target's current role / activeAdminCount) and the write (role
      // update) are now inside one Serializable transaction so two
      // concurrent role changes can't both pass their guard and both
      // commit, which could leave the system without anyone able to
      // manage roles.
      const user = await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        if (!target) {
          throw new NotFoundError('User not found', 'USER_NOT_FOUND');
        }

        if (!canManageRole(adminRole, target.role, role)) {
          throw new ForbiddenError(
            'You do not have permission to assign this role to this user',
            'ROLE_CHANGE_NOT_PERMITTED'
          );
        }

        // System-lockout prevention: demoting the last active ADMIN
        // would leave nobody able to manage MODERATOR/USER roles
        // day-to-day. (There is no equivalent SUPER_ADMIN guard here —
        // canManageRole above already makes a SUPER_ADMIN target
        // unreachable through this endpoint entirely, for any actor,
        // including another SUPER_ADMIN: targetCurrentRank(3) is never
        // < actorRank when the max rank is 3. SUPER_ADMIN's role can
        // only ever be changed directly in the database, which is the
        // intended break-glass model — see this function's own doc
        // comment.)
        if (target.role === 'ADMIN' && role !== 'ADMIN') {
          const activeCount = await tx.user.count({
            where: { role: 'ADMIN', isActive: true },
          });
          if (activeCount <= 1) {
            throw new BadRequestError(
              'Cannot demote the last active admin in the system',
              'CANNOT_DEMOTE_LAST_ADMIN'
            );
          }
        }

        const updated = await tx.user.update({
          where: { id: userId },
          data: { role },
          select: { id: true, name: true, email: true, role: true },
        });
        return { updated, previousRole: target.role };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      // Role changed → cached role (used by middleware-adjacent checks)
      // must not keep serving the old value, and a demoted admin's
      // existing sessions should not retain elevated access for up to
      // their remaining 15-minute access-token lifetime.
      await Promise.all([
        userCache.invalidate(userId),
        tokenStore.deleteAllRefreshTokens(userId),
      ]);

      // Full before/after/actor/ip trail, per Gap #20's spec — who
      // changed it, the target, old role, new role, when (auditLog
      // stamps createdAt itself), and ip/userAgent (already-supported
      // AuditLogEntry fields, just not previously passed by this call
      // site).
      auditLog({
        event: AuditEventType.ROLE_CHANGED,
        userId: adminUserId,
        ip,
        userAgent,
        details: {
          targetUserId: userId,
          previousRole: user.previousRole,
          newRole: role,
        },
      }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));

      return user.updated;
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      if (e?.code === 'P2034') {
        throw new BadRequestError('This action conflicted with another operation, please try again', 'CONCURRENT_UPDATE_CONFLICT');
      }
      throw e;
    }
  },

  // --- Notifications (Epic 6) ---

  /** Resolves the "كل المستخدمين" broadcast option to a concrete id
   * list before calling notificationsService.broadcastPromotion — kept
   * as an explicit resolution step (rather than letting the service
   * accept an implicit "everyone" sentinel) so the actual recipient set
   * is always a real array the caller can log/audit, never a magic
   * value whose size isn't visible until it's already sent. Only
   * isActive users — a disabled account has no reason to receive one. */
  getAllActiveUserIds: async (): Promise<string[]> => {
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
    return users.map((u) => u.id);
  },

  /**
   * Ops queue counts for the admin dashboard / sidebar badges —
   * items that need human action right now (not historical totals).
   */

  /** Admin catalog moderation — products across all stores. */
  getAdminProducts: async (query: {
    page?: number;
    limit?: number;
    status?: 'ACTIVE' | 'PAUSED' | 'DELETED';
    q?: string;
  }) => {
    // previously `query.limit ?? 20` with no upper
    // bound. The controller passed through whatever the caller sent, so
    // GET /admin/products?limit=999999 produced a Prisma findMany with
    // take=999999 against a table with no index on the (status,
    // createdAt) shape the default sort uses — a full scan plus a
    // response body that runs into hundreds of MB, all buffered in the
    // single Render dyno before the client has even started reading.
    // The same query shape already had a cap on the paginated
    // /admin/open-requests list (Math.min(100, ...)); matched here for
    // products and service listings so the three catalog lists are
    // consistent.
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : { status: { not: 'DELETED' } }),
      ...(query.q
        ? { name: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          price: true,
          status: true,
          createdAt: true,
          storeId: true,
          store: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  },

  setProductStatus: async (
    productId: string,
    status: 'ACTIVE' | 'PAUSED' | 'DELETED',
    adminUserId: string,
    reason?: string,
  ) => {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { status },
    });
    await hidePublicEntities('products');
    auditLog({
      event: AuditEventType.ADMIN_AD_DELETED, // closest existing event; details carry product
      userId: adminUserId,
      details: { productId, status, reason: reason ?? null, kind: 'product' },
    }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));
    return updated;
  },

  getAdminServiceListings: async (query: {
    page?: number;
    limit?: number;
    status?: 'ACTIVE' | 'PAUSED' | 'DELETED';
    q?: string;
  }) => {
    // see getAdminProducts above for the full
    // reasoning — same missing upper bound, same fix.
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const where: Prisma.ServiceListingWhereInput = {
      ...(query.status ? { status: query.status } : { status: { not: 'DELETED' } }),
      ...(query.q
        ? { title: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.serviceListing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          createdAt: true,
          providerId: true,
          provider: {
            select: {
              id: true,
              businessName: true,
              sellerProfileId: true,
            },
          },
        },
      }),
      prisma.serviceListing.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  },

  setServiceListingStatus: async (
    listingId: string,
    status: 'ACTIVE' | 'PAUSED' | 'DELETED',
    adminUserId: string,
    reason?: string,
  ) => {
    const listing = await prisma.serviceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    const updated = await prisma.serviceListing.update({
      where: { id: listingId },
      data: { status },
    });
    await hidePublicEntities('service-listings');
    auditLog({
      event: AuditEventType.ADMIN_AD_DELETED,
      userId: adminUserId,
      details: { listingId, status, reason: reason ?? null, kind: 'service_listing' },
    }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));
    return updated;
  },


  /**
   * Daily counts for users / ads / reports over the last N days —
   * powers the admin trend bars without a charting library.
   */
  getPlatformTrends: async (days = 30): Promise<{
    days: number;
    series: Array<{ date: string; users: number; ads: number; reports: number }>;
  }> => {
    const safeDays = Math.min(90, Math.max(7, days));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (safeDays - 1));

    const [userRows, adRows, reportRows] = await Promise.all([
      prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS d, COUNT(*)::bigint AS c
        FROM users WHERE "createdAt" >= ${start}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS d, COUNT(*)::bigint AS c
        FROM ads WHERE "createdAt" >= ${start}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS d, COUNT(*)::bigint AS c
        FROM reports WHERE "createdAt" >= ${start}
        GROUP BY 1 ORDER BY 1`,
    ]);

    const mapCount = (rows: Array<{ d: Date; c: bigint }>) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const key = new Date(r.d).toISOString().slice(0, 10);
        m.set(key, Number(r.c));
      }
      return m;
    };
    const uMap = mapCount(userRows);
    const aMap = mapCount(adRows);
    const rMap = mapCount(reportRows);

    const series: Array<{ date: string; users: number; ads: number; reports: number }> = [];
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({
        date: key,
        users: uMap.get(key) ?? 0,
        ads: aMap.get(key) ?? 0,
        reports: rMap.get(key) ?? 0,
      });
    }
    return { days: safeDays, series };
  },

  getSystemHealth: async (): Promise<{
    redis: {
      ok: boolean;
      latencyMs: number | null;
      commandLatencyMs: number | null;
      error?: string;
      note?: string;
    };
    db: {
      ok: boolean;
      latencyMs: number | null;
      error?: string;
      note?: string;
    };
    checkedAt: string;
  }> => {
    // UPSTASH-SAVE: كاش دقيقة واحدة — فتح الصفحة عدة مرات لا يضرب Redis/DB
    if (
      _systemHealthMem &&
      Date.now() - _systemHealthMem.at < 60_000
    ) {
      return _systemHealthMem.value;
    }

    const nowMs = () => {
      const [s, ns] = process.hrtime();
      return s * 1000 + ns / 1e6;
    };
    const checkedAt = new Date().toISOString();

    let redisOk = false;
    let redisMs: number | null = null;
    let redisCmdMs: number | null = null;
    let redisErr: string | undefined;
    let redisNote: string | undefined;
    try {
      const { redis } = await import('../../config/redis');
      const t0 = nowMs();
      if (redis.status !== 'ready') {
        await redis.connect().catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));
      }
      // UPSTASH-SAVE: PING واحد بعد التأكد من الاتصال (بدل 4 أوامر)
      const s0 = nowMs();
      await redis.ping();
      redisCmdMs = Math.round(nowMs() - s0);
      redisMs = Math.round(nowMs() - t0);
      redisOk = true;
      if (redisMs >= 80 && redisCmdMs < 25) {
        redisNote =
          'زمن الاتصال/الشبكة مرتفع، لكن أوامر Redis سريعة — الكاش نفسه ليس بطيئًا.';
      } else if (redisCmdMs >= 50) {
        redisNote =
          'أوامر Redis بطيئة نسبيًا — غالبًا بسبب استضافة بعيدة (RTT) أو ضغط على الخادم.';
      }
    } catch (e) {
      redisErr = e instanceof Error ? e.message : 'redis unreachable';
    }

    let dbOk = false;
    let dbMs: number | null = null;
    let dbErr: string | undefined;
    let dbNote: string | undefined;
    try {
      const s0 = nowMs();
      await prisma.$queryRaw`SELECT 1`;
      dbMs = Math.round(nowMs() - s0);
      dbOk = true;
      if (dbMs >= 80) {
        dbNote =
          'استجابة DB أعلى من المعتاد محليًا — قد يكون الخادم بعيدًا أو تحت ضغط.';
      }
    } catch (e) {
      dbErr = e instanceof Error ? e.message : 'db unreachable';
    }

    const value = {
      redis: {
        ok: redisOk,
        latencyMs: redisMs,
        commandLatencyMs: redisCmdMs,
        error: redisErr,
        note: redisNote,
      },
      db: { ok: dbOk, latencyMs: dbMs, error: dbErr, note: dbNote },
      checkedAt,
    };
    _systemHealthMem = { at: Date.now(), value };
    return value;
  },

  exportUsersCsv: async (): Promise<string> => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    const header = 'id,email,name,role,isActive,createdAt';
    const lines = users.map((u) =>
      // every cell goes through escapeCsvCell —
      // see its own doc comment for the two bugs it 
      [u.id, u.email, u.name, u.role, u.isActive, u.createdAt.toISOString()]
        .map(escapeCsvCell)
        .join(','),
    );
    return [header, ...lines].join('\n');
  },

  exportReportsCsv: async (): Promise<string> => {
    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        reason: true,
        status: true,
        targetType: true,
        targetId: true,
        userId: true,
        notes: true,
        createdAt: true,
      },
    });
    const header = 'id,reason,status,targetType,targetId,userId,notes,createdAt';
    const lines = reports.map((r) =>
      // see exportUsersCsv above.
      [
        r.id,
        r.reason,
        r.status,
        r.targetType,
        r.targetId,
        r.userId,
        r.notes,
        r.createdAt.toISOString(),
      ]
        .map(escapeCsvCell)
        .join(','),
    );
    return [header, ...lines].join('\n');
  },

  getOpsQueue: async (): Promise<{
    openReports: number;
    pendingStores: number;
    pendingSellers: number;
    unreviewedFraud: number;
    total: number;
  }> => {
    const [openReports, pendingStores, pendingSellers, unreviewedFraud] = await Promise.all([
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.storeDetails.count({ where: { status: 'PENDING' } }),
      prisma.sellerProfile.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.fraudSignal.count({ where: { reviewed: false } }),
    ]);
    const total = openReports + pendingStores + pendingSellers + unreviewedFraud;
    return { openReports, pendingStores, pendingSellers, unreviewedFraud, total };
  },

  // removed
  // getAdminServiceBroadcasts + adminCancelServiceBroadcast.
  // These backed an "Epic 6 / Feature 4" service-only broadcast
  // feed that was superseded by the newer /open-requests
  // marketplace (Request / RequestOffer). Neither method was ever
  // wired to a controller or route, and no frontend UI ever called
  // the matching admin.api.ts client methods -- the full chain on
  // both ends was dead. The Prisma ServiceRequestBroadcast model
  // stays in place (migration history + zero-risk), just no
  // service-layer access to it from admin.
  //
  // getAdminOpenRequests / adminCancelOpenRequest below are the live
  // successor paths; unchanged.

  /**
   * Open Requests marketplace admin list (SERVICE | PRODUCT | RENTAL).
   * Separate from service-broadcasts (feed).
   */
  getServiceRequestDisputes: async (query: { page?: number; limit?: number }): Promise<{ items: unknown[]; meta: ReturnType<typeof buildPaginationMeta> }> => {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = { status: 'DISPUTED' as const };
    const [items, total] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        orderBy: { disputedAt: 'asc' },
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true } },
          listing: { select: { id: true, title: true, provider: { select: { id: true, businessName: true, sellerProfile: { select: { userId: true, displayName: true } } } } } },
        },
      }),
      prisma.serviceRequest.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  },

  resolveServiceRequestDispute: async (
    id: string,
    adminUserId: string,
    resolution: 'COMPLETED' | 'CANCELLED',
    note?: string,
  ): Promise<unknown> => {
    return prisma.$transaction(async tx => {
      const request = await tx.serviceRequest.findUnique({
        where: { id },
        select: {
          id: true, status: true, listingId: true, customerId: true, quotedPrice: true, agreedPrice: true,
          listing: { select: { pricingType: true, price: true, provider: { select: { sellerProfile: { select: { userId: true } } } } } },
        },
      });
      if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      if (request.status !== 'DISPUTED') {
        throw new BadRequestError('Only disputed service requests can be resolved.', 'SERVICE_REQUEST_NOT_DISPUTED');
      }
      let agreedPrice = request.agreedPrice;
      if (resolution === 'COMPLETED' && agreedPrice == null) {
        agreedPrice = request.quotedPrice ?? (request.listing.pricingType === 'FIXED' ? request.listing.price : null);
        if (agreedPrice == null) {
          throw new BadRequestError('A final agreed price is required before resolving the dispute as completed.', 'AGREED_PRICE_REQUIRED');
        }
      }
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { status: resolution, respondedAt: new Date(), agreedPrice: resolution === 'COMPLETED' ? agreedPrice : request.agreedPrice, disputeResolutionNote: note, disputeResolvedAt: new Date(), disputeResolvedBy: adminUserId },
        include: { customer: { select: { id: true, name: true } } },
      });
      if (resolution === 'COMPLETED' || resolution === 'CANCELLED') {
        await tx.appointment.updateMany({ where: { requestId: id, status: 'SCHEDULED' }, data: { status: resolution } });
      }
      logger.info('Service request dispute resolved', { requestId: id, adminUserId, resolution });
      return updated;
    });
  },

  getAdminOpenRequests: async (query: {
    page?: number;
    limit?: number;
    status?: 'OPEN' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
    type?: 'SERVICE' | 'PRODUCT' | 'RENTAL';
    q?: string;
  }): Promise<{ items: unknown[]; meta: ReturnType<typeof buildPaginationMeta> }> => {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.request.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true, city: true } },
          _count: { select: { offers: true } },
        },
      }),
      prisma.request.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, page, limit) };
  },

  adminCancelOpenRequest: async (
    id: string,
    adminUserId: string,
    reason?: string,
  ): Promise<unknown> => {
    const existing = await prisma.request.findUnique({
      where: { id },
      select: { id: true, status: true, customerId: true },
    });
    if (!existing) throw new NotFoundError('Request not found', 'REQUEST_NOT_FOUND');
    if (existing.status === 'CANCELLED') return existing;
    if (existing.status === 'ACCEPTED') {
      throw new BadRequestError(
        'Cannot cancel an ACCEPTED request — resolve the accepted offer first',
        'REQUEST_ALREADY_ACCEPTED',
      );
    }

    const updated = await prisma.request.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    // was `await auditLog(...)`. Every
    // other call site in this service writes the audit row as a
    // fire-and-forget with `.catch(() => {})` — see setAdFeatured /
    // setAdPinned / forceDeleteAd / broadcastPromotion. Awaiting here
    // meant a transient Redis or DB blip inside auditLog (which writes
    // to Postgres and does not throw on the write itself, but its
    // initial logger.info can) could fail the whole cancel — the
    // request is already cancelled by the time this runs, so the
    // caller would see a 500 for an operation that fully succeeded.
    // Aligned with the rest of the file.
    auditLog({
      event: AuditEventType.ADMIN_OPEN_REQUEST_CANCELLED,
      userId: adminUserId,
      details: {
        requestId: id,
        reason: reason ?? null,
        kind: 'open-request',
      },
    }).catch((error) => reportBackgroundFailure('backend/src/modules/admin/admin.service.ts', error));

    return updated;
  },

};
