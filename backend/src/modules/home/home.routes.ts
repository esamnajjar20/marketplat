import { Router } from 'express';
import { homeController } from './home.controller';
import { homeFeedController } from './home-feed.controller';

export const homeRouter = Router();

// Public, unauthenticated — same visibility as /ads, /stores,
// /service-listings, /categories, /product-categories, /service-categories.
homeRouter.get('/feed', homeFeedController.getHomeFeed);
homeRouter.get('/', homeController.getHomepage);
