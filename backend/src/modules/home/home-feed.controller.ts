import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../shared/types/api-response.types';
import { getHomepageSchema } from './home.validation';
import { homeFeedService } from './home-feed.service';
import { getCachedHomeFeedWithStatus } from './home-feed.cache';

export const homeFeedController = {
  getHomeFeed: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getHomepageSchema.parse({ query: req.query });
      const authHeader = req.headers.authorization;
      const { value, status } = await getCachedHomeFeedWithStatus(query, authHeader);

      res.setHeader('X-App-Cache', status);
      // Feed varies by bearer identity, so it must never be shared by a CDN.
      // Redis still removes the repeated backend assembly for the same viewer.
      res.setHeader('Vary', 'Authorization, Accept-Encoding');
      res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
      res.status(200).json(successResponse('Home feed fetched', value));
    } catch (error) {
      next(error);
    }
  },
};
