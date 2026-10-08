import { Router } from 'express';
import { homeController } from './home.controller';
import { homeFeedController } from './home-feed.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const homeRouter = Router();

// Auth-aware personal feed — HTTP caching is private and owned by CACHE.PERSONAL.
homeRouter.get('/feed', CACHE.PERSONAL, homeFeedController.getHomeFeed);
homeRouter.get('/', CACHE.PUBLIC_HOME, homeController.getHomepage);
