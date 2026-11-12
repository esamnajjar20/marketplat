import { blockedUsersRepository, UserBlockWithBlockedUser } from './blocked-users.repository';
import { usersRepository } from '../../identity/users/users.repository';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { buildPaginationMeta } from '../../../shared/http/pagination';
import { PaginatedResult } from '../../../shared/types/pagination.types';
import { isPrismaError } from '../../../shared/db/prismaErrors';

export const blockedUsersService = {
  /**
   * Toggles a block the same way storesService.toggleFollow toggles a
   * follow: one endpoint, existing-row-means-remove-it. Directional on
   * write (only the caller's own blockerId row is created/deleted) but
   * conversations.service enforces the block in both directions when
   * deciding whether a thread/message is allowed — see
   * blockedUsersRepository.existsEitherDirection.
   */
  toggleBlock: async (
    blockerId: string,
    blockedId: string
  ): Promise<{ action: 'blocked' | 'unblocked' }> => {
    if (blockerId === blockedId) {
      throw new ForbiddenError('You cannot block yourself.', 'CANNOT_BLOCK_SELF');
    }

    const targetUser = await usersRepository.findById(blockedId);
    if (!targetUser) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const existing = await blockedUsersRepository.findByBlockerAndBlocked(blockerId, blockedId);
    if (existing) {
      try {
        await blockedUsersRepository.delete(blockerId, blockedId);
      } catch (err) {
        if (!isPrismaError(err, 'P2025')) throw err;
      }
      return { action: 'unblocked' };
    }

    try {
      await blockedUsersRepository.create(blockerId, blockedId);
    } catch (err) {
      if (!isPrismaError(err, 'P2002')) throw err;
    }
    return { action: 'blocked' };
  },

  unblock: async (blockerId: string, blockedId: string): Promise<{ action: 'unblocked' }> => {
    if (blockerId === blockedId) throw new ForbiddenError('You cannot unblock yourself.', 'CANNOT_UNBLOCK_SELF');
    try {
      await blockedUsersRepository.delete(blockerId, blockedId);
    } catch (err) {
      if (!isPrismaError(err, 'P2025')) throw err;
    }
    return { action: 'unblocked' };
  },

  getMyBlockedUsers: async (
    blockerId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<UserBlockWithBlockedUser>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { blocks, total } = await blockedUsersRepository.findManyByBlockerId(blockerId, query);
    return { items: blocks, meta: buildPaginationMeta(total, page, limit) };
  },

  /** Directional status: has the caller blocked this specific user? */
  isBlockedBy: async (blockerId: string, blockedId: string): Promise<boolean> => {
    if (!blockedId || blockerId === blockedId) return false;
    return Boolean(await blockedUsersRepository.findByBlockerAndBlocked(blockerId, blockedId));
  },

  /** Batch status for the other parties in one page of conversations. */
  getBlockedIdsByBlocker: (
    blockerId: string,
    blockedIds: string[],
  ): Promise<string[]> => blockedUsersRepository.findBlockedIdsByBlocker(blockerId, blockedIds),

  /** Shared by conversations.service to gate startFromAd/sendMessage —
   * true if either party has blocked the other. */
  isBlockedEitherDirection: (userIdA: string, userIdB: string): Promise<boolean> =>
    blockedUsersRepository.existsEitherDirection(userIdA, userIdB),
};
