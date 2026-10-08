// FIX RATE-LIMIT-PER-USER-01: keyGenerator-based per-user keys +
// raised caps for NAT-shared IPs (Gaza mobile carriers).
import rateLimit, { MemoryStore } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { sendApiError } from '../shared/errors/errorResponse';
import { ErrorCode } from '../shared/errors/errorCodes';

// FIX RATE-LIMIT-PER-USER-01: express-rate-limit's default key is
// per-IP only. On Gaza mobile carriers (Jawwal/Etisalat), carrier-
// grade NAT puts hundreds-to-thousands of subscribers behind one
// public IPv4, so a per-IP budget is effectively a per-tower budget --
// even 50 attempts per 15 minutes for one IP (authRateLimit's current
// max) is a plausible denial
// of service for the whole tower, not just one attacker. Once a
// request has been authenticated (req.user set by authMiddleware), we
// key on userId so every logged-in user gets their own bucket.
// Unauthenticated flows (login/register/forgot-password) still fall
// back to IP -- there is no better handle at that point -- and those
// limits keep the lower caps they always had.
//
// Deliberately NOT using requireUser() here: it throws on a missing
// user, and this must never throw -- it runs for every request,
// including unauthenticated ones.
//
// The "u:" / "ip:" prefixes ensure a userId that happens to look like
// an IPv6 string can never collide with a real req.ip value.
function userOrIpKey(req: Request): string {
  const userId = (req as { user?: { userId?: string } }).user?.userId;
  return userId ? `u:${userId}` : `ip:${req.ip ?? 'unknown'}`;
}
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { env } from '../config/env';

const rateLimitHandler = (message: string) => (req: Request, res: Response): void => {
  sendApiError(req, res, 429, ErrorCode.RATE_LIMIT_EXCEEDED, message);
};

// CENTRALIZE-06: windowMs literals below were previously repeated as
// bare `15 * 60 * 1000` (6x) / `60 * 60 * 1000` (3x) across this file.
// No behavior change — same values, named once.
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const bypassRateLimit = env.rateLimit.disabled;

const noRateLimit = () => (_req: any, _res: any, next: any) => next();

/**
 * UPSTASH-SAVE-01: افتراضيًا MemoryStore (ذاكرة العملية) بدل Redis.
 * كل طلب API كان يستهلك عدة أوامر Redis عبر rate-limit-redis (Lua/INCR)،
 * وهذا يملأ حصة Upstash المجانية بسرعة ويرفع زمن الاستجابة (RTT Ireland↔Frankfurt).
 *
 * RATE_LIMIT_USE_REDIS=true يُرجع السلوك القديم (متجر مشترك بين عدة instances).
 * مع instance واحد على Render الذاكرة كافية ودقيقة.
 */
const useRedisStore =
  process.env.RATE_LIMIT_USE_REDIS === 'true' || process.env.RATE_LIMIT_USE_REDIS === '1';

// FIX TEST-V4-05: extracted from createRedisStore so the actual
// security-relevant logic (does a Redis outage silently let every
// request through, or correctly block it for endpoints that opted into
// failOpen=false) can be unit-tested directly, independent of
// rate-limit-redis's RedisStore internals. This had zero test coverage
// anywhere despite controlling rate-limit fail-safety for every route.
export const makeSendCommand =
  (failOpen: boolean) =>
  async (...args: string[]): Promise<RedisReply> => {
    try {
      return (await (redis as any).call(...args)) as RedisReply;
    } catch (error) {
      if (!failOpen) throw error;
      // Fail-open: if Redis is unavailable, allow the request through
      return 0;
    }
  };

