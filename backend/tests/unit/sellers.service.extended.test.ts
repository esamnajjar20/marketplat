import { sellersService } from '../../src/modules/sellers/sellers.service';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { usersRepository } from '../../src/modules/users/users.repository';
import { prisma } from '../../src/config/prisma';
import { redis } from '../../src/config/redis';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

// Deliberately NOT mocking sellerLock here (unlike sellers.service.test.ts)
// so withSellerProfileCreationLock runs for real against the mocked redis
// from tests/setup.ts — this is the only place the lock's actual
// acquire/release/mutual-exclusion behavior gets exercised.
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/modules/users/users.repository');

const userId = 'user-1';
const user = { id: userId, email: 'seller@example.com', name: 'Sam Seller', avatarUrl: null };
const mockProfile = { id: 'seller-profile-1', userId, suspended: false } as any;

describe('sellersService — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis as any).__clear();
  });

  describe('createSellerProfile', () => {
    it('throws NotFoundError when the user record does not exist', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws BadRequestError when the user has not verified their email', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue({ ...user, email: null });

      await expect(
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any)
      ).rejects.toThrow(BadRequestError);
    });

    it('creates a profile, falling back to the user name/avatar when displayName/avatarUrl are omitted', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue({
        ...user,
        avatarUrl: 'https://example.com/avatar.png',
      });
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (sellersRepository.create as jest.Mock).mockResolvedValue(mockProfile);

      const result = await sellersService.createSellerProfile(userId, {
        agreedToSellerTerms: true,
      } as any);

      expect(result).toEqual(mockProfile);
      expect(sellersRepository.create).toHaveBeenCalledWith(
        {},
        userId,
        expect.objectContaining({
          displayName: user.name,
          avatarUrl: 'https://example.com/avatar.png',
        })
      );
    });

    it('uses the explicitly provided displayName/bio/avatarUrl over the user defaults', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (sellersRepository.create as jest.Mock).mockResolvedValue(mockProfile);

      await sellersService.createSellerProfile(userId, {
        agreedToSellerTerms: true,
        displayName: 'Custom Shop Name',
        bio: 'We sell quality goods',
        avatarUrl: 'https://example.com/custom.png',
      } as any);

      expect(sellersRepository.create).toHaveBeenCalledWith(
        {},
        userId,
        expect.objectContaining({
          displayName: 'Custom Shop Name',
          bio: 'We sell quality goods',
          avatarUrl: 'https://example.com/custom.png',
        })
      );
    });

    it('throws ConflictError from the unlocked pre-check when a profile already exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockProfile);

      await expect(
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any)
      ).rejects.toThrow(ConflictError);
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('throws ConflictError from the in-lock re-check even when the pre-check passed', async () => {
      (sellersRepository.findByUserId as jest.Mock)
        .mockResolvedValueOnce(null) // pre-lock check
        .mockResolvedValueOnce(mockProfile); // in-lock re-check
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);

      await expect(
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any)
      ).rejects.toThrow(ConflictError);
      expect(sellersRepository.create).not.toHaveBeenCalled();
    });

    it('translates a P2002 unique-constraint error into ConflictError (belt-and-suspenders)', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue({ code: 'P2002' });

      await expect(
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any)
      ).rejects.toThrow(ConflictError);
    });

    it('rethrows a non-P2002 transaction error unchanged', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      const dbError = new Error('connection pool exhausted');
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue(dbError);

      await expect(
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any)
      ).rejects.toThrow('connection pool exhausted');
    });

    it('rejects the second of two concurrent createSellerProfile calls for the same user', async () => {
      let created = false;
      (sellersRepository.findByUserId as jest.Mock).mockImplementation(async () =>
        created ? mockProfile : null
      );
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (sellersRepository.create as jest.Mock).mockImplementation(async () => {
        created = true;
        return mockProfile;
      });

      const results = await Promise.allSettled([
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any),
        sellersService.createSellerProfile(userId, { agreedToSellerTerms: true } as any),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    });

    it('allows two different users to create profiles concurrently without contending on the same lock key', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (sellersRepository.create as jest.Mock).mockResolvedValue(mockProfile);

      const results = await Promise.allSettled([
        sellersService.createSellerProfile('user-a', { agreedToSellerTerms: true } as any),
        sellersService.createSellerProfile('user-b', { agreedToSellerTerms: true } as any),
      ]);

      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('getMySellerProfile', () => {
    it('returns the profile when it exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockProfile);
      const result = await sellersService.getMySellerProfile(userId);
      expect(result).toEqual(mockProfile);
    });

    it('throws NotFoundError when the caller has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      await expect(sellersService.getMySellerProfile(userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getPublicSellerProfile', () => {
    it('returns the profile with its ads when it exists', async () => {
      const withAds = { ...mockProfile, ads: [{ id: 'ad-1' }] };
      (sellersRepository.findPublicProfile as jest.Mock).mockResolvedValue(withAds);
      const result = await sellersService.getPublicSellerProfile('seller-profile-1');
      expect(result).toEqual(withAds);
    });

    it('throws NotFoundError for a nonexistent seller', async () => {
      (sellersRepository.findPublicProfile as jest.Mock).mockResolvedValue(null);
      await expect(sellersService.getPublicSellerProfile('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('setVerification', () => {
    it('verifies an existing seller profile', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(mockProfile);
      (sellersRepository.setVerification as jest.Mock).mockResolvedValue({
        ...mockProfile,
        verified: true,
      });

      const result = await sellersService.setVerification('seller-profile-1', true);
      expect(result.verified).toBe(true);
      expect(sellersRepository.setVerification).toHaveBeenCalledWith('seller-profile-1', true);
    });

    it('unverifies an existing seller profile', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ ...mockProfile, verified: true });
      (sellersRepository.setVerification as jest.Mock).mockResolvedValue({
        ...mockProfile,
        verified: false,
      });

      const result = await sellersService.setVerification('seller-profile-1', false);
      expect(result.verified).toBe(false);
    });

    it('throws NotFoundError for a nonexistent seller', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(sellersService.setVerification('missing', true)).rejects.toThrow(NotFoundError);
    });
  });
});
