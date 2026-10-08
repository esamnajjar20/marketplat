import { Request, Response, NextFunction } from 'express';
import { FollowTargetType } from '@prisma/client';
import { followsService } from './follows.service';
import { followListQuerySchema, followTargetSchema, toggleFollowSchema, userIdSchema } from './follows.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

const listResponse = (message: string, result: any) => successResponse(message, result.items, { pagination: result.meta });

export const followsController = {
  feed: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = followListQuerySchema.parse({ query: req.query });
      const result = await followsService.getFollowingFeed(user.userId, query.page, query.limit);
      res.status(200).json(listResponse('Following feed fetched', result));
    } catch (error) { next(error); }
  },

  toggle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { body } = toggleFollowSchema.parse({ body: req.body });
      const result = await followsService.toggle(user.userId, body);
      res.status(200).json(successResponse('Follow status updated', result));
    } catch (error) { next(error); }
  },

  status: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { params } = followTargetSchema.parse({ params: req.params });
      const following = await followsService.status(user.userId, params.targetType, params.targetId);
      res.status(200).json(successResponse('Follow status fetched', { following }));
    } catch (error) { next(error); }
  },

  myFollowing: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { query } = followListQuerySchema.parse({ query: req.query });
      const result = await followsService.getFollowing(user.userId, query.type, query.page, query.limit);
      res.status(200).json(listResponse('Following fetched', result));
    } catch (error) { next(error); }
  },

  userFollowers: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { params } = userIdSchema.parse({ params: req.params });
      const { query } = followListQuerySchema.parse({ query: req.query });
      const result = await followsService.getFollowers(FollowTargetType.USER, params.id, query.page, query.limit);
      res.status(200).json(listResponse('Followers fetched', result));
    } catch (error) { next(error); }
  },

  userFollowing: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { params } = userIdSchema.parse({ params: req.params });
      const { query } = followListQuerySchema.parse({ query: req.query });
      const result = await followsService.getFollowing(params.id, FollowTargetType.USER, query.page, query.limit);
      res.status(200).json(listResponse('Following fetched', result));
    } catch (error) { next(error); }
  },

  targetFollowers: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { params } = followTargetSchema.parse({ params: req.params });
      const { query } = followListQuerySchema.parse({ query: req.query });
      const result = await followsService.getFollowers(params.targetType, params.targetId, query.page, query.limit);
      res.status(200).json(listResponse('Followers fetched', result));
    } catch (error) { next(error); }
  },
};
