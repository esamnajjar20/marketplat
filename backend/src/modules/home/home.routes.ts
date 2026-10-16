import { Router } from 'express';
import { homeController } from './home.controller';
import { homeFeedController } from './home-feed.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const homeRouter = Router();

// Auth-aware personal feed — HTTP caching is private and owned by CACHE.PERSONAL.
// (`/for-you` is the same handler under the name used by the cache plan.)
homeRouter.get('/feed', CACHE.PERSONAL, homeFeedController.getHomeFeed);
homeRouter.get('/for-you', CACHE.PERSONAL, homeFeedController.getHomeFeed);
// Guest feed: identical for everyone → public Cache-Control (CACHE.PUBLIC_HOME), edge-cacheable.
homeRouter.get('/static', CACHE.PUBLIC_HOME, homeFeedController.getStaticHomeFeed);
homeRouter.get('/', CACHE.PUBLIC_HOME, homeController.getHomepage);