export const createRedisStore = (prefix: string, failOpen = true) => {
  // FIX RATE-LIMIT-CLUSTER-01: MemoryStore is safe ONLY as the
  // deliberate "avoid burning Redis commands on cheap abuse-prevention
  // limiters" optimization — its semantics under PM2 cluster mode
  // (ecosystem.config.js: exec_mode='cluster', instances=2) are wrong
  // for anything security-relevant:
  //
  //   1. Each worker holds its own MemoryStore, so the configured `max`
  //      is effectively multiplied by the worker count. authRateLimit's
  //      max:10 quietly became 20 across the cluster.
  //   2. The per-limiter failOpen=false flag (auth / refresh / forgot_pw
  //      / change_password) has no effect under MemoryStore — that flag
  //      only flows through makeSendCommand, which MemoryStore never
  //      calls. So those endpoints silently stop being fail-closed.
  //
  // Any limiter that opted into failOpen=false is therefore forced onto
  // the shared Redis store regardless of RATE_LIMIT_USE_REDIS — a
  // security-critical limiter must not be silently degraded by a
  // cost-saving env default. The cheap, fail-open limiters (the vast
  // majority) keep the MemoryStore path unchanged.
  if (!useRedisStore && failOpen) {
    // prefix غير مستخدم في MemoryStore — كل rateLimit() يملك متجره الخاص
    return new MemoryStore();
  }
  return new RedisStore({
    // M-06: explicit type cast + configurable store error handling
    // rate-limit-redis v4 returns strings for SCRIPT LOAD and arrays for EVALSHA.
    sendCommand: makeSendCommand(failOpen),
    prefix: `rl:${prefix}:`,
  });
};

export const globalRateLimit = bypassRateLimit
  ? noRateLimit()
  : rateLimit({
      windowMs: FIFTEEN_MIN_MS,
      // 600/15min is a coarse backstop for normal multi-request browsing;
// sensitive endpoints retain stricter per-route limits.
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      store: createRedisStore('global'),
      handler: rateLimitHandler('Too many requests, please try again later'),
    });

export const authRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('auth', false),
  handler: rateLimitHandler('Too many login attempts, please try again later'),
});

export const refreshRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('refresh', false),
  handler: rateLimitHandler('Too many token refresh attempts'),
});

export const reportRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('report'),
  handler: rateLimitHandler('Too many reports submitted, please try again later'),
});

export const usersRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('users'),
  handler: rateLimitHandler('Too many requests'),
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
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('change_password', false),
  handler: rateLimitHandler('Too many password change attempts, please try again later'),
});

// FIX SEC-10: POST /:id/images (adding more photos to an existing ad
// post-creation) had no dedicated rate limit — only the coarse global
// backstop (600/15min across the whole API). createAd itself is
// protected by createAdRateLimit (20/hour) specifically because each
// call uploads to Cloudinary, but the same cost applies to this
// endpoint (up to 10 images per call) and it was reachable far more
// often than the ad-creation flow.
export const addAdImagesRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('add_ad_images'),
  handler: rateLimitHandler('Too many image uploads, please try again later'),
});

export const createAdRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_ad'),
  handler: rateLimitHandler('Too many ads created, please try again later'),
});

// FIX FORGOT-PW-LIMIT-CONFIG-01: max was a hardcoded 3 -- too strict
// for two real cases (a user who mistypes then corrects, and Gaza's
// carrier-grade NAT sharing one public IP across many subscribers) and
// not adjustable without a code change. Now read from env with a
// default of 5; see env.ts's FORGOT_PASSWORD_RATE_LIMIT_MAX comment
// for the reasoning. The anti-abuse property is preserved -- an
// attacker still can't send more than `max` reset emails per hour per
// IP -- it's just no longer a straightjacket for legitimate users.
export const forgotPasswordRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS, // 1 hour
  max: env.rateLimit.forgotPasswordMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('forgot_pw', false), // fail-closed (strict)
  handler: rateLimitHandler('Too many password reset requests, please try again in an hour'),
});

export const favoritesRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('favorites'),
  handler: rateLimitHandler('Too many favorite updates, please try again later'),
});

