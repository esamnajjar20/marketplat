import { sellersService } from '../../src/modules/sellers/sellers.service';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { usersRepository } from '../../src/modules/users/users.repository';
import { prisma } from '../../src/config/prisma';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/shared/utils/sellerLock', () => ({
  withSellerProfileCreationLock: (_userId: string, fn: () => Promise<any>) => fn(),
}));

const mockProfile = { id: 'seller-profile-1', userId: 'user-1', suspended: false };

describe('SellersService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createRating — self-rating guard', () => {
    it('rejects a seller rating their own profile', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(mockProfile);

      await expect(
        sellersService.createRating('seller-profile-1', 'user-1', { adId: 'ad-1', score: 5 } as any)
      ).rejects.toThrow(ForbiddenError);

      expect(sellersRepository.createRating).not.toHaveBeenCalled();
    });

    it('allows a genuinely different rater', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (sellersRepository.createRating as jest.Mock).mockResolvedValue(undefined);
      (sellersRepository.recomputeRatingAggregate as jest.Mock).mockResolvedValue(undefined);

      await expect(
        sellersService.createRating('seller-profile-1', 'other-user', {
          adId: 'ad-1',
          score: 5,
        } as any)
      ).resolves.not.toThrow();

      expect(sellersRepository.createRating).toHaveBeenCalled();
    });

    it('translates a duplicate-rating P2002 into ConflictError', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue({ code: 'P2002' });

      await expect(
        sellersService.createRating('seller-profile-1', 'other-user', {
          adId: 'ad-1',
          score: 5,
        } as any)
      ).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError for a nonexistent seller profile', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        sellersService.createRating('missing', 'user-1', { adId: 'ad-1', score: 5 } as any)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('ensureSellerProfileForAdCreation — suspension gate', () => {
    it('blocks a suspended seller from creating new ads', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({
        ...mockProfile,
        suspended: true,
      });

      await expect(sellersService.ensureSellerProfileForAdCreation('user-1')).rejects.toThrow(
        ForbiddenError
      );
    });

    it('allows a non-suspended seller through', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockProfile);
      const result = await sellersService.ensureSellerProfileForAdCreation('user-1');
      expect(result).toEqual(mockProfile);
    });

    it('requires a seller profile to exist first', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      await expect(sellersService.ensureSellerProfileForAdCreation('user-1')).rejects.toThrow(
        BadRequestError
      );
    });
  });

  describe('setSuspension — admin suspend/unsuspend (audit #4)', () => {
    it('suspends an existing seller profile', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(mockProfile);
      (sellersRepository.setSuspension as jest.Mock).mockResolvedValue({
        ...mockProfile,
        suspended: true,
      });

      const result = await sellersService.setSuspension('seller-profile-1', true);
      expect(result.suspended).toBe(true);
      expect(sellersRepository.setSuspension).toHaveBeenCalledWith('seller-profile-1', true);
    });

    it('unsuspends an existing seller profile', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        ...mockProfile,
        suspended: true,
      });
      (sellersRepository.setSuspension as jest.Mock).mockResolvedValue({
        ...mockProfile,
        suspended: false,
      });

      const result = await sellersService.setSuspension('seller-profile-1', false);
      expect(result.suspended).toBe(false);
    });

    it('throws NotFoundError when suspending a nonexistent seller', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(sellersService.setSuspension('missing', true)).rejects.toThrow(NotFoundError);
    });
  });

  describe('createSellerProfile', () => {
    it('rejects when the user already has a seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockProfile);

      await expect(
        sellersService.createSellerProfile('user-1', { agreedToSellerTerms: true } as any)
      ).rejects.toThrow(ConflictError);
    });

    it('rejects when the user has not agreed to seller terms', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      (usersRepository.findById as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

      await expect(
        sellersService.createSellerProfile('user-1', { agreedToSellerTerms: false } as any)
      ).rejects.toThrow(BadRequestError);
    });
  });
});
