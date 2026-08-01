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
// A-05: /search merged into /ads/search — search module removed
router.use('/admin', adminRouter);
router.use('/sellers', sellersRouter);
router.use('/service-providers', serviceProvidersRouter);
router.use('/service-categories', serviceCategoriesRouter);
router.use('/service-listings', serviceListingsRouter);
router.use('/service-requests', serviceRequestsRouter);
router.use('/appointments', appointmentsRouter);
router.use('/service-reviews', serviceReviewsRouter);
router.use('/conversations', conversationsRouter);
