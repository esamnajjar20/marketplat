/**
 * Next.js configuration.
 *
 * FIX NEXT-01: X-XSS-Protection header removed.
 *   This header is deprecated and ignored by all modern browsers.
 *   Chrome removed support in 2019. Using it signals outdated security
 *   practices and may interfere with some parsers.
 *
 * FIX NEXT-02: Added Content-Security-Policy header.
 *   Provides defence-in-depth against XSS. Policy is permissive enough
 *   for development but blocks the most common attack vectors.
 *
 * FIX NEXT-03 (historical — see FIX DEAD-09 below): Rewrite destination
 *   used private API_BASE_URL (not NEXT_PUBLIC_API_URL). NEXT_PUBLIC_
 *   variables are bundled into the client JS and visible in the
 *   browser — the backend origin should not be exposed this way for
 *   security and flexibility.
 *
 * FIX DEAD-09: removed the rewrites() block entirely. api/client.ts's
 *   apiClient sets `baseURL: API_BASE_URL` directly (an absolute URL,
 *   e.g. http://localhost:5000/api/v1) rather than requesting a
 *   relative /api/v1/* path, so every real request bypassed this
 *   rewrite unconditionally — it never fired in dev or any other
 *   environment. No other fetch() call in the app uses a relative
 *   /api/v1 path either. Left as-is, it risked signaling a routing
 *   layer that doesn't actually exist to a future maintainer.
 *
 * FIX NEXT-04: Cloudinary remotePatterns scoped to cloud-specific path.
 *   Was '/**' (allows any Cloudinary asset from any account).
 *   Now scoped to the configured cloud name.
 *
 * FIX NEXT-05: Added Strict-Transport-Security (HSTS) header.
 *   Enforces HTTPS in production — no-op for local dev (HTTP).
 *
 * FIX NEXT-06: Enabled logging for fetch requests in development for
 *   easier debugging of server-side fetch calls.
 */
import type { NextConfig } from 'next';

const isDev  = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

// FIX NEXT-04: Use the cloud-name-scoped path.
const cloudinaryCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // FIX D-18: standalone output bundles only the files actually needed
  // to run (a minimal node_modules subset + server code), which is what
  // the new production Dockerfile copies into its final stage. Without
  // this, a Docker image would need the full node_modules tree.
  output: 'standalone',

  // PERF-01: Never expose the X-Powered-By: Next.js header — saves ~30 bytes
  // per response and avoids advertising the framework to scanners.
  poweredByHeader: false,

  // PERF-01: Explicitly enable gzip/brotli compression on all responses.
  // Default is true, but stated explicitly so it's obvious if ever disabled.
  compress: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        // FIX NEXT-04: scope to your cloud to prevent hotlinking from other accounts.
        pathname: cloudinaryCloudName
          ? `/${cloudinaryCloudName}/**`
          : '/**',
      },
      // Allow placeholder images in development only.
      ...(isDev
        ? [{ protocol: 'https' as const, hostname: 'placehold.co' }]
        : []),
    ],
    // Explicit supported formats — avoids serving WebP to Safari < 14.
    formats: ['image/avif', 'image/webp'],

    // PERF-02: Cache optimised images for 7 days (default is 60 s — far too short
    // for a marketplace where ad images rarely change).
    minimumCacheTTL: 60 * 60 * 24 * 7,

    // PERF-02: Narrow the responsive breakpoints to only the sizes the UI actually
    // uses. Fewer breakpoints = fewer image variants generated on-demand.
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes:  [64, 128, 256, 384],
  },

  // FIX PERF-03: lucide-react is imported via named imports in 30+
  // files across the app (icons for admin tables, category grid, forms,
  // etc). Named imports from an ESM package are already tree-shakeable
  // in principle, but optimizePackageImports goes further by rewriting
  // each import to its individual icon module at build time, which cuts
  // down what the bundler and dev-server compiler have to analyze per
  // build/HMR pass — most noticeable in dev-server startup and
  // incremental build time on a codebase this size, with a modest
  // production bundle-size benefit as a side effect.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  async headers() {
    // FIX SEC-06: the Content-Security-Policy header previously built here
    // used a static 'unsafe-inline' for script-src in ALL environments,
    // including production — next.config.ts's headers() runs once at
    // build time and has no way to generate a fresh value per request,
    // so a real nonce was never possible from this file alone.
    // CSP generation (with a per-request nonce) has moved to
    // middleware.ts, which runs on every request and can both mint a
    // nonce and forward it to Next.js's own script injection via the
    // `x-nonce` request header. All other static security headers
    // remain here since they don't need to vary per request.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',      value: 'nosniff' },
          { key: 'X-Frame-Options',              value: 'DENY' },
          // FIX NEXT-01: X-XSS-Protection removed — deprecated since 2019.
          { key: 'Referrer-Policy',              value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',           value: 'camera=(), microphone=(), geolocation=()' },
          // FIX NEXT-05: HSTS — force HTTPS; ignored on HTTP (local dev).
          ...(isProd
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        // FIX PWA-09: public/sw.js يُخدَّم افتراضيًا بترويسات كاش عامة لملفات
        // public/ الثابتة (قد تصل لساعات/أيام حسب المضيف) — هذا خطير تحديدًا
        // لملف الـ Service Worker نفسه: لو تم تخزينه مؤقتًا من طرف
        // CDN/المتصفح، فإن كل منطق "تحديث تلقائي للنسخة الجديدة" في
        // registerServiceWorker() (lib/pwa.ts) يتعطل — يظل المستخدم عالقًا
        // على نسخة SW قديمة حتى لو نُشر إصدار جديد من الكود. no-cache
        // يجبر المتصفح على التحقق من الخادم في كل مرة (304 إن لم يتغيّر).
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          // FIX PWA-10: يسمح للـ SW بالتحكم بنطاق أوسع من مساره الفعلي لو
          // احتاج المشروع لاحقًا خدمته من مسار فرعي — غير ضروري حاليًا (هو
          // في جذر public/ فعلًا) لكن غير ضار، ويوثّق النية بوضوح.
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // manifest.webmanifest يتغيّر نادرًا لكنه صغير جدًا؛ لا داعٍ لتخزين
        // طويل الأمد قد يؤخر ظهور shortcuts/أيقونات جديدة بعد نشرها.
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' }],
      },
    ];
  },

  // FIX NEXT-06: Log server-side fetch calls in development.
  logging: isDev ? { fetches: { fullUrl: true } } : undefined,
};

export default nextConfig;
