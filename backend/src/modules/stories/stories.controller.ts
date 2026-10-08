import { Request, Response, NextFunction } from 'express';
import { storiesService } from './stories.service';
import { createStorySchema, storyIdSchema, userStorySchema } from './stories.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const storiesController = {
  feed: async (req: Request, res: Response, next: NextFunction) => {
    try { const user = requireUser(req); res.json(successResponse('Stories fetched', await storiesService.feed(user.userId))); } catch (e) { next(e); }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { body } = createStorySchema.parse({ body: req.body });
      const file = req.file as Express.Multer.File | undefined;
      res.status(201).json(successResponse('Story created', await storiesService.create(user.userId, body, file)));
    } catch (e) { next(e); }
  },
  userStories: async (req: Request, res: Response, next: NextFunction) => {
    try { const { params } = userStorySchema.parse({ params: req.params }); res.json(successResponse('User stories fetched', await storiesService.userStories(req.user?.userId ?? null, params.userId))); } catch (e) { next(e); }
  },
  view: async (req: Request, res: Response, next: NextFunction) => {
    try { const viewer = requireUser(req); const { params } = storyIdSchema.parse({ params: req.params }); res.json(successResponse('Story viewed', await storiesService.view(viewer.userId, params.id))); } catch (e) { next(e); }
  },
  delete: async (req: Request, res: Response, next: NextFunction) => {
    try { const user = requireUser(req); const { params } = storyIdSchema.parse({ params: req.params }); await storiesService.delete(user.userId, params.id); res.json(successResponse('Story deleted', null)); } catch (e) { next(e); }
  },
  viewers: async (req: Request, res: Response, next: NextFunction) => {
    try { const user = requireUser(req); const { params } = storyIdSchema.parse({ params: req.params }); res.json(successResponse('Story viewers fetched', await storiesService.viewers(user.userId, params.id))); } catch (e) { next(e); }
  },
};
