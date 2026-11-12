import type { Router } from 'express';
import { favoritesRouter } from '../modules/engagement/favorites';
import { followsRouter } from '../modules/engagement/follows';
import { storiesRouter } from '../modules/engagement/stories';
import { notificationsRouter } from '../modules/engagement/notifications';
import { conversationsRouter } from '../modules/engagement/conversations';
import { badgesRouter } from '../modules/engagement/badges';
import { activityRouter } from '../modules/engagement/activity';
import { savedSearchesRouter } from '../modules/engagement/saved-searches';

/** Everything a signed-in user does around listings: follow, favorite, chat, get notified. */
export function registerEngagementRoutes(router: Router): void {
  router.use('/follows', followsRouter);
  router.use('/stories', storiesRouter);
  router.use('/favorites', favoritesRouter);
  router.use('/conversations', conversationsRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/saved-searches', savedSearchesRouter);
  // BADGES (P1): computed, not stored — see badges.types.ts's
  // computeBadges. Only VERIFIED/HIGHLY_RATED/POPULAR/NEW_STORE are
  // implemented; TOP_SELLER and FAST_RESPONSE were dropped from this
  // pass, no Order model or response-time tracking exists to back them.
  router.use('/badges', badgesRouter);
  // Gap #10 ("نشاطي"): a user's own cross-module activity timeline — its
  // own repository-backed module (not folded into users.routes.ts),
  // same pattern as /saved-searches and /notifications sitting outside
  // usersRouter despite both being "my own X" resources.
  router.use('/activity', activityRouter);
}
