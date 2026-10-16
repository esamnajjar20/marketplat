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

  /**
   * GET /home/static — the GUEST homepage feed (same payload shape as /home/feed).
   *
   * Identity is ignored ON PURPOSE (no Authorization is read): the response is the
   * single guest payload every anonymous visitor gets, so the route is public and
   * edge-cacheable (CACHE.PUBLIC_HOME). Personalisation stays on /home/feed
   * (private), which signed-in clients call instead.
   */
  getStaticHomeFeed: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getHomepageSchema.parse({ query: req.query });
      const { value, status } = await getCachedHomeFeedWithStatus(query, undefined);

      res.setHeader('X-App-Cache', status);
      res.status(200).json(successResponse('Home feed fetched', value));
    } catch (error) {
      next(error);
    }
  },
};
