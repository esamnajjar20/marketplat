import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { redis } from '../config/redis';

const msg = (message: string, code = 'RATE_LIMIT_EXCEEDED') => ({ success: false, message, code });

const bypassRateLimit = process.env.DISABLE_RATE_LIMIT === 'true';

const noRateLimit = () =>
  (_req: any, _res: any, next: any) => next();


// FIX TEST-V4-05: extracted from createRedisStore so the actual
// security-relevant logic (does a Redis outage silently let every
// request through, or correctly block it for endpoints that opted into
// failOpen=false) can be unit-tested directly, independent of
// rate-limit-redis's RedisStore internals. This had zero test coverage
// anywhere despite controlling rate-limit fail-safety for every route.
export const makeSendCommand = (failOpen: boolean) =>
  async (...args: string[]): Promise<RedisReply> => {
    try {
      return (await (redis as any).call(...args)) as RedisReply;
    } catch (error) {
      if (!failOpen) throw error;
      // Fail-open: if Redis is unavailable, allow the request through
      return 0;
    }
  };

export const createRedisStore = (prefix: string, failOpen = true) =>
  new RedisStore({
    // M-06: explicit type cast + configurable store error handling
    // rate-limit-redis v4 returns strings for SCRIPT LOAD and arrays for EVALSHA.
    sendCommand: makeSendCommand(failOpen),
    prefix: `rl:${prefix}:`,
  });

export const globalRateLimit = bypassRateLimit ? noRateLimit() : rateLimit({
  windowMs: 15 * 60 * 1000,
  // FIX AUDIT-V4-05: was 100. A single user browsing normally (ad list,
  // several ad detail views, category filters, favorites) easily fires
  // more than 100 /api/* requests in 15 minutes once you count every
  // parallel request a single page navigation triggers (ads + categories
  // + auth/me + favorites, etc.) — this was being hit by legitimate
  // traffic, not just abuse. It's also especially punishing on
  // shared-NAT mobile networks, where many unrelated users behind one
  // carrier-grade NAT IP exhaust the same quota together. 600/15min
  // (40/min average) still bounds sustained abuse while giving real
  // headroom for normal multi-request browsing. Per-route limiters
  // (auth, forgotPassword, createAd, etc.) remain the primary defense
  // against abuse of specific sensitive actions — this global limit is
  // a coarse backstop, not the main control.
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('global'),
  message: msg('Too many requests, please try again later'),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('auth', false),
  message: msg('Too many login attempts, please try again later'),
});

export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('refresh', false),
  message: msg('Too many token refresh attempts'),
});

export const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('report'),
  message: msg('Too many reports submitted, please try again later'),
});

export const usersRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('users'),
  message: msg('Too many requests'),
});

// FIX SEC-09: POST /users/me/password was only covered by the generic
// usersRateLimit (60 req/15min across the whole /users router). That's
// far too loose for an endpoint that checks a caller-supplied
// currentPassword against the stored hash — an attacker holding a
// stolen/leaked access token could attempt up to 60 password guesses
// every 15 minutes, essentially unthrottled brute-forcing. Matches
// authRateLimit's stricter budget (10/15min) and its fail-closed
// behavior (failOpen=false): unlike most read-ish endpoints, a
// password-verification endpoint should NOT silently allow unlimited
// attempts through if Redis (the rate-limit store) becomes unavailable.
export const changePasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('change_password', false),
  message: msg('Too many password change attempts, please try again later'),
});

// FIX SEC-10: POST /:id/images (adding more photos to an existing ad
// post-creation) had no dedicated rate limit — only the coarse global
// backstop (600/15min across the whole API). createAd itself is
// protected by createAdRateLimit (20/hour) specifically because each
// call uploads to Cloudinary, but the same cost applies to this
// endpoint (up to 10 images per call) and it was reachable far more
// often than the ad-creation flow.
export const addAdImagesRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('add_ad_images'),
  message: msg('Too many image uploads, please try again later'),
});

export const createAdRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_ad'),
  message: msg('Too many ads created, please try again later'),
});

export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,                    // 3 reset requests per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('forgot_pw', false), // fail-closed (strict)
  message: msg('Too many password reset requests, please try again in an hour'),
});

export const favoritesRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('favorites'),
  message: msg('Too many favorite updates, please try again later'),
});

// A saved search is a low-frequency, deliberate action (unlike
// favoriting, which can be a quick per-ad toggle) — a tighter budget
// than favoritesRateLimit is still generous for legitimate use while
// bounding a script that tries to create hundreds of throwaway searches
// (each one gets checked against every future ad — see
// saved-searches.service.ts's onAdCreated scale note).
export const savedSearchRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('saved_search'),
  message: msg('Too many saved searches created, please try again later'),
});

// Seller profile creation is a one-time (per user) write, but still
// worth guarding — see seller-profile-design.md §17: prevents scripted
// retry storms against the create-profile lock/transaction path.
export const createSellerProfileRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_seller_profile'),
  message: msg('Too many attempts, please try again later'),
});

