import { Router } from 'express';
import { authRouter } from './modules/auth';
import { usersRouter } from './modules/users';
import { adsRouter } from './modules/ads';
import { categoriesRouter } from './modules/categories';
import { reportsRouter } from './modules/reports';
import { favoritesRouter } from './modules/favorites';
import { adminRouter } from './modules/admin';
import { sellersRouter } from './modules/sellers';
import { serviceProvidersRouter } from './modules/service-providers';
import { serviceCategoriesRouter } from './modules/service-categories';
import { serviceListingsRouter } from './modules/service-listings';
import { serviceRequestsRouter } from './modules/service-requests';
import { serviceBroadcastsRouter } from './modules/service-broadcasts';
import { requestsRouter } from './modules/requests';
import { appointmentsRouter } from './modules/appointments';
import { serviceReviewsRouter } from './modules/service-reviews';
import { conversationsRouter } from './modules/conversations';
import { blockedUsersRouter } from './modules/blocked-users';
import { notificationsRouter } from './modules/notifications';
import { savedSearchesRouter } from './modules/saved-searches';
import { storesRouter } from './modules/stores';
import { productsRouter } from './modules/products';
import { productCategoriesRouter } from './modules/product-categories';
import { promotionsRouter } from './modules/promotions';
import { collectionsRouter } from './modules/collections';
import { badgesRouter } from './modules/badges';
import { searchRouter } from './modules/search';
import { auditLogsRouter } from './modules/audit-logs';
import { analyticsRouter, analyticsAdminRouter } from './modules/analytics';
import { activityRouter } from './modules/activity';
import { recommendationsRouter } from './modules/recommendations';
import { fraudRouter } from './modules/fraud';
import { csrfProtection } from './middlewares/csrf.middleware';

export const router = Router();

// PROD-FIX-15: registered here (on this router, mounted at /api/v1 in
// app.ts) rather than directly on `app` — req.path inside this
// middleware is then relative to THIS router's mount point (e.g.
// '/auth/login', not '/api/v1/auth/login'), which is what
// csrf.middleware.ts's CSRF_EXEMPT_PATHS set assumes. Registered
// globally here (applies to every route below) but the middleware
// itself only actually enforces anything when a csrfToken cookie is
// present on the request — see csrf.middleware.ts's own comment for
// why that scoping is what keeps this safe for pure Bearer-token
// clients (API integrations, this repo's own integration tests) that
// never went through the cookie-issuing login/refresh flow at all.
router.use(csrfProtection);

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/ads', adsRouter);
router.use('/categories', categoriesRouter);
router.use('/reports', reportsRouter);
router.use('/favorites', favoritesRouter);
// A-05 (historical): /search was merged into /ads/search because at
// the time it only ever covered ads — a dedicated module was
// redundant for a single entity. /ads/search is untouched by this
// change and still works exactly as before. This /search is a
// different thing: a real cross-entity module (ads + products +
// stores + service-listings unioned and ranked together), which A-05
// never addressed and doesn't apply to.
router.use('/search', searchRouter);
router.use('/admin', adminRouter);
// Own module (repository/service/controller/validation) mounted at
// /admin/audit-logs — kept out of admin.routes.ts/admin.service.ts
// (which talk to Prisma directly with no repository layer) so this
// follows the same repository-backed module pattern as /reports,
// which likewise sits outside admin.routes.ts despite being an
// admin-only resource.
router.use('/admin/audit-logs', auditLogsRouter);
// Gap #7 (product analytics): /analytics/events is public (see
// analyticsRouter's own comment — anonymous traffic is most of a
// marketplace's usage); /admin/analytics is the admin-only summary,
// kept as its own router (not merged into adminRouter) for the same
// reason auditLogsRouter sits outside admin.routes.ts — a distinct
// repository-backed module, not raw Prisma calls in admin.service.ts.
router.use('/analytics', analyticsRouter);
router.use('/admin/analytics', analyticsAdminRouter);
router.use('/sellers', sellersRouter);
router.use('/service-providers', serviceProvidersRouter);
router.use('/service-categories', serviceCategoriesRouter);
router.use('/service-listings', serviceListingsRouter);
router.use('/service-requests', serviceRequestsRouter);
router.use('/service-broadcasts', serviceBroadcastsRouter);
router.use('/requests', requestsRouter);
router.use('/appointments', appointmentsRouter);
router.use('/service-reviews', serviceReviewsRouter);
router.use('/conversations', conversationsRouter);
router.use('/blocked-users', blockedUsersRouter);
router.use('/notifications', notificationsRouter);
router.use('/saved-searches', savedSearchesRouter);
router.use('/stores', storesRouter);
router.use('/products', productsRouter);
router.use('/product-categories', productCategoriesRouter);
// PROMO-1: store-owner-only CRUD for scheduled product discounts — see
// promotions.routes.ts's doc comment for why there's no public GET
// here (public consumers see effects via products' effectivePrice
// fields instead).
router.use('/promotions', promotionsRouter);
// COLLECTIONS (P1): owner CRUD + membership under /collections, plus
// two public storefront reads (/collections/store/:storeId and
// /collections/:id/products) — see collections.routes.ts's doc
// comment for why those two public GETs don't collide with the
// single-segment owner routes despite living in the same router.
router.use('/collections', collectionsRouter);
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
// Gap #9 ("قد يعجبك أيضًا" / Recommendations): its own repository-backed
// module (not folded into ads.routes.ts's existing /:id/related, which
// is a simpler category+city match) — this one blends favorites,
// UserActivity, and AnalyticsEvent signals, and works both personalized
// (logged-in) and anonymous (trending fallback). See recommendations
// .service.ts's own comment for the full scoring rationale.
router.use('/recommendations', recommendationsRouter);
// Fraud detection (item 12 — "نظام مكافحة الاحتيال"): admin-only queue
// for reviewing auto-flagged ads and the individual signals behind
// them. Own repository-backed module mounted at /admin/fraud, same
// pattern as /admin/audit-logs and /admin/analytics sitting outside
// admin.routes.ts's raw-Prisma admin.service.ts.
router.use('/admin/fraud', fraudRouter);