// A saved search is a low-frequency, deliberate action (unlike
// favoriting, which can be a quick per-ad toggle) — a tighter budget
// than favoritesRateLimit is still generous for legitimate use while
// bounding a script that tries to create hundreds of throwaway searches
// (each one gets checked against every future ad — see
// saved-searches.service.ts's onAdCreated scale note).
export const savedSearchRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('saved_search'),
  handler: rateLimitHandler('Too many saved searches created, please try again later'),
});

// Seller profile creation is a one-time (per user) write, but still
// worth guarding — see seller-profile-design.md §17: prevents scripted
// retry storms against the create-profile lock/transaction path.
export const createSellerProfileRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_seller_profile'),
  handler: rateLimitHandler('Too many attempts, please try again later'),
});

// seller-profile-design.md §17: rate-limited to prevent bulk fake
// ratings against a seller.
export const sellerRatingRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('seller_rating'),
  handler: rateLimitHandler('Too many ratings submitted, please try again later'),
});

// PLAN-P1-4: mirrors createSellerProfileRateLimit's rationale — a
// low-frequency, self-service write (a seller has no reason to hit
// this more than a handful of times), guarded against retry storms
// the same way profile creation already is.
export const requestVerificationRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('request_seller_verification'),
  handler: rateLimitHandler('Too many verification requests, please try again later'),
});

// services-design.md §16: same rationale as createSellerProfileRateLimit —
// a one-time (per seller profile) write, still worth guarding against
// scripted retry storms against the create-profile lock/transaction path.
export const createServiceProviderRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_service_provider'),
  handler: rateLimitHandler('Too many attempts, please try again later'),
});

// Service provider logo upload: mirrors storeImagesRateLimit — same
// per-hour ceiling for the same reason.
export const serviceProviderImagesRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('service_provider_images'),
  handler: rateLimitHandler('Too many image uploads, please try again later'),
});

// services-design.md §16: same rate-limit rationale as createAdRateLimit —
// guards the upload + DB-write path from scripted retry storms.
export const createServiceListingRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_service_listing'),
  handler: rateLimitHandler('Too many attempts, please try again later'),
});

// services-design.md §16: guards customers from spamming providers with
// requests; generous enough for legitimate multi-request browsing.
export const createServiceRequestRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_service_request'),
  handler: rateLimitHandler('Too many requests submitted, please try again later'),
});

// FIX SR-RESPOND-SEPARATE-BUCKET (audit H4): PATCH /:id/respond used to share
// createServiceRequestRateLimit's 20/hr counter with request creation. A busy
// provider needs accept → start → complete (3 calls) per request, so a normal
// busy day exhausted the shared bucket. Own bucket, still bounded.
export const respondServiceRequestRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('respond_service_request'),
  handler: rateLimitHandler('Too many actions, please try again later'),
});

// Open Requests marketplace (Request / RequestOffer) — separate buckets
// from service-broadcast so product/rental traffic does not starve
// the legacy service-only feed quotas.
export const createOpenRequestRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_open_request'),
  handler: rateLimitHandler('Too many requests posted, please try again later'),
});

export const submitRequestOfferRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('submit_request_offer'),
  handler: rateLimitHandler('Too many offers submitted, please try again later'),
});

// T350 — request cancel: state-mutating, cheap ceiling per user.
export const cancelRequestRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('cancel_request'),
  handler: rateLimitHandler('Too many cancel attempts, please try again later'),
});

// T350 — withdraw offer: same ceiling as submit (lifecycle symmetry).
export const withdrawOfferRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('withdraw_offer'),
  handler: rateLimitHandler('Too many withdraw attempts, please try again later'),
});

// T350 — accept offer: lower ceiling — accepting is a decisive action.
export const acceptOfferRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('accept_offer'),
  handler: rateLimitHandler('Too many accept attempts, please try again later'),
});

// services-design.md §17: same rationale as sellerRatingRateLimit —
// prevents bulk fake reviews.
export const serviceReviewRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('service_review'),
  handler: rateLimitHandler('Too many reviews submitted, please try again later'),
});