// seller-profile-design.md §17: rate-limited to prevent bulk fake
// ratings against a seller.
export const sellerRatingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('seller_rating'),
  message: msg('Too many ratings submitted, please try again later'),
});

// services-design.md §16: same rationale as createSellerProfileRateLimit —
// a one-time (per seller profile) write, still worth guarding against
// scripted retry storms against the create-profile lock/transaction path.
export const createServiceProviderRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_service_provider'),
  message: msg('Too many attempts, please try again later'),
});

// services-design.md §16: same rate-limit rationale as createAdRateLimit —
// guards the upload + DB-write path from scripted retry storms.
export const createServiceListingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_service_listing'),
  message: msg('Too many attempts, please try again later'),
});

// services-design.md §16: guards customers from spamming providers with
// requests; generous enough for legitimate multi-request browsing.
export const createServiceRequestRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_service_request'),
  message: msg('Too many requests submitted, please try again later'),
});

// services-design.md §17: same rationale as sellerRatingRateLimit —
// prevents bulk fake reviews.
export const serviceReviewRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('service_review'),
  message: msg('Too many reviews submitted, please try again later'),
});

// Epic 5: opening a new thread is a one-off per (ad, buyer, seller)
// triple (startFromAd reuses the existing row instead of creating a
// duplicate), but still worth guarding — same rationale as
// createServiceRequestRateLimit: bounds scripted spam against many
// different sellers' ads without punishing normal multi-ad browsing.
export const startConversationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('start_conversation'),
  message: msg('Too many conversations started, please try again later'),
});

// Epic 5: the actual spam vector — unlike starting a thread, sending
// messages has no natural per-resource ceiling, so this is the primary
// control against flooding another user's inbox. Tighter window (15min)
// than most create-limits here since a real conversation can legitimately
// involve many messages in a short burst; 60/15min still comfortably
// covers that while bounding scripted flooding.
export const sendMessageRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('send_message'),
  message: msg('Too many messages sent, please slow down'),
});

// Stores module: same rationale as createSellerProfileRateLimit /
// createServiceProviderRateLimit — a one-time (per seller profile)
// write, still worth guarding against scripted retry storms against
// the create-store lock/transaction path.
export const createStoreRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_store'),
  message: msg('Too many attempts, please try again later'),
});

// Stores module: same rate-limit rationale as createServiceListingRateLimit
// — guards the upload + DB-write path from scripted retry storms.
export const createProductRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_product'),
  message: msg('Too many attempts, please try again later'),
});

// Gap #3 fix: same rationale as addAdImagesRateLimit (SEC-10) — POST
// /products/:id/images uploads to Cloudinary and needs its own guard
// beyond the coarse global backstop, same as the create-time endpoint.
export const addProductImagesRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('add_product_images'),
  message: msg('Too many image uploads, please try again later'),
});

// Gap #3 fix: same as addProductImagesRateLimit, for service listings.
export const addServiceListingImagesRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('add_service_listing_images'),
  message: msg('Too many image uploads, please try again later'),
});

// Stores module: mirrors favoritesRateLimit — following/unfollowing a
// store is a cheap toggle, but still bounded against scripted abuse.
export const storeFollowRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('store_follow'),
  message: msg('Too many requests, please try again later'),
});

// Stores module: mirrors sellerRatingRateLimit — guards against bulk
// fake reviews against a store.
export const storeReviewRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('store_review'),
  message: msg('Too many reviews submitted, please try again later'),
});

// Search module: /search/suggestions fires on every keystroke of a
// debounced input (not just deliberate submits like most other
// limited routes here), so this needs real per-minute headroom rather
// than the 15-60min windows above — a short 1-minute window with a
// generous cap bounds scripted scraping without punishing a user who
// actually types a full query. /search itself (full results) is
// covered by globalRateLimit only, same as /ads and /products — it's
// a deliberate submit, not a per-keystroke call.
export const searchSuggestionsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('search_suggestions'),
  message: msg('Too many requests, please slow down'),
});

// Blocked-users module: mirrors storeFollowRateLimit — a cheap toggle,
// still bounded against scripted abuse.
export const userBlockRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('user_block'),
  message: msg('Too many requests, please try again later'),
});

// Analytics ingest (gap #7): this endpoint is public (no authenticate
// middleware — see analytics.routes.ts), which makes it the one write
// path in the app reachable with zero auth friction, so it needs its
// own generous-but-real ceiling rather than relying on globalRateLimit
// alone. Higher than any other per-route limiter on purpose: one page
// view can legitimately fire several batched events, and active
// browsing across many pages/searches in a session adds up fast — this
// bounds scripted flooding without throttling normal use.
// failOpen=true (default): if Redis is briefly unavailable, analytics
// ingestion degrading to "unlimited for a few seconds" is an acceptable
// trade against making a background beacon endpoint start rejecting
// requests because of it.
export const analyticsEventsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('analytics_events'),
  message: msg('Too many requests, please slow down'),
});
