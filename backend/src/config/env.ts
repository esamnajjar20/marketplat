import dotenv from "dotenv";
import { z } from "zod";

// TEST-DB SAFETY: without this, `npm test` reads the exact same
// DATABASE_URL as `npm run dev`/`npm start` — but tests/setup.ts runs a
// destructive `deleteMany()` on User/Ad/Category/etc. after EVERY test.
// If DATABASE_URL ever points at a real dev/shared database when tests
// run, this wipes it. Loading `.env.test` first when NODE_ENV=test
// (falling back to `.env` if `.env.test` doesn't exist) ensures tests
// only ever run against a database explicitly designated for testing —
// see `.env.test.termux.example` for the Termux/proot template. dotenv
// never overrides a process.env value that's already set, so the
// second dotenv.config() call below only fills in anything `.env.test`
// didn't define — it can't silently override what `.env.test` set.
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test" });
}
dotenv.config();

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default("5000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  // Refresh token TTL. Was hardcoded as '7d' directly in jwt.ts's
  // signRefreshToken call, with authCookies.ts separately hardcoding
  // the equivalent 7-day figure in milliseconds for the cookie's
  // maxAge and only a comment ("matches signRefreshToken's expiresIn")
  // keeping the two in sync. Centralizing here means both derive from
  // one value — same pattern already used for JWT_EXPIRES_IN below.
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  // TERMUX/PROOT SUPPORT: '127.0.0.1' rather than 'localhost' as the
  // default — proot-distro Ubuntu's /etc/hosts and localhost resolution
  // order can behave inconsistently inside the sandbox, and the literal
  // loopback address sidesteps that entirely. Real deployments should
  // still set REDIS_HOST explicitly; this only changes what happens if
  // it's left unset.
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.string().regex(/^\d+$/).default("6379"),
  // L-2 (audit fix): previously optional at every NODE_ENV, with the
  // requirement only enforced at the docker-compose level
  // (${REDIS_PASSWORD:?...} in docker-compose.full.yml). That meant any
  // process started outside docker-compose — e.g. PM2 directly via
  // ecosystem.config.js, a supported path per its own comment — could
  // connect to Redis with no password and no warning. Still optional in
  // dev/test (local Redis without auth is a normal setup there); the
  // superRefine below is what actually enforces it for production,
  // matching JWT_SECRET/DATABASE_URL's "required, fail fast at startup"
  // treatment rather than silently degrading security.
  REDIS_PASSWORD: z.string().optional(),
  // Aiven Valkey (and some managed Redis providers) require an ACL
  // username in addition to a password. Optional so local/self-hosted
  // Redis (which has no ACL user) still works — when unset, ioredis
  // falls back to the default `AUTH <password>` flow.
  REDIS_USERNAME: z.string().optional(),
  // FIX LOCAL-DEV-01: previously `tls: {}` was hardcoded unconditionally
  // in config/redis.ts, correct only for managed providers that require
  // TLS on every plan (Upstash, etc. — see that file's own comment on
  // why TLS is needed there). A local/self-hosted Redis (docker-compose,
  // or a native install under Termux/proot-distro per REDIS_HOST's own
  // "TERMUX/PROOT SUPPORT" comment above) speaks plain TCP, not TLS —
  // ioredis attempting a TLS handshake against a plaintext server hangs
  // until connectTimeout fires, surfacing as an opaque `connect
  // ETIMEDOUT` with nothing in the error pointing at TLS as the cause.
  // Defaults to false (plain TCP) so local/self-hosted Redis works
  // out of the box; set REDIS_TLS=true explicitly for deployments that
  // actually require it.
  REDIS_TLS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  // TRUST_PROXY must be a number (1 = trust one proxy hop, e.g. nginx/Cloudflare).
  // String "1" is NOT equivalent to number 1 in Express trust proxy logic.
  //
  // FIX TRUST-PROXY-RANGE-01: previously the regex accepted any non-
  // negative integer — including values that make req.ip *less* safe
  // than the default:
  //   - 0 in production collapses every user behind Render's internal
  //     LB address into a single req.ip, which turns the per-IP login
  //     rate limit into a shared global bucket (one attacker exhausts
  //     it for everyone, and legit users start seeing 429s).
  //   - A number larger than the actual number of proxies in front of
  //     the app makes Express trust client-supplied XFF entries, so a
  //     caller can set X-Forwarded-For: 1.2.3.4 and be seen as that IP
  //     — defeating both the per-IP rate limit and every audit/forensic
  //     use of req.ip.
  // The range 0-5 covers every realistic topology (Render = 1,
  // Cloudflare+Render = 2, self-hosted nginx chain = up to 3-4) while
  // refusing anything the operator almost certainly typed by mistake.
  // A separate runtime warning in server.ts flags 0 in production,
  // since that value is never correct there.
  TRUST_PROXY: z
    .string()
    .regex(/^\d+$/, "TRUST_PROXY must be a number")
    .refine((v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 && n <= 5;
    }, "TRUST_PROXY must be an integer between 0 and 5 (0 = no proxy, 1 = Render/nginx, 2 = Cloudflare+Render, etc.)")
    .default("1"),
  BLACKLIST_STRICT: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // FIX OAUTH-01: Google OAuth credentials — optional, same
  // "opt-in, app works identically without it" pattern as
  // CLOUDINARY_*/SMTP_*/SENTRY_DSN below. google.strategy.ts only
  // registers the Passport GoogleStrategy when all three are present
  // (env.googleOAuth.isConfigured); GET /auth/google and
  // /auth/google/callback return a clear 503 instead of crashing at
  // startup when they're missing, so a deployment without Google
  // OAuth configured keeps working normally with local auth only.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  // FIX EMAIL-01: SMTP config for the new email service. All optional,
  // same pattern as Cloudinary above — the app must still start cleanly
  // in dev/test/CI without real credentials. emailService.ts checks
  // whether these are present and falls back to logging (the previous
  // behavior) if not, rather than throwing at startup or at send time.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  // FIX PWA-PUSH-01: Web Push (VAPID) keys — same optional,
  // opt-in-only pattern as SMTP_*/CLOUDINARY_*/GOOGLE_CLIENT_* above.
  // Generated once per deployment via `npx web-push generate-vapid-
  // keys` (see pushService.ts's doc comment); the public half is also
  // set as NEXT_PUBLIC_VAPID_PUBLIC_KEY on the frontend and MUST match
  // this VAPID_PUBLIC_KEY exactly — a mismatched pair fails silently
  // at subscribe time (the browser accepts any well-formed key, the
  // push service only rejects it once a send is attempted with the
  // mismatched private key). VAPID_SUBJECT is a mailto: or https: URL
  // push services use to contact the sender if a deployment is
  // misbehaving (spec requirement, not this app's own contact info).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  // NEW — Firebase Admin SDK credentials for native (Capacitor) push,
  // separate from the VAPID keys above (those are Web Push only). Get
  // these three from Firebase Console → Project Settings → Service
  // Accounts → Generate new private key. FIREBASE_PRIVATE_KEY's
  // newlines must be escaped as \n in the .env file (standard for this
  // key format); fcmPushService.ts un-escapes them before use.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // FIX SEC-ALERT-01: separate, optional webhook for security alerts
  // (account lockouts, refresh-token reuse detection). Distinct from the
  // generic ERROR_REPORTER_WEBHOOK_URL in logger.ts — that one is for
  // application errors; this one is specifically for security events and
  // is intentionally kept separate so a team can route them to different
  // channels (e.g. ops alerting vs. a dedicated security channel).
  SECURITY_ALERT_WEBHOOK_URL: z.string().url().optional(),
  // FIX AUDIT-V5-01: previously there was no cap on how many active ads
  // a single user could have simultaneously. Combined with no per-user
  // listing quota, a single account (even unverified) could create an
  // unbounded number of ads, which is both a spam vector and a resource-
  // exhaustion risk (DB rows, Cloudinary storage, search index size).
  // Configurable via env so it can be tuned per deployment without a
  // code change; defaults to a generous but finite value.
  // FIX APM-01: optional — Sentry is only initialized (in instrument.ts)
  // if this is set, same "opt-in, app works identically without it"
  // pattern as CLOUDINARY_*/SMTP_* above. Read independently by
  // instrument.ts via its own process.env access (not by importing this
  // env module), since Sentry.init() must run before ANY other module
  // is imported for its auto-instrumentation to work correctly — that
  // includes this module. Duplicated here in the schema purely so
  // `.env.example` and this file's validation stay the single source of
  // truth for "what env vars does this app recognize," and so other
  // modules (e.g. logger.ts, to decide whether to mention Sentry status
  // in a health-check payload) can read env.observability.sentryDsn
  // without reaching into process.env directly themselves.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z
    .string()
    .regex(
      /^(0(\.\d+)?|1(\.0+)?)$/,
      "SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1",
    )
    .default("0.1"),
  MAX_ADS_PER_USER: z.string().regex(/^\d+$/).default("50"),
  // AUDIT-FIX 1.1: previously a hardcoded `30` inside adLock.ts. Made
  // configurable, same "opt-in tuning, sane default" pattern as
  // MAX_ADS_PER_USER above — deployments with slower Cloudinary
  // round-trips (more images per ad, slower network) can raise this
  // without a code change; default matches the prior hardcoded value
  // so existing behavior is unchanged unless the var is explicitly set.
  IMAGE_LOCK_TTL_SECONDS: z.string().regex(/^\d+$/).default("30"),
  // FIX M-009: sellerLock/storeLock/serviceProviderLock previously used
  // a hardcoded 15s TTL each, unlike IMAGE_LOCK_TTL_SECONDS above which
  // was already made configurable. If the locked operation (which can
  // include a Cloudinary upload for a profile photo/logo) takes longer
  // than the TTL, the lock self-releases while the original request is
  // still running, letting a concurrent request acquire a fresh lock
  // and potentially create a duplicate row that violates a DB
  // uniqueness constraint. Raised default to 30s (matching
  // IMAGE_LOCK_TTL_SECONDS's own default) and made configurable so
  // deployments with slower upload round-trips can raise it further
  // without a code change.
  SELLER_LOCK_TTL_SECONDS: z.string().regex(/^\d+$/).default("30"),
  STORE_LOCK_TTL_SECONDS: z.string().regex(/^\d+$/).default("30"),
  SERVICE_PROVIDER_LOCK_TTL_SECONDS: z.string().regex(/^\d+$/).default("30"),
  // FIX M-029: healthCache's CACHE_DURATION was a hardcoded 30_000ms
  // (30s), meaning /ready could keep reporting "healthy" from cache for
  // up to 30s after DB/Redis actually became unreachable — a
  // meaningful delay in a load balancer noticing an unhealthy instance
  // and pulling it out of rotation. Lowered default to 8s (within the
  // 5-10s range the audit recommends) and made configurable so
  // deployments can tune the accuracy/DB-load tradeoff without a code
  // change.
  HEALTH_CACHE_DURATION_MS: z.string().regex(/^\d+$/).default("8000"),
  // Fraud-detection (item 12) tuning knobs — all optional with sane
  // defaults, same "opt-in tuning" pattern as MAX_ADS_PER_USER/
  // IMAGE_LOCK_TTL_SECONDS above, so existing deployments see no
  // behavior change unless a var is explicitly set.
  //
  // RAPID_POSTING: more than FRAUD_RAPID_POSTING_MAX_POSTS ad creations
  // by the same user within FRAUD_RAPID_POSTING_WINDOW_SECONDS.
  FRAUD_RAPID_POSTING_WINDOW_SECONDS: z.string().regex(/^\d+$/).default("60"),
  FRAUD_RAPID_POSTING_MAX_POSTS: z.string().regex(/^\d+$/).default("5"),
  // An account younger than this is treated as "new" for
  // NEW_ACCOUNT_HIGH_ACTIVITY weighting purposes.
  FRAUD_NEW_ACCOUNT_WINDOW_HOURS: z.string().regex(/^\d+$/).default("24"),
  // Ad riskScore (0-100) at or above this auto-sets flaggedForReview.
  FRAUD_AUTO_FLAG_THRESHOLD: z.string().regex(/^\d+$/).default("60"),
  // AUDIT-FIX 1.3: analytics.repository.ts's trendByEvent/topCategories
  // run raw, unindexed-aggregate-friendly but potentially expensive
  // GROUP BY queries (date_trunc bucketing, JSON metadata extraction)
  // over an admin-selectable date range with no upper bound enforced
  // elsewhere — a large enough range could tie up a Postgres connection
  // indefinitely with no application-level timeout anywhere in this
  // codebase. Milliseconds (not seconds) to match Postgres's own
  // statement_timeout unit directly — no conversion needed at the call
  // site. Default (10s) is generous for a dashboard read, not a hard
  // architectural limit — tune per deployment if real query patterns
  // need more.
  ANALYTICS_QUERY_TIMEOUT_MS: z.string().regex(/^\d+$/).default("10000"),
  // PROD-FIX-03: /metrics was previously unauthenticated at the
  // application level with only a code comment recommending a
  // reverse-proxy allowlist — no such reverse-proxy config exists
  // anywhere in this repo, so a deployment that doesn't add its own
  // network-level restriction exposes internal route structure (every
  // req.route label value ever observed) to anyone who requests the
  // URL. Optional, like CLOUDINARY_*/SMTP_*/SENTRY_DSN — if unset,
  // /metrics keeps its previous unauthenticated behavior (matches
  // /health, /ready — meant to be reachable by an infra scraper with
  // no credentials). If set, GET /metrics requires this exact value
  // in an `Authorization: Bearer <token>` header. This does not
  // replace a real network-level restriction (a reverse-proxy
  // allowlist is still the more robust fix) — it's a zero-infra
  // baseline for deployments that haven't set one up yet.
  METRICS_TOKEN: z.string().optional(),
  // CENTRALIZE-04: previously read directly via process.env in
  // rateLimit.middleware.ts with no schema entry — worked, but meant
  // it had no validation/docs and wasn't visible alongside every other
  // config flag in .env.example generation. Same opt-in pattern as
  // BLACKLIST_STRICT above; dev/CI convenience switch, never intended
  // for production.
  DISABLE_RATE_LIMIT: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  // CENTRALIZE-04: previously read directly via process.env in
  // capacityCheck.ts with no schema entry. Validated/documented here
  // for .env.example generation purposes, but NOT re-exported on the
  // `env` object below — capacityCheck.ts deliberately keeps reading
  // process.env.PM2_INSTANCES directly at call time (see that file's
  // own comment) because tests/unit/capacityCheck.test.ts mutates it
  // between test cases without jest.resetModules() and expects a live
  // read, which a value frozen at this module's first import can't
  // provide. Not constrained to \d+ here since PM2 also accepts
  // non-numeric values like 'max' for this var; capacityCheck.ts's own
  // regex test is what decides whether a given value is usable as a
  // number.
  PM2_INSTANCES: z.string().optional(),
  // CENTRALIZE-04: previously read directly via process.env in
  // logger.ts with no schema entry, unlike SENTRY_DSN right above
  // (which already had one specifically so other modules could read
  // env.observability.sentryDsn instead of reaching into process.env).
  // Same reasoning applies here.
  ERROR_REPORTER_WEBHOOK_URL: z.string().url().optional(),
  // CENTRALIZE-04: previously read directly via process.env in the
  // report:cleanup-failed-tasks / report:demote-stale-boosts scripts,
  // with no schema entry. These two scripts run inside the same full
  // app environment as the server (same .env, same required secrets),
  // unlike seedE2E.ts/smokeTest.ts which are deliberately invoked
  // standalone with only 1-2 vars set — those two remain on direct
  // process.env access; see their own files for why.
  FAILED_TASK_RETENTION_DAYS: z.string().regex(/^\d+$/).default("30"),
  STALE_BOOST_DAYS: z.string().regex(/^\d+$/).default("60"),
  DRY_RUN: z
    .string()
    .default("false")
    .transform((v) => v === "1" || v === "true"),
});