// Epic 5: opening a new thread is a one-off per (ad, buyer, seller)
// triple (startFromAd reuses the existing row instead of creating a
// duplicate), but still worth guarding — same rationale as
// createServiceRequestRateLimit: bounds scripted spam against many
// different sellers' ads without punishing normal multi-ad browsing.
export const startConversationRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('start_conversation'),
  handler: rateLimitHandler('Too many conversations started, please try again later'),
});

// Epic 5: the actual spam vector — unlike starting a thread, sending
// messages has no natural per-resource ceiling, so this is the primary
// control against flooding another user's inbox. Tighter window (15min)
// than most create-limits here since a real conversation can legitimately
// involve many messages in a short burst; 200/15min still comfortably
// covers that while bounding scripted flooding.
export const sendMessageRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('send_message'),
  handler: rateLimitHandler('Too many messages sent, please slow down'),
});

// FIX TYPING-RATE-LIMIT-01: /conversations/:id/typing fires on every
// keystroke-driven state change (typing=true on first key, typing=false
// after the debounce), so a real user in a live conversation can
// legitimately produce more events than sendMessageRateLimit's 200/15min
// allows. 600/15min = 40/min average — well above any real typing rate,
// still tight enough to bound a scripted flood that would otherwise
// DoS the SSE fan-out on the recipient's stream. Deliberately its own
// bucket from send_message so a chat-heavy user never exhausts their
// message quota just by typing.
export const typingRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('typing'),
  handler: rateLimitHandler('Too many typing events, please slow down'),
});

// Stores module: same rationale as createSellerProfileRateLimit /
// createServiceProviderRateLimit — a one-time (per seller profile)
// write, still worth guarding against scripted retry storms against
// the create-store lock/transaction path.
export const createStoreRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_store'),
  handler: rateLimitHandler('Too many attempts, please try again later'),
});

// Stores module: same rate-limit rationale as createServiceListingRateLimit
// — guards the upload + DB-write path from scripted retry storms.
export const createProductRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_product'),
  handler: rateLimitHandler('Too many attempts, please try again later'),
});

// Gap #3 fix: same rationale as addAdImagesRateLimit (SEC-10) — POST
// /products/:id/images uploads to Cloudinary and needs its own guard
// beyond the coarse global backstop, same as the create-time endpoint.
export const addProductImagesRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('add_product_images'),
  handler: rateLimitHandler('Too many image uploads, please try again later'),
});

// Gap #3 fix: same as addProductImagesRateLimit, for service listings.
export const addServiceListingImagesRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('add_service_listing_images'),
  handler: rateLimitHandler('Too many image uploads, please try again later'),
});

// Store logo/cover upload: mirrors addProductImagesRateLimit/
// addServiceListingImagesRateLimit — same per-hour ceiling for the
// same reason (a small number of legitimate re-uploads while a seller
// dials in their branding, bounded against scripted abuse).
export const storeImagesRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('store_images'),
  handler: rateLimitHandler('Too many image uploads, please try again later'),
});

// Stores module: mirrors favoritesRateLimit — following/unfollowing a
// store is a cheap toggle, but still bounded against scripted abuse.
export const storeFollowRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('store_follow'),
  handler: rateLimitHandler('Too many requests, please try again later'),
});

// Social follow graph: one bounded limiter for user/store/category follows.
export const followRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('follow'),
  handler: rateLimitHandler('Too many requests, please try again later'),
});

// Stores module: mirrors sellerRatingRateLimit — guards against bulk
// fake reviews against a store.
export const storeReviewRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('store_review'),
  handler: rateLimitHandler('Too many reviews submitted, please try again later'),
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
  keyGenerator: userOrIpKey,
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('search_suggestions'),
  handler: rateLimitHandler('Too many requests, please slow down'),
});

