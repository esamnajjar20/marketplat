import { reportBackgroundFailure } from '../../shared/utils/backgroundTask';
import { usersRepository, SafeUser, PublicUser } from './users.repository';
import { hashPassword, comparePassword } from '../../shared/utils/hash';
import { UpdateProfileInput, UpdateNotificationPreferencesInput } from './users.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { userCache } from '../../shared/utils/userCache';
import { tokenStore } from '../../shared/utils/tokenStore';
import { getTokenRemainingTTL } from '../../shared/utils/jwt';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { activityService, activityTemplates } from '../activity';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { prisma } from '../../config/prisma';
import { AdStatus } from '@prisma/client';
import { uploadAvatar, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import { presence } from '../../shared/utils/presence';
import { notificationsService } from '../notifications/notifications.service';
import { conversationsService } from '../conversations/conversations.service';
import { sellersService } from '../sellers/sellers.service';
import { favoritesService } from '../favorites/favorites.service';
import { bumpAdsCacheVersionAndHome } from '../ads/ads.cache.keys';


export const usersService = {
  /** PATCH /users/me/presence — heartbeat. No DB write, no response
   * body beyond the envelope; see presence.touch's own doc comment for
   * why this is fire-and-forget from the caller's point of view. */
  touchPresence: async (userId: string): Promise<void> => {
    await presence.touch(userId);
  },

  /** GET /users/presence?ids=... — bulk online lookup for however many
   * user IDs the caller's current view needs a dot for. */
  getPresence: async (userIds: string[]): Promise<Record<string, { online: boolean; lastSeenAt: string | null }>> => presence.getPresence(userIds),

  getMe: async (userId: string): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    return user;
  },

  /**
   * GET /users/me/bootstrap — one round-trip for post-login shell data
   * that used to fire as separate /me, unread-count×2, notifications,
   * seller profile/attention, ad stats, and favorites page-1 requests.
   * Each field is independently best-effort (null on soft failure) so a
   * single downstream outage cannot blank the whole shell.
   */
  getBootstrap: async (userId: string) => {
    const me = await usersService.getMe(userId);

    const soft = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };

    const [
      notificationsUnread,
      conversationsUnread,
      notifications,
      sellerProfile,
      sellerAttention,
      adStats,
      favorites,
    ] = await Promise.all([
      soft(() => notificationsService.getUnreadCount(userId)),
      soft(async () => (await conversationsService.getUnreadCount(userId)).count),
      soft(() =>
        notificationsService.getMyNotifications(userId, { page: 1, limit: 10 }),
      ),
      soft(() => sellersService.getMySellerProfile(userId)),
      soft(() => sellersService.getMyAttention(userId)),
      soft(() => adsService.getMyStats(userId)),
      soft(() => favoritesService.getMyFavorites(userId, { page: 1, limit: 20 })),
    ]);

    return {
      me,
      notificationsUnread: notificationsUnread ?? 0,
      conversationsUnread: conversationsUnread ?? 0,
      notifications,
      sellerProfile,
      sellerAttention,
      adStats,
      favorites,
    };
  },

  // UNIFIED-PROFILE: a suspended seller's ratings/verification history
  // stays visible elsewhere in the admin/own-profile views (see
  // schema.prisma's comment on SellerProfile.suspended), but this is the
  // public /profile/:id — same reasoning as sellersService never exposing
  // a suspended seller's storefront to new business. Hide sellerProfile
  // entirely rather than partially, so the frontend never has to special-case
  // a "suspended seller" tab state it has no design for.
  getUserById: async (id: string): Promise<PublicUser> => {
    const user = await usersRepository.findPublicById(id);
    if (!user || !user.isActive) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({ where: { targetType: 'USER', targetId: id } }),
      prisma.follow.count({ where: { followerId: id, targetType: 'USER' } }),
    ]);
    // SEC-LEAK-01: strip PII fields from the public profile projection.
    //   sellerProfile.paymentMethods → bank/jawwal/palpay account numbers
    //     ("بنك فلسطين 0598398815") — must never be exposed to anonymous
    //     visitors or other users. Owners still receive them from
    //     GET /users/me via SafeUser (a separate, authenticated path).
    //   serviceProviderDetails.contactPhone → the service provider's direct
    //     phone — the intended contact channel is in-app messaging, not a
    //     public phone number; the same rationale that already hides it on
    //     /service-providers (service-providers.service.ts).
    // If a future feature needs to expose payment methods to a specific
    // viewer, gate it on a real authorization check (owner/blocked/etc)
    // rather than undoing this strip.
    const sellerProfile = user.sellerProfile && !user.sellerProfile.suspended
      ? {
          ...user.sellerProfile,
          paymentMethods: [] as typeof user.sellerProfile.paymentMethods,
          serviceProviderDetails: user.sellerProfile.serviceProviderDetails
            ? {
                ...user.sellerProfile.serviceProviderDetails,
                contactPhone: '',
              }
            : null,
        }
      : null;
    return {
      id: user.id,
      name: user.name,
      city: user.city,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      _count: user._count,
      followStats: { followers: followersCount, following: followingCount },
      sellerProfile,
    };
  },

  getUserAds: async (userId: string, query: { page?: number; limit?: number }) => {
    const user = await usersRepository.findById(userId);
    if (!user || !user.isActive) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const page = query.page || 1;
    const limit = query.limit || 20;
    // S-05: statusFilter pushed to DB — total now only counts ACTIVE ads
    // Previously filtering in app layer caused total to include SOLD ads (info leak)
    const { ads, total } = await adsService.getUserAdsForProfile(userId, { page, limit });
    return { items: ads, meta: buildPaginationMeta(total, page, limit) };
  },

  updateMe: async (userId: string, input: UpdateProfileInput): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    if (input.phone && input.phone !== user.phone) {
      const existing = await usersRepository.findByPhone(input.phone);
      if (existing) throw new BadRequestError('Phone number already in use');
    }
    // FEAT-GOOGLE-COMPLETE-PROFILE: this is the same PATCH /users/me
    // the /complete-profile page submits to, so a city being provided
    // here IS the completion signal — clear the flag in the same
    // write rather than adding a dedicated endpoint. Never re-sets it
    // true; only ever moves false->false or true->false.
    const updateData = input.city ? { ...input, needsProfileCompletion: false } : input;
    const updated = await usersRepository.update(userId, updateData);
    await userCache.invalidate(userId);

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment.
    activityService.record({ userId, ...activityTemplates.profileUpdated() });

    return updated;
  },

  /**
   * previously NotificationSettingsForm.tsx's save button
   * had nothing to call — this is the first time these preferences are
   * actually persisted anywhere.
   */
  updateNotificationPreferences: async (
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const updated = await usersRepository.updateNotificationPreferences(userId, input);
    await userCache.invalidate(userId);
    return updated;
  },

  // D-01: cascade ACTIVE ads to DELETED + S-04: revoke all tokens
  // + see below for both.
  deleteMe: async (userId: string): Promise<void> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    // collect every Cloudinary publicId
    // this user owns — avatar + every image of every ad they have ever
    // posted (not just ACTIVE ones; a SOLD ad's images also belong to
    // them). Before this, account deletion only flipped isActive=false
    // and DELETED their ACTIVE ads; the underlying images kept living
    // on Cloudinary indefinitely, at the operator's cost and in
    // violation of the deletion promise the user just made. Same
    // best-effort treatment as uploadAvatar's own cleanup: a Cloudinary
    // failure must never block the deletion itself (the DB state is
    // the source of truth, the images are recoverable from the audit
    // trail if a cleanup is ever needed later).
    const [avatarPublicId, adImages] = await Promise.all([
      user.avatarUrl ? Promise.resolve(extractCloudinaryPublicId(user.avatarUrl)) : Promise.resolve(null),
      prisma.ad.findMany({
        where: { userId },
        select: { images: true },
      }),
    ]);
    const adPublicIds: string[] = [];
    for (const ad of adImages) {
      for (const img of ad.images ?? []) {
        const pid = extractCloudinaryPublicId(img);
        if (pid) adPublicIds.push(pid);
      }
    }

    // anonymize the account so the email/phone/name
    // are gone from the database (kept: id, role, isActive, timestamps
    // — the row stays for foreign-key integrity and aggregate counts,
    // but nothing identifying survives). email and phone are the two
    // natural keys this app uses for login and uniqueness checks, so
    // the anonymized values must remain unique per deleted user —
    // `deleted-<userId>@deleted.invalid` and `deleted-<userId>` do
    // that without any collision risk, and `.invalid` is the IETF-
    // reserved TLD for exactly this purpose (RFC 2606). Name is set to
    // a generic Arabic placeholder so any historical audit row or
    // admin list still reads as a user, not as a corrupted record.
    // The passwordHash is left untouched — it was already unusable
    // (the login path rejects isActive=false before it ever gets to
    // bcrypt) and clearing it here would break the "is this account
    // OAuth-only?" check in changePassword for a user who is deleted
    // but somehow tries to log in again.
    //
    // Deactivate + anonymize + hide ads all in one transaction so
    // there is no window where the account is "still half-alive".
    const anonEmail = `deleted-${userId}@deleted.invalid`;
    const anonPhone = `deleted-${userId}`;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          email: anonEmail,
          phone: anonPhone,
          name: 'مستخدم محذوف',
          bio: null,
          avatarUrl: null,
        },
      }),
      prisma.ad.updateMany({
        where: { userId, status: AdStatus.ACTIVE },
        data: { status: AdStatus.DELETED },
      }),
    ]);

    // S-04: invalidate all active sessions + cache
    await Promise.all([userCache.invalidate(userId), tokenStore.deleteAllRefreshTokens(userId)]);

    // the transaction above flips this user's
    // ACTIVE ads to DELETED, but nothing invalidated the ads-list / homepage
    // caches, so a deleted account's ads kept showing for up to ~40s.
    await bumpAdsCacheVersionAndHome();

    // Cloudinary cleanup is deliberately after the transaction (the
    // DB state is authoritative; the images are orphaned-by-design
    // once the row is anonymized) and best-effort (a Cloudinary
    // failure must never fail a deletion that already succeeded).
    const toDelete = [
      ...(avatarPublicId ? [avatarPublicId] : []),
      ...adPublicIds,
    ];
    if (toDelete.length > 0) {
      await cleanupUploadedImages(toDelete).catch((error) => reportBackgroundFailure('backend/src/modules/users/users.service.ts', error));
    }
  },


  /**
   * previously changePassword only updated passwordHash and
   * did nothing else — every other active session (refresh tokens on
   * other devices, and the current access token for its remaining
   * ~15min lifetime) stayed fully valid after the change. This is the
   * exact scenario changing a password is meant to defend against: if
   * an account is compromised, an attacker's session must not survive
   * the legitimate user's password change. Mirrors the same
   * session-invalidation pattern already used by logoutAll() and
   * deleteMe() (S-04) — deleteAllRefreshTokens + cache invalidation —
   * plus blacklisting the *current* access token, since unlike
   * deleteMe the user stays logged in on the device they used to
   * change the password and only that one session should remain valid.
   */
  changePassword: async (
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentAccessToken?: string,
  ): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    // passwordHash is null for OAuth-only accounts (no
    // local password was ever set), so there's nothing for
    // currentPassword to be compared against.
    if (!user.passwordHash) {
      throw new BadRequestError(
        'This account has no password set (signed up via Google) — password change is not available',
        'NO_PASSWORD_SET'
      );
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestError('Current password is incorrect', 'CURRENT_PASSWORD_INVALID');

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Invalidate every other session. The current access token is
    // blacklisted too — the caller must re-authenticate (or, in
    // practice, the frontend re-logs-in with the fresh token pair it
    // already has from this same request) rather than silently
    // continuing to ride the pre-change token until it naturally expires.
    const ttl = currentAccessToken ? getTokenRemainingTTL(currentAccessToken) : 0;
    await Promise.all([
      tokenStore.deleteAllRefreshTokens(userId),
      userCache.invalidate(userId),
      ttl > 0 && currentAccessToken
        ? tokenStore.blacklistAccessToken(currentAccessToken, ttl)
        : Promise.resolve(),
    ]);

    auditLog({ event: AuditEvent.PASSWORD_CHANGED, userId }).catch((error) => reportBackgroundFailure('backend/src/modules/users/users.service.ts', error));

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment — same call site as the auditLog() line directly above,
    // since both are "record that this happened" side effects of the
    // exact same successful password change.
    activityService.record({ userId, ...activityTemplates.passwordChanged() });
  },

  /**
   * Closes report item #8: previously there was no server-side avatar
   * upload endpoint, so the only option was an unsigned client-side upload
   * directly to Cloudinary (exposing the upload preset to the browser).
   * This follows the same pattern as ads.service.ts's addImages — upload
   * first, then persist the URL, with cleanup if either step fails.
   */
  uploadAvatar: async (userId: string, file: Express.Multer.File): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const { url, publicId } = await uploadAvatar(file.buffer);

    try {
      const updated = await usersRepository.update(userId, { avatarUrl: url });
      await userCache.invalidate(userId);

      // Best-effort: delete the previous avatar now that the new one is saved.
      if (user.avatarUrl) {
        const oldPublicId = extractCloudinaryPublicId(user.avatarUrl);
        if (oldPublicId) await deleteImage(oldPublicId).catch((error) => reportBackgroundFailure('backend/src/modules/users/users.service.ts', error));
      }

      return updated;
    } catch (error) {
      // DB update failed — clean up the just-uploaded image so it doesn't orphan.
      await cleanupUploadedImages([publicId]);
      throw error;
    }
  },
};