// L-2 (audit fix): superRefine (not a required-by-default field on the
// schema itself) because the requirement is conditional on NODE_ENV —
// dev/test still allow an unauthenticated local Redis. This is the
// application-level enforcement that was previously missing; it fires
// at startup (same place JWT_SECRET/DATABASE_URL failures surface),
// not silently at connection time.
const envSchemaWithRedisCheck = envSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && !data.REDIS_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_PASSWORD"],
      message: "REDIS_PASSWORD is required when NODE_ENV=production",
    });
  }

  // FIX PROD-AUDIT-01: CLOUDINARY_* was optional at every NODE_ENV, same
  // as SMTP_*/GOOGLE_CLIENT_* — correct for those (fully optional
  // features), but wrong here: .env.example's own comment on this block
  // says "Cloudinary (required for image uploads)" while nothing
  // actually enforced that in production. Combined with the disabled
  // zero-image check in ads.controller.ts (see TRACK-IMG-HOSTING), a
  // production deploy with these unset previously started cleanly and
  // silently accepted image-less ads/products/service-listings with no
  // working upload path at all. Dev/test still allow all three unset
  // (placeholder-image / no-upload local workflows), matching
  // REDIS_PASSWORD's dev-vs-prod split above. All three are required
  // together — a partially-configured Cloudinary account is a
  // misconfiguration, not a valid opt-out.
  if (
    data.NODE_ENV === "production" &&
    (!data.CLOUDINARY_CLOUD_NAME || !data.CLOUDINARY_API_KEY || !data.CLOUDINARY_API_SECRET)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CLOUDINARY_CLOUD_NAME"],
      message:
        "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are all required when NODE_ENV=production",
    });
  }
});

