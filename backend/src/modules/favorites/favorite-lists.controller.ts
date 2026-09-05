import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { favoriteListsService } from './favorite-lists.service';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

const nameBody = z.object({
  body: z.object({ name: z.string().min(1).max(40) }),
});
const listIdParams = z.object({
  params: z.object({ listId: z.string().cuid() }),
});
const moveBody = z.object({
  params: z.object({ favoriteId: z.string().cuid() }),
  body: z.object({ listId: z.string().cuid().nullable() }),
});

export const favoriteListsController = {
  list: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const items = await favoriteListsService.list(user.userId);
      res.status(200).json(successResponse('Favorite lists fetched', items));
    } catch (e) {
      next(e);
    }
  },

  create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = nameBody.parse({ body: req.body });
      const list = await favoriteListsService.create(user.userId, body.name);
      res.status(201).json(successResponse('List created', list));
    } catch (e) {
      next(e);
    }
  },

  rename: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = listIdParams.parse({ params: req.params });
      const { body } = nameBody.parse({ body: req.body });
      const list = await favoriteListsService.rename(user.userId, params.listId, body.name);
      res.status(200).json(successResponse('List renamed', list));
    } catch (e) {
      next(e);
    }
  },

  remove: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = listIdParams.parse({ params: req.params });
      await favoriteListsService.remove(user.userId, params.listId);
      res.status(200).json(successResponse('List deleted'));
    } catch (e) {
      next(e);
    }
  },

  moveFavorite: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = moveBody.parse({ params: req.params, body: req.body });
      const fav = await favoriteListsService.moveFavorite(
        user.userId,
        params.favoriteId,
        body.listId
      );
      res.status(200).json(successResponse('Favorite moved', fav));
    } catch (e) {
      next(e);
    }
  },
};