// Promotions module: same rationale as createProductRateLimit — a
// store-scoped creation action guarded against scripted spam. A given
// store can only have one live promotion per product (partial unique
// index), so the ceiling stays modest.
export const createPromotionRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_promotion'),
  handler: rateLimitHandler('Too many promotions created, please try again later'),
});

// Updates are less impactful than creation (no new live window opens
// unless the caller flips status, which the schema forbids), but still
// state-mutating against a shared store — same ceiling as create.
export const updatePromotionRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('update_promotion'),
  handler: rateLimitHandler('Too many promotion updates, please try again later'),
});

// Cancel is a one-shot terminal action; a low ceiling is a red flag
// on scripted churn against a store's own promotions.
export const cancelPromotionRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('cancel_promotion'),
  handler: rateLimitHandler('Too many promotion cancels, please try again later'),
});

// Collections module: store-scoped CRUD, same rationale as
// createPromotionRateLimit. A store's collection count is bounded
// organically (a shop doesn't create dozens of folders an hour), so
// the ceiling is generous enough to not bite a bulk import.
export const createCollectionRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_collection'),
  handler: rateLimitHandler('Too many collections created, please try again later'),
});

// Reorder is a whole-list PATCH — heavier write than a single update,
// so a tighter ceiling than update.
export const reorderCollectionsRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('reorder_collections'),
  handler: rateLimitHandler('Too many reorder attempts, please try again later'),
});

// Metadata updates (name/description/isActive) — same ceiling as
// updatePromotionRateLimit.
export const updateCollectionRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('update_collection'),
  handler: rateLimitHandler('Too many collection updates, please try again later'),
});

// Delete is terminal and destructive (FK cascade removes members) — a
// low ceiling flags churn.
export const deleteCollectionRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('delete_collection'),
  handler: rateLimitHandler('Too many collection deletions, please try again later'),
});

// Add/remove product — high-volume but needs a ceiling to bound
// scripted shuffle against a single collection.
export const collectionMemberRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('collection_member'),
  handler: rateLimitHandler('Too many collection membership changes, please try again later'),
});

// Categories module: admin-only CRUD, but we apply the same pattern
// as the other store-scoped mutations. Category tree mutations are
// rare and admin-gated at the auth layer; the ceiling is generous
// enough to allow a bulk import but bounded against a runaway script.
export const categoryMutationRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('category_mutation'),
  handler: rateLimitHandler('Too many category mutations, please try again later'),
});

// Delete is destructive (FK-checked, cascades into visibility); a
// lower ceiling than create/update flags accidental loops.
export const categoryDeleteRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('category_delete'),
  handler: rateLimitHandler('Too many category deletions, please try again later'),
});

// Recommendations module: GET /recommendations is public (deliberately
// not behind authenticate — anonymous users still get trending) and
// personalizes per-Bearer. Without a limiter a script can hammer it
// thousands of times/hour against the same Postgres + Redis budget a
// real user needs. Same posture as analyticsEventsRateLimit: generous
// enough for a normal browsing session (multiple rails rendering,
// route changes) but bounded.
export const recommendationsRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('recommendations'),
  handler: rateLimitHandler('Too many recommendation requests, please try again later'),
});

// Saved searches: DELETE was unbounded while POST already went through
// savedSearchRateLimit. A separate store (prefix 'delete_saved_search')
// rather than reusing that limiter, so a user who saves many searches
// in one session doesn't eat into their deletion budget and vice versa.
export const deleteSavedSearchRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('delete_saved_search'),
  handler: rateLimitHandler('Too many saved-search deletions, please try again later'),
});

// T520 — media uploads previously reused createOpenRequestRateLimit
// (prefix 'create_open_request'), which meant a user staging many
// images consumed the same per-hour budget as their open-request
// creation. Same ceiling (10/hour) as the request-creation flow it
// was piggybacking on, now on its own Redis prefix so the two can't
// interfere. Kept low because every call fans out to N Cloudinary
// uploads (up to MAX_IMAGES_PER_ENTITY), so 10/hour bounds the
// upstream cost too.
export const mediaUploadRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('media_upload'),
  handler: rateLimitHandler('Too many image uploads, please try again later'),
});