const parsed = envSchemaWithRedisCheck.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  // Under Jest (and any other test runner that sets JEST_WORKER_ID /
  // VITEST), throw instead of process.exit(1). process.exit kills the
  // entire test process — including every suite that hasn't run yet —
  // which is what used to abort the backend suite mid-run when a unit
  // test temporarily set NODE_ENV=production (authCookies, etc.) and
  // re-imported this module without REDIS_PASSWORD. Throwing still
  // fails the offending test, but leaves the rest of the run intact.
  // Real server startups (no JEST_WORKER_ID / VITEST) keep the hard
  // exit so a misconfigured deploy never boots with invalid env.
  const runningUnderTest =
    process.env.JEST_WORKER_ID !== undefined ||
    process.env.VITEST !== undefined ||
    process.env.NODE_ENV === "test";
  if (runningUnderTest) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  process.exit(1);
}

const _env = parsed.data;

// FIX BUG-06: parses JWT_EXPIRES_IN ("15m", "1h", "3600", …) into a
// plain integer of seconds. jsonwebtoken accepts this same string
// format via the `ms` package internally, but `ms` is only a
// transitive dependency here (pulled in by jsonwebtoken itself, not
// listed in package.json) — importing it directly would be relying on
// another package's implementation detail that could silently
// disappear on a dependency bump. This covers the same suffixes `ms`
// does for the units actually used in JWT expiry config (s/m/h/d) plus
// a bare integer (already-seconds), which is all env.jwt.expiresIn is
// ever set to in practice.
function parseExpiresInToSeconds(value: string): number {
  const bareNumber = Number(value);
  if (!Number.isNaN(bareNumber) && /^\d+$/.test(value)) return bareNumber;

  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    // Falls back to the schema's own default rather than throwing —
    // this only ever feeds a response body field used to size a
    // client-side cookie's maxAge (see auth.service.ts's issueSession/
    // refresh), never the actual token signing (jwt.sign gets the raw
    // env.jwt.expiresIn string directly and does its own validation),
    // so a malformed value here shouldn't be able to crash startup.
    console.error(
      `⚠️  Could not parse JWT_EXPIRES_IN="${value}" — defaulting expiresInSeconds to 900 (15m)`,
    );
    return 900;
  }
  const [, amountStr, unit] = match;
  const amount = Number(amountStr);
  const multiplier = { s: 1, m: 60, h: 60 * 60, d: 60 * 60 * 24 }[
    unit as "s" | "m" | "h" | "d"
  ];
  return amount * multiplier;
}

