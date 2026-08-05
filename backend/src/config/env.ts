import dotenv from 'dotenv';
import { z } from 'zod';

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
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
}
dotenv.config();

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  // TERMUX/PROOT SUPPORT: '127.0.0.1' rather than 'localhost' as the
  // default — proot-distro Ubuntu's /etc/hosts and localhost resolution
  // order can behave inconsistently inside the sandbox, and the literal
  // loopback address sidesteps that entirely. Real deployments should
  // still set REDIS_HOST explicitly; this only changes what happens if
  // it's left unset.
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.string().regex(/^\d+$/).default('6379'),
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
  // TRUST_PROXY must be a number (1 = trust one proxy hop, e.g. nginx/Cloudflare)
  // String "1" is NOT equivalent to number 1 in Express trust proxy logic
  TRUST_PROXY: z.string().regex(/^\d+$/, 'TRUST_PROXY must be a number').default('1'),
  BLACKLIST_STRICT: z
    .string()
    .transform(v => v === 'true')
    .default('true'),
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
    .transform(v => v === 'true')
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
    .regex(/^(0(\.\d+)?|1(\.0+)?)$/, 'SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1')
    .default('0.1'),
  MAX_ADS_PER_USER: z.string().regex(/^\d+$/).default('50'),
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
});

// L-2 (audit fix): superRefine (not a required-by-default field on the
// schema itself) because the requirement is conditional on NODE_ENV —
// dev/test still allow an unauthenticated local Redis. This is the
// application-level enforcement that was previously missing; it fires
// at startup (same place JWT_SECRET/DATABASE_URL failures surface),
// not silently at connection time.
const envSchemaWithRedisCheck = envSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.REDIS_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_PASSWORD'],
      message: 'REDIS_PASSWORD is required when NODE_ENV=production',
    });
  }
});

const parsed = envSchemaWithRedisCheck.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const _env = parsed.data;

export const env = {
  port: parseInt(_env.PORT, 10),
  nodeEnv: _env.NODE_ENV,
  frontendUrl: _env.FRONTEND_URL,
  database: { url: _env.DATABASE_URL },
  jwt: {
    secret: _env.JWT_SECRET,
    refreshSecret: _env.JWT_REFRESH_SECRET,
    expiresIn: _env.JWT_EXPIRES_IN,
  },
  redis: {
    host: _env.REDIS_HOST,
    port: parseInt(_env.REDIS_PORT, 10),
    password: _env.REDIS_PASSWORD,
  },
  security: {
    // Parse to number — Express trust proxy requires a number, not a string
    trustProxy: parseInt(_env.TRUST_PROXY, 10),
    blacklistStrict: _env.BLACKLIST_STRICT,
  },
  cloudinary: {
    cloudName: _env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: _env.CLOUDINARY_API_KEY || '',
    apiSecret: _env.CLOUDINARY_API_SECRET || '',
  },
  // FIX OAUTH-01: same isConfigured pattern as email.isConfigured
  // above — true only once all three vars are present. Consumed by
  // google.strategy.ts (whether to register the Passport strategy at
  // all) and auth.routes.ts / auth.controller.ts (whether to accept
  // requests to /auth/google at all, vs. returning a clear 503).
  googleOAuth: {
    clientId: _env.GOOGLE_CLIENT_ID || '',
    clientSecret: _env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: _env.GOOGLE_CALLBACK_URL || '',
    isConfigured: Boolean(
      _env.GOOGLE_CLIENT_ID && _env.GOOGLE_CLIENT_SECRET && _env.GOOGLE_CALLBACK_URL
    ),
  },
  email: {
    smtpHost: _env.SMTP_HOST || '',
    smtpPort: _env.SMTP_PORT ? parseInt(_env.SMTP_PORT, 10) : 587,
    smtpSecure: _env.SMTP_SECURE ?? false,
    smtpUser: _env.SMTP_USER || '',
    smtpPassword: _env.SMTP_PASSWORD || '',
    fromEmail: _env.SMTP_FROM_EMAIL || 'no-reply@example.com',
    fromName: _env.SMTP_FROM_NAME || 'سوق غزة',
    // Email sending is considered "configured" only once host+user+password
    // are all present — partial config (e.g. just a from-address) isn't
    // enough to attempt a real SMTP connection.
    isConfigured: Boolean(_env.SMTP_HOST && _env.SMTP_USER && _env.SMTP_PASSWORD),
  },
  // FIX PWA-PUSH-01: same isConfigured pattern as email above —
  // pushService.ts checks this once at first use and falls back to
  // logging instead of throwing when any piece is missing, so the app
  // keeps starting and running normally without real VAPID keys.
  webPush: {
    publicKey: _env.VAPID_PUBLIC_KEY || '',
    privateKey: _env.VAPID_PRIVATE_KEY || '',
    subject: _env.VAPID_SUBJECT || 'mailto:admin@example.com',
    isConfigured: Boolean(_env.VAPID_PUBLIC_KEY && _env.VAPID_PRIVATE_KEY),
  },
  securityAlert: {
    webhookUrl: _env.SECURITY_ALERT_WEBHOOK_URL || '',
  },
  ads: {
    maxPerUser: parseInt(_env.MAX_ADS_PER_USER, 10),
  },
  observability: {
    sentryDsn: _env.SENTRY_DSN || '',
    sentryTracesSampleRate: parseFloat(_env.SENTRY_TRACES_SAMPLE_RATE),
    metricsToken: _env.METRICS_TOKEN || '',
  },
} as const;