// Blocked-users module: mirrors storeFollowRateLimit — a cheap toggle,
// still bounded against scripted abuse.
export const userBlockRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('user_block'),
  handler: rateLimitHandler('Too many requests, please try again later'),
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
  keyGenerator: userOrIpKey,
  windowMs: 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('analytics_events'),
  handler: rateLimitHandler('Too many requests, please slow down'),
});

// FIX RATE-LIMIT-CLEANUP-01: two new rate limits for appointments (a
// public availability endpoint + two authenticated mutations with no
// per-route cap before this -- they relied only on the global 600/15min
// limit), and one blanket per-IP cap for every /admin/* route to
// degrade a compromised admin session gracefully instead of letting it
// fire hundreds of role changes / bulk deletes / CSV exports before an
// operator notices.
//
// Also removed in the same pass: createServiceBroadcastRateLimit and
// submitServiceQuoteRateLimit -- both backed features that no longer
// have any route on either side (ServiceBroadcast was superseded by
// open-requests, ServiceQuote never got a route at all).

// Public read of a provider's open slots, called on every
// appointment-booking page visit. Higher cap than the mutations below
// because a user legitimately refreshes the availability calendar
// while picking a date.
export const availabilityRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('availability'),
  handler: rateLimitHandler('Too many availability requests, please try again later'),
});

// Creating a new appointment. 20/hour is generous for a real customer
// shopping providers but stops a scripted spam-booking a provider's
// calendar.
export const createAppointmentRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('create_appointment'),
  handler: rateLimitHandler('Too many appointment requests, please try again later'),
});

// Status transitions on an existing appointment (confirm / cancel /
// complete). Higher cap than creation because a single appointment
// can legitimately move through several states, and the update is
// scoped to an appointment the caller already owns.
export const appointmentUpdateRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('update_appointment'),
  handler: rateLimitHandler('Too many appointment updates, please try again later'),
});

// Blanket cap for every /admin/* route, applied via adminRouter.use
// right after authenticate. 200/15min is far above any legitimate
// admin workflow (the busiest real operator action is a bulk action
// on one page, counted as one request) but bounds the blast radius of
// a stolen admin session to a number a human operator can review.
// fail-closed (second arg = false) so a Redis outage during an active
// admin session refuses the action rather than silently dropping the
// cap -- admin actions are high-trust enough that "no rate limiting
// right now" is worse than "retry in a minute".
export const adminRateLimit = rateLimit({
  keyGenerator: userOrIpKey,
  windowMs: FIFTEEN_MIN_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('admin', false),
  handler: rateLimitHandler('Too many admin actions, please slow down'),
});

// FIX FEAT-EMAIL-VERIFY: 3/hour per IP for the "resend verification
// email" action. Same shape and rationale as forgotPasswordRateLimit
// (fail-closed -- a Redis outage refuses the action rather than
// allowing a spam loop). Prevents a single client from generating
// hundreds of verification emails to a victim's inbox.
export const resendVerificationRateLimit = rateLimit({
  // FIX RESEND-VERIFY-NAT-01: missing keyGenerator meant this limiter
  // was per-IP only, despite sitting on an authenticated endpoint
  // (resendVerification is behind `authenticate` — req.user is always
  // set). On Gaza's carrier-grade NAT, one user retrying 3 times
  // exhausted the bucket for every other subscriber behind the same
  // public IPv4 for a full hour. userOrIpKey gives each logged-in user
  // their own 3/hour budget, matching forgotPasswordRateLimit's shape
  // as the comment above already claimed it did.
  keyGenerator: userOrIpKey,
  windowMs: ONE_HOUR_MS,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('resend_verification', false),
  handler: rateLimitHandler('Too many verification requests, please try again in an hour'),
});
