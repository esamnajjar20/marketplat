import { usersService } from '../../src/modules/users/users.service';
import { usersRepository } from '../../src/modules/users/users.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import { userCache } from '../../src/shared/utils/userCache';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { prisma } from '../../src/config/prisma';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { hashPassword } from '../../src/shared/utils/hash';
import { uploadAvatar, deleteImage } from '../../src/config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../src/shared/utils/cloudinaryHelpers';
import jwt from 'jsonwebtoken';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/modules/ads/ads.service');
jest.mock('../../src/config/cloudinary', () => ({
  uploadAvatar: jest.fn(),
  deleteImage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/shared/utils/cloudinaryHelpers', () => ({
  extractCloudinaryPublicId: jest.fn(),
  cleanupUploadedImages: jest.fn().mockResolvedValue(undefined),
}));

const mockUser = {
  id: 'user-1',
  name: 'Test',
  email: 'test@example.com',
  phone: null,
  city: null,
  bio: null,
  avatarUrl: null,
  role: 'USER',
  isActive: true,
  createdAt: new Date(),
};

describe('UsersService', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => jest.restoreAllMocks());

  describe('getMe', () => {
    it('returns user when found', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      const result = await usersService.getMe('user-1');
      expect(result.email).toBe('test@example.com');
    });

    it('throws when not found', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(usersService.getMe('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserById', () => {
    it('throws for inactive user', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });
      await expect(usersService.getUserById('user-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserAds', () => {
    it('returns paginated ads', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (adsService.getUserAdsForProfile as jest.Mock).mockResolvedValue({ ads: [], total: 0 });

      const result = await usersService.getUserAds('user-1', { page: 1, limit: 10 });
      expect(result.meta.total).toBe(0);
    });
  });

  describe('updateMe', () => {
    it('throws when phone already in use', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (usersRepository.findByPhone as jest.Mock).mockResolvedValue({ id: 'other' });

      await expect(usersService.updateMe('user-1', { phone: '+966501111111' })).rejects.toThrow(
        BadRequestError
      );
    });

    it('updates and invalidates cache', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (usersRepository.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'Updated' });
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);

      const result = await usersService.updateMe('user-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
      expect(userCache.invalidate).toHaveBeenCalledWith('user-1');
    });
  });

  describe('deleteMe', () => {
    it('deactivates user and revokes tokens', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      jest.spyOn(prisma, '$transaction').mockResolvedValue([] as any);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      await usersService.deleteMe('user-1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalledWith('user-1');
    });
  });

  describe('changePassword', () => {
    it('updates the password hash when the current password is correct', async () => {
      const currentHash = await hashPassword('correct-current-password');
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', passwordHash: currentHash } as any);
      const updateSpy = jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      await usersService.changePassword('user-1', 'correct-current-password', 'newPassword123');

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const callArg = updateSpy.mock.calls[0][0] as any;
      expect(callArg.where).toEqual({ id: 'user-1' });
      // The new hash must differ from both the old hash and the plaintext.
      expect(callArg.data.passwordHash).not.toBe(currentHash);
      expect(callArg.data.passwordHash).not.toBe('newPassword123');
    });

    it('rejects when the current password is wrong', async () => {
      const currentHash = await hashPassword('correct-current-password');
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', passwordHash: currentHash } as any);
      const updateSpy = jest.spyOn(prisma.user, 'update');

      await expect(
        usersService.changePassword('user-1', 'wrong-password', 'newPassword123'),
      ).rejects.toThrow('كلمة المرور الحالية غير صحيحة');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the user does not exist', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      await expect(
        usersService.changePassword('missing', 'whatever', 'newPassword123'),
      ).rejects.toThrow(NotFoundError);
    });

    // FIX SEC-07 coverage: password change must invalidate every other
    // session, not just update the hash.
    it('invalidates all refresh tokens and the user cache after a successful change', async () => {
      const currentHash = await hashPassword('correct-current-password');
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', passwordHash: currentHash } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      const deleteAllSpy = jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);
      const invalidateSpy = jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);

      await usersService.changePassword('user-1', 'correct-current-password', 'newPassword123');

      expect(deleteAllSpy).toHaveBeenCalledWith('user-1');
      expect(invalidateSpy).toHaveBeenCalledWith('user-1');
    });

    it('blacklists the current access token when one is provided, using its remaining TTL', async () => {
      const currentHash = await hashPassword('correct-current-password');
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', passwordHash: currentHash } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      const blacklistSpy = jest.spyOn(tokenStore, 'blacklistAccessToken').mockResolvedValue(undefined);

      // A token signed to expire far in the future so getTokenRemainingTTL > 0.
      const futureToken = jwt.sign({ userId: 'user-1' }, 'test-secret-at-least-32-characters-long', { expiresIn: '15m' });

      await usersService.changePassword('user-1', 'correct-current-password', 'newPassword123', futureToken);

      expect(blacklistSpy).toHaveBeenCalledWith(futureToken, expect.any(Number));
      expect(blacklistSpy.mock.calls[0][1]).toBeGreaterThan(0);
    });

    it('does not attempt to blacklist anything when no access token is provided (e.g. called outside an HTTP request)', async () => {
      const currentHash = await hashPassword('correct-current-password');
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', passwordHash: currentHash } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      const blacklistSpy = jest.spyOn(tokenStore, 'blacklistAccessToken').mockResolvedValue(undefined);

      await usersService.changePassword('user-1', 'correct-current-password', 'newPassword123');

      expect(blacklistSpy).not.toHaveBeenCalled();
    });

    it('does NOT invalidate sessions when the current password is wrong', async () => {
      const currentHash = await hashPassword('correct-current-password');
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-1', passwordHash: currentHash } as any);
      const deleteAllSpy = jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      await expect(
        usersService.changePassword('user-1', 'wrong-password', 'newPassword123'),
      ).rejects.toThrow(BadRequestError);
      expect(deleteAllSpy).not.toHaveBeenCalled();
    });
  });

  describe('uploadAvatar', () => {
    const mockFile = { buffer: Buffer.from('fake-image-bytes') } as Express.Multer.File;

    it('uploads, persists the new avatarUrl, and invalidates the cache', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser); // avatarUrl: null
      (uploadAvatar as jest.Mock).mockResolvedValue({ url: 'https://res.cloudinary.com/demo/avatar.webp', publicId: 'classifieds/avatars/new-id' });
      (usersRepository.update as jest.Mock).mockResolvedValue({ ...mockUser, avatarUrl: 'https://res.cloudinary.com/demo/avatar.webp' });
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);

      const result = await usersService.uploadAvatar('user-1', mockFile);

      expect(uploadAvatar).toHaveBeenCalledWith(mockFile.buffer);
      expect(usersRepository.update).toHaveBeenCalledWith('user-1', { avatarUrl: 'https://res.cloudinary.com/demo/avatar.webp' });
      expect(userCache.invalidate).toHaveBeenCalledWith('user-1');
      expect(result.avatarUrl).toBe('https://res.cloudinary.com/demo/avatar.webp');
    });

    it('throws NotFoundError when the user does not exist', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(usersService.uploadAvatar('missing', mockFile)).rejects.toThrow(NotFoundError);
      expect(uploadAvatar).not.toHaveBeenCalled();
    });

    it('deletes the previous avatar from Cloudinary after a successful replace', async () => {
      const userWithExistingAvatar = { ...mockUser, avatarUrl: 'https://res.cloudinary.com/demo/old-avatar.webp' };
      (usersRepository.findById as jest.Mock).mockResolvedValue(userWithExistingAvatar);
      (uploadAvatar as jest.Mock).mockResolvedValue({ url: 'https://res.cloudinary.com/demo/new-avatar.webp', publicId: 'classifieds/avatars/new-id' });
      (usersRepository.update as jest.Mock).mockResolvedValue({ ...userWithExistingAvatar, avatarUrl: 'https://res.cloudinary.com/demo/new-avatar.webp' });
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      (extractCloudinaryPublicId as jest.Mock).mockReturnValue('classifieds/avatars/old-id');

      await usersService.uploadAvatar('user-1', mockFile);

      expect(extractCloudinaryPublicId).toHaveBeenCalledWith('https://res.cloudinary.com/demo/old-avatar.webp');
      expect(deleteImage).toHaveBeenCalledWith('classifieds/avatars/old-id');
    });

    it('does not attempt to delete anything when the user had no previous avatar', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser); // avatarUrl: null
      (uploadAvatar as jest.Mock).mockResolvedValue({ url: 'https://res.cloudinary.com/demo/new.webp', publicId: 'id-1' });
      (usersRepository.update as jest.Mock).mockResolvedValue({ ...mockUser, avatarUrl: 'https://res.cloudinary.com/demo/new.webp' });
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);

      await usersService.uploadAvatar('user-1', mockFile);

      expect(deleteImage).not.toHaveBeenCalled();
    });

    it('cleans up the newly-uploaded image if the database update fails', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (uploadAvatar as jest.Mock).mockResolvedValue({ url: 'https://res.cloudinary.com/demo/new.webp', publicId: 'orphan-id' });
      (usersRepository.update as jest.Mock).mockRejectedValue(new Error('DB write failed'));

      await expect(usersService.uploadAvatar('user-1', mockFile)).rejects.toThrow('DB write failed');
      expect(cleanupUploadedImages).toHaveBeenCalledWith(['orphan-id']);
    });

    it('does not delete the old avatar if the database update fails', async () => {
      const userWithExistingAvatar = { ...mockUser, avatarUrl: 'https://res.cloudinary.com/demo/old.webp' };
      (usersRepository.findById as jest.Mock).mockResolvedValue(userWithExistingAvatar);
      (uploadAvatar as jest.Mock).mockResolvedValue({ url: 'https://res.cloudinary.com/demo/new.webp', publicId: 'orphan-id' });
      (usersRepository.update as jest.Mock).mockRejectedValue(new Error('DB write failed'));

      await expect(usersService.uploadAvatar('user-1', mockFile)).rejects.toThrow();
      // The OLD avatar must survive since the new one never got persisted.
      expect(deleteImage).not.toHaveBeenCalledWith('classifieds/avatars/old-id');
    });
  });
});
