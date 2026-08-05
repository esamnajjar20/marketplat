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
import { appointmentsRouter } from './modules/appointments';
import { serviceReviewsRouter } from './modules/service-reviews';
import { conversationsRouter } from './modules/conversations';
import { blockedUsersRouter } from './modules/blocked-users';
import { notificationsRouter } from './modules/notifications';
import { savedSearchesRouter } from './modules/saved-searches';
import { storesRouter } from './modules/stores';
import { productsRouter } from './modules/products';
import { productCategoriesRouter } from './modules/product-categories';
import { searchRouter } from './modules/search';
import { auditLogsRouter } from './modules/audit-logs';
import { analyticsRouter, analyticsAdminRouter } from './modules/analytics';
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
router.use('/appointments', appointmentsRouter);
router.use('/service-reviews', serviceReviewsRouter);
router.use('/conversations', conversationsRouter);
router.use('/blocked-users', blockedUsersRouter);
router.use('/notifications', notificationsRouter);
router.use('/saved-searches', savedSearchesRouter);
router.use('/stores', storesRouter);
router.use('/products', productsRouter);
router.use('/product-categories', productCategoriesRouter);
