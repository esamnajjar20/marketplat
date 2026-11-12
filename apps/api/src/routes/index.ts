import { Router } from 'express';
import { csrfProtection } from '../middlewares/csrf.middleware';
import { createReadBatchHandler } from '../shared/http/readBatchRouter';
import { CACHE, privateApiCacheDefault } from '../middlewares/cacheControl.middleware';
import { registerIdentityRoutes } from './identity.routes';
import { registerEngagementRoutes } from './engagement.routes';
import { registerClassifiedsRoutes } from './classifieds.routes';
import { registerCommerceRoutes } from './commerce.routes';
import { registerServicesRoutes } from './services.routes';
import { registerDiscoveryRoutes } from './discovery.routes';
import { registerPlatformRoutes } from './platform.routes';
import { registerTrustRoutes } from './trust.routes';

/**
 * The public /api/v1 route table (mounted in app.ts).
 *
 * Each domain group in src/modules/<domain>/ has a matching
 * <domain>.routes.ts in this folder that mounts that domain's routers.
 * This file only owns what applies to EVERY route (cache default, CSRF,
 * read-batch) and the ORDER in which the domains are registered.
 *
 * ORDER MATTERS in exactly one place: prefixes that overlap are matched
 * first-registered-first. Today that means
 *   - platform (/admin, /admin/analytics, /admin/user-simulator) must be
 *     registered BEFORE trust (/admin/audit-logs, /admin/fraud), so
 *     adminRouter keeps getting the first look at /admin/*, as before;
 *   - inside commerce.routes.ts, /sales before /sales/installments and the
 *     two /store-types routers in their original order.
 * Everything else uses distinct prefixes and is order-independent.
 */
export const router = Router();

// registered here (on this router, mounted at /api/v1 in
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
// API-wide safe default: every response is private/no-store unless a public
// route explicitly opts into a public CACHE policy below. This makes a newly
// added authenticated GET safe by default instead of relying on each author
// remembering CACHE.NONE.
router.use(privateApiCacheDefault);
router.use(csrfProtection);

// READ-BATCH: explicit opt-in transport for pages that intentionally group
// several independent GETs. Individual GET requests are never intercepted or
// rewritten on the client; this route only handles /batch calls explicitly
// made through apiClient.batchGet().
router.post('/batch', CACHE.NONE, createReadBatchHandler(router));

registerIdentityRoutes(router);
registerEngagementRoutes(router);
registerClassifiedsRoutes(router);
registerCommerceRoutes(router);
registerServicesRoutes(router);
registerDiscoveryRoutes(router);
registerPlatformRoutes(router); // must precede trust (/admin/* overlap)
registerTrustRoutes(router);