export const env = {
  port: parseInt(_env.PORT, 10),
  nodeEnv: _env.NODE_ENV,
  frontendUrl: _env.FRONTEND_URL,
  database: { url: _env.DATABASE_URL },
  jwt: {
    secret: _env.JWT_SECRET,
    refreshSecret: _env.JWT_REFRESH_SECRET,
    expiresIn: _env.JWT_EXPIRES_IN,
    // FIX BUG-06: numeric seconds form of expiresIn, returned to the
    // client in login/register/refresh responses so the frontend can
    // derive its access-token cookie's maxAge from the backend's
    // actual configured TTL instead of a hardcoded constant — see
    // frontend/lib/cookies.ts's cookieMaxAgeFromExpiresIn.
    expiresInSeconds: parseExpiresInToSeconds(_env.JWT_EXPIRES_IN),
    // Same treatment as expiresIn/expiresInSeconds above, for the
    // refresh token: jwt.ts's signRefreshToken uses the raw string for
    // jwt.sign, authCookies.ts uses the seconds form (×1000) for the
    // cookie's maxAge — both now read from this single value instead
    // of each hardcoding '7d' independently.
    refreshExpiresIn: _env.JWT_REFRESH_EXPIRES_IN,
    refreshExpiresInSeconds: parseExpiresInToSeconds(
      _env.JWT_REFRESH_EXPIRES_IN,
    ),
  },
  redis: {
    host: _env.REDIS_HOST,
    port: parseInt(_env.REDIS_PORT, 10),
    username: _env.REDIS_USERNAME,
    password: _env.REDIS_PASSWORD,
    tls: _env.REDIS_TLS,
  },
  security: {
    // Parse to number — Express trust proxy requires a number, not a string
    trustProxy: parseInt(_env.TRUST_PROXY, 10),
    blacklistStrict: _env.BLACKLIST_STRICT,
  },
  cloudinary: {
    // .trim() defends against the single most common cause of Cloudinary
    // "Invalid Signature" 401s: a trailing newline/space picked up when
    // copy-pasting the secret from the Cloudinary dashboard into Railway's
    // Variables UI. The value still "looks" set (isConfigured stays true),
    // but the signature Cloudinary computes server-side won't match ours.
    cloudName: (_env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: (_env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: (_env.CLOUDINARY_API_SECRET || "").trim(),
    // PROD-FIX: all three vars are `.optional()` in the schema above
    // (so a deploy with none set boots fine), but every upload/avatar/
    // logo/cover call unconditionally calls cloudinary.config() with
    // whatever is here. Missing/blank creds don't fail at boot — they
    // fail on the *first* upload request, with Cloudinary's own error
    // swallowed into a generic "Image upload failed" (see cloudinary.ts).
    // This flag lets index.ts fail loudly at startup instead.
    isConfigured: Boolean(
      _env.CLOUDINARY_CLOUD_NAME &&
      _env.CLOUDINARY_API_KEY &&
      _env.CLOUDINARY_API_SECRET,
    ),
  },
  // FIX OAUTH-01: same isConfigured pattern as email.isConfigured
  // above — true only once all three vars are present. Consumed by
  // google.strategy.ts (whether to register the Passport strategy at
  // all) and auth.routes.ts / auth.controller.ts (whether to accept
  // requests to /auth/google at all, vs. returning a clear 503).
  googleOAuth: {
    clientId: _env.GOOGLE_CLIENT_ID || "",
    clientSecret: _env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl: _env.GOOGLE_CALLBACK_URL || "",
    isConfigured: Boolean(
      _env.GOOGLE_CLIENT_ID &&
      _env.GOOGLE_CLIENT_SECRET &&
      _env.GOOGLE_CALLBACK_URL,
    ),
  },
  email: {
    smtpHost: _env.SMTP_HOST || "",
    smtpPort: _env.SMTP_PORT ? parseInt(_env.SMTP_PORT, 10) : 587,
    smtpSecure: _env.SMTP_SECURE ?? false,
    smtpUser: _env.SMTP_USER || "",
    smtpPassword: _env.SMTP_PASSWORD || "",
    fromEmail: _env.SMTP_FROM_EMAIL || "no-reply@example.com",
    fromName: _env.SMTP_FROM_NAME || "سوق غزة",
    // Email sending is considered "configured" only once host+user+password
    // are all present — partial config (e.g. just a from-address) isn't
    // enough to attempt a real SMTP connection.
    isConfigured: Boolean(
      _env.SMTP_HOST && _env.SMTP_USER && _env.SMTP_PASSWORD,
    ),
  },
  // FIX PWA-PUSH-01: same isConfigured pattern as email above —
  // pushService.ts checks this once at first use and falls back to
  // logging instead of throwing when any piece is missing, so the app
  // keeps starting and running normally without real VAPID keys.
  webPush: {
    publicKey: _env.VAPID_PUBLIC_KEY || "",
    privateKey: _env.VAPID_PRIVATE_KEY || "",
    subject: _env.VAPID_SUBJECT || "mailto:admin@example.com",
    isConfigured: Boolean(_env.VAPID_PUBLIC_KEY && _env.VAPID_PRIVATE_KEY),
  },
  // NEW — see FIREBASE_* doc comment above. Same graceful-degradation
  // convention as webPush: fcmPushService.ts logs instead of throwing
  // when unconfigured.
  fcm: {
    projectId: _env.FIREBASE_PROJECT_ID || "",
    clientEmail: _env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: (_env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    isConfigured: Boolean(
      _env.FIREBASE_PROJECT_ID &&
      _env.FIREBASE_CLIENT_EMAIL &&
      _env.FIREBASE_PRIVATE_KEY,
    ),
  },
  securityAlert: {
    webhookUrl: _env.SECURITY_ALERT_WEBHOOK_URL || "",
  },
  ads: {
    maxPerUser: parseInt(_env.MAX_ADS_PER_USER, 10),
    imageLockTtlSeconds: parseInt(_env.IMAGE_LOCK_TTL_SECONDS, 10),
  },
  // FIX M-009
  locks: {
    sellerLockTtlSeconds: parseInt(_env.SELLER_LOCK_TTL_SECONDS, 10),
    storeLockTtlSeconds: parseInt(_env.STORE_LOCK_TTL_SECONDS, 10),
    serviceProviderLockTtlSeconds: parseInt(
      _env.SERVICE_PROVIDER_LOCK_TTL_SECONDS,
      10,
    ),
  },
  // FIX M-029
  health: {
    cacheDurationMs: parseInt(_env.HEALTH_CACHE_DURATION_MS, 10),
  },
  fraud: {
    rapidPostingWindowSeconds: parseInt(
      _env.FRAUD_RAPID_POSTING_WINDOW_SECONDS,
      10,
    ),
    rapidPostingMaxPosts: parseInt(_env.FRAUD_RAPID_POSTING_MAX_POSTS, 10),
    newAccountWindowHours: parseInt(_env.FRAUD_NEW_ACCOUNT_WINDOW_HOURS, 10),
    autoFlagThreshold: parseInt(_env.FRAUD_AUTO_FLAG_THRESHOLD, 10),
  },
  analytics: {
    queryTimeoutMs: parseInt(_env.ANALYTICS_QUERY_TIMEOUT_MS, 10),
  },
  observability: {
    sentryDsn: _env.SENTRY_DSN || "",
    sentryTracesSampleRate: parseFloat(_env.SENTRY_TRACES_SAMPLE_RATE),
    metricsToken: _env.METRICS_TOKEN || "",
    errorReporterWebhookUrl: _env.ERROR_REPORTER_WEBHOOK_URL || "",
  },
  // CENTRALIZE-04
  rateLimit: {
    disabled: _env.DISABLE_RATE_LIMIT,
  },
  // CENTRALIZE-04
  reports: {
    failedTaskRetentionDays: parseInt(_env.FAILED_TASK_RETENTION_DAYS, 10),
    staleBoostDays: parseInt(_env.STALE_BOOST_DAYS, 10),
    dryRun: _env.DRY_RUN,
  },
} as const;
