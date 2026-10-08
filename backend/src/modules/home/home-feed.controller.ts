import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../shared/types/api-response.types';
import { getHomepageSchema } from './home.validation';
import { getCachedHomeFeedWithStatus } from './home-feed.cache';

export const homeFeedController = {
  getHomeFeed: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getHomepageSchema.parse({ query: req.query });
      const authHeader = req.headers.authorization;
      const { value, status } = await getCachedHomeFeedWithStatus(query, authHeader);

      res.setHeader('X-App-Cache', status);
      res.status(200).json(successResponse('Home feed fetched', value));
    } catch (error) {
      next(error);
    }
  },
};
