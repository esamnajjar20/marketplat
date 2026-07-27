import { usersRepository, SafeUser, PublicUser } from './users.repository';
import { hashPassword, comparePassword } from '../../shared/utils/hash';
import { UpdateProfileInput, UpdateNotificationPreferencesInput } from './users.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { userCache } from '../../shared/utils/userCache';
import { tokenStore } from '../../shared/utils/tokenStore';
import { getTokenRemainingTTL } from '../../shared/utils/jwt';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { prisma } from '../../config/prisma';
import { AdStatus } from '@prisma/client';
import { uploadAvatar, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';

export const usersService = {
  getMe: async (userId: string): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    return user;
  },

  getUserById: async (id: string): Promise<PublicUser> => {
    const user = await usersRepository.findPublicById(id);
    if (!user || !user.isActive) throw new NotFoundError('User not found');
    return {
      id: user.id,
      name: user.name,
      city: user.city,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  },

  getUserAds: async (userId: string, query: { page?: number; limit?: number }) => {
    const user = await usersRepository.findById(userId);
    if (!user || !user.isActive) throw new NotFoundError('User not found');
    const page = query.page || 1;
    const limit = query.limit || 20;
    // S-05: statusFilter pushed to DB — total now only counts ACTIVE ads
    // Previously filtering in app layer caused total to include SOLD ads (info leak)
    const { ads, total } = await adsService.getUserAdsForProfile(userId, { page, limit });
    return { items: ads, meta: buildPaginationMeta(total, page, limit) };
  },

  updateMe: async (userId: string, input: UpdateProfileInput): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (input.phone && input.phone !== user.phone) {
      const existing = await usersRepository.findByPhone(input.phone);
      if (existing) throw new BadRequestError('Phone number already in use');
    }
    const updated = await usersRepository.update(userId, input);
    await userCache.invalidate(userId);
    return updated;
  },

  /**
   * FIX FEAT-02: previously NotificationSettingsForm.tsx's save button
   * had nothing to call — this is the first time these preferences are
   * actually persisted anywhere.
   */
  updateNotificationPreferences: async (
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<SafeUser> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    const updated = await usersRepository.updateNotificationPreferences(userId, input);
    await userCache.invalidate(userId);
    return updated;
  },

  // D-01: cascade ACTIVE ads to DELETED + S-04: revoke all tokens
  deleteMe: async (userId: string): Promise<void> => {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    // Deactivate user + hide all their active ads atomically
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { isActive: false } }),
      prisma.ad.updateMany({
        where: { userId, status: AdStatus.ACTIVE },
        data: { status: AdStatus.DELETED },
      }),
    ]);

    // S-04: invalidate all active sessions + cache
    await Promise.all([userCache.invalidate(userId), tokenStore.deleteAllRefreshTokens(userId)]);
  },


  /**
   * FIX SEC-07: previously changePassword only updated passwordHash and
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
    if (!user) throw new NotFoundError('User not found');

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestError('كلمة المرور الحالية غير صحيحة');

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

    auditLog({ event: AuditEvent.PASSWORD_CHANGED, userId }).catch(() => {});
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
    if (!user) throw new NotFoundError('User not found');

    const { url, publicId } = await uploadAvatar(file.buffer);

    try {
      const updated = await usersRepository.update(userId, { avatarUrl: url });
      await userCache.invalidate(userId);

      // Best-effort: delete the previous avatar now that the new one is saved.
      if (user.avatarUrl) {
        const oldPublicId = extractCloudinaryPublicId(user.avatarUrl);
        if (oldPublicId) await deleteImage(oldPublicId).catch(() => undefined);
      }

      return updated;
    } catch (error) {
      // DB update failed — clean up the just-uploaded image so it doesn't orphan.
      await cleanupUploadedImages([publicId]);
      throw error;
    }
  },
};