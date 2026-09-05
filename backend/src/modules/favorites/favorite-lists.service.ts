/**
 * Named favorite lists — "سيارات", "هواتف", ...
 * Default unlisted favorites keep listId = null (Inbox / الكل).
 */
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';

const MAX_LISTS_PER_USER = 20;

export const favoriteListsService = {
  list: async (userId: string) => {
    const lists = await prisma.favoriteList.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { favorites: true } } },
    });
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      sortOrder: l.sortOrder,
      itemsCount: l._count.favorites,
      createdAt: l.createdAt,
    }));
  },

  create: async (userId: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      throw new BadRequestError('List name must be 1–40 characters.', 'INVALID_LIST_NAME');
    }
    const count = await prisma.favoriteList.count({ where: { userId } });
    if (count >= MAX_LISTS_PER_USER) {
      throw new BadRequestError(`Maximum ${MAX_LISTS_PER_USER} lists allowed.`, 'LIST_LIMIT');
    }
    try {
      return await prisma.favoriteList.create({
        data: { userId, name: trimmed, sortOrder: count },
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictError('A list with this name already exists.', 'LIST_NAME_EXISTS');
      }
      throw e;
    }
  },

  rename: async (userId: string, listId: string, name: string) => {
    const list = await prisma.favoriteList.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundError('List not found', 'LIST_NOT_FOUND');
    if (list.userId !== userId) throw new ForbiddenError('Not your list.', 'NOT_YOUR_LIST');
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      throw new BadRequestError('List name must be 1–40 characters.', 'INVALID_LIST_NAME');
    }
    try {
      return await prisma.favoriteList.update({
        where: { id: listId },
        data: { name: trimmed },
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictError('A list with this name already exists.', 'LIST_NAME_EXISTS');
      }
      throw e;
    }
  },

  remove: async (userId: string, listId: string) => {
    const list = await prisma.favoriteList.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundError('List not found', 'LIST_NOT_FOUND');
    if (list.userId !== userId) throw new ForbiddenError('Not your list.', 'NOT_YOUR_LIST');
    // favorites.listId → SET NULL via FK; items return to "unlisted"
    await prisma.favoriteList.delete({ where: { id: listId } });
  },

  /** Move an existing favorite row into a list (or null = unlisted). */
  moveFavorite: async (userId: string, favoriteId: string, listId: string | null) => {
    const fav = await prisma.favorite.findUnique({ where: { id: favoriteId } });
    if (!fav) throw new NotFoundError('Favorite not found', 'FAVORITE_NOT_FOUND');
    if (fav.userId !== userId) throw new ForbiddenError('Not your favorite.', 'NOT_YOUR_FAVORITE');

    if (listId) {
      const list = await prisma.favoriteList.findUnique({ where: { id: listId } });
      if (!list || list.userId !== userId) {
        throw new NotFoundError('List not found', 'LIST_NOT_FOUND');
      }
    }

    return prisma.favorite.update({
      where: { id: favoriteId },
      data: { listId },
    });
  },
};
