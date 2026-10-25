import { Prisma } from '@prisma/client';
import { blockedUsersService } from '../../src/modules/blocked-users/blocked-users.service';
import { blockedUsersRepository } from '../../src/modules/blocked-users/blocked-users.repository';
import { usersRepository } from '../../src/modules/users/users.repository';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';

jest.mock('../../src/modules/blocked-users/blocked-users.repository');
jest.mock('../../src/modules/users/users.repository');

const blockerId = 'user-1';
const blockedId = 'user-2';
const mockTargetUser = { id: blockedId, name: 'Target' } as any;

const prismaKnownError = (code: string) => {
  const err = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
  err.code = code;
  return err;
};

describe('blockedUsersService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('toggleBlock', () => {
    it('throws ForbiddenError when blocking yourself', async () => {
      await expect(blockedUsersService.toggleBlock(blockerId, blockerId)).rejects.toThrow(
        ForbiddenError
      );
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the target user does not exist', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(blockedUsersService.toggleBlock(blockerId, blockedId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('creates a block and returns "blocked" when none exists yet', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockTargetUser);
      (blockedUsersRepository.findByBlockerAndBlocked as jest.Mock).mockResolvedValue(null);
      (blockedUsersRepository.create as jest.Mock).mockResolvedValue({ id: 'b-1' });

      const result = await blockedUsersService.toggleBlock(blockerId, blockedId);

      expect(blockedUsersRepository.create).toHaveBeenCalledWith(blockerId, blockedId);
      expect(result).toEqual({ action: 'blocked' });
    });

    it('removes the block and returns "unblocked" when one already exists', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockTargetUser);
      (blockedUsersRepository.findByBlockerAndBlocked as jest.Mock).mockResolvedValue({ id: 'b-1' });
      (blockedUsersRepository.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await blockedUsersService.toggleBlock(blockerId, blockedId);

      expect(blockedUsersRepository.delete).toHaveBeenCalledWith(blockerId, blockedId);
      expect(result).toEqual({ action: 'unblocked' });
    });

    it('swallows a P2002 unique-violation race on create and still returns "blocked"', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockTargetUser);
      (blockedUsersRepository.findByBlockerAndBlocked as jest.Mock).mockResolvedValue(null);
      (blockedUsersRepository.create as jest.Mock).mockRejectedValue(prismaKnownError('P2002'));

      const result = await blockedUsersService.toggleBlock(blockerId, blockedId);
      expect(result).toEqual({ action: 'blocked' });
    });

    it('swallows a P2025 not-found race on delete and still returns "unblocked"', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockTargetUser);
      (blockedUsersRepository.findByBlockerAndBlocked as jest.Mock).mockResolvedValue({ id: 'b-1' });
      (blockedUsersRepository.delete as jest.Mock).mockRejectedValue(prismaKnownError('P2025'));

      const result = await blockedUsersService.toggleBlock(blockerId, blockedId);
      expect(result).toEqual({ action: 'unblocked' });
    });

    it('rethrows an unrelated error on create', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockTargetUser);
      (blockedUsersRepository.findByBlockerAndBlocked as jest.Mock).mockResolvedValue(null);
      (blockedUsersRepository.create as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(blockedUsersService.toggleBlock(blockerId, blockedId)).rejects.toThrow('db down');
    });
  });

  describe('getMyBlockedUsers', () => {
    it('returns paginated blocked users with defaulted page/limit meta', async () => {
      (blockedUsersRepository.findManyByBlockerId as jest.Mock).mockResolvedValue({
        blocks: [{ id: 'b-1', blocked: mockTargetUser }],
        total: 1,
      });

      const result = await blockedUsersService.getMyBlockedUsers(blockerId, {});

      expect(result.items).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('isBlockedEitherDirection', () => {
    it('delegates to the repository', async () => {
      (blockedUsersRepository.existsEitherDirection as jest.Mock).mockResolvedValue(true);

      const result = await blockedUsersService.isBlockedEitherDirection('a', 'b');

      expect(blockedUsersRepository.existsEitherDirection).toHaveBeenCalledWith('a', 'b');
      expect(result).toBe(true);
    });
  });
});
