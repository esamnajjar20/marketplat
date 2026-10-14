/**
 * Service Worker — سوق غزة PWA
 * - صفحات App Shell و RSC: شبكة أولًا مع مهلة، ثم الكاش عند الانقطاع/البطء.
 * - JS/CSS الثابتة: Stale-While-Revalidate. الصور: Cache First.
 * - API (GET): شبكة أولًا؛ البيانات الشخصية في كاش مقسَّم حسب المستخدم.
 * - API (الكتابة): طابور IndexedDB يُعاد إرساله عند عودة الاتصال.
 * - لا كاش لـ /auth و /csrf ولا لصفحات المصادقة.
 * - ارفع CACHE_VERSION فقط عند تغيّر سياسة الكاش (وطابقه في lib/offlineCoreBundle.ts و lib/offlineRouteShells.ts).
 * - لا تستدعِ skipWaiting() من install؛ التفعيل برسالة SKIP_WAITING.
 */

try { importScripts('/cache-policy.js', '/cache-contract.js'); } catch (_) {}
const MARKET_STORAGE_POLICY = self.MARKET_CACHE_POLICY?.storage?.serviceWorker ?? {};

// ارفع الرقم عند تغيير سياسة الكاش أو استراتيجيات fetch.
const CACHE_VERSION = 'v62';

const STATIC_CACHE = `market-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `market-images-${CACHE_VERSION}`;
const API_CACHE = `market-api-${CACHE_VERSION}`;

// كاش بيانات المستخدم مقسَّم حسب هويته (يُمسح عند الخروج).
const USER_DATA_CACHE_PREFIX = `market-user-data-${CACHE_VERSION}-`;

const MAX_USER_DATA_ENTRIES = MARKET_STORAGE_POLICY.userDataEntries ?? 40;
const MAX_USER_DATA_BYTES = MARKET_STORAGE_POLICY.userDataBytes ?? 8 * 1024 * 1024;

// الباك-إند يوقّع userId، و sub مدعوم أيضًا.
function jwtSubject(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.userId === 'string' && payload.userId) return payload.userId;
  if (typeof payload.sub === 'string' && payload.sub) return payload.sub;
  return null;
}

function userDataCacheName(userId) {
  return `${USER_DATA_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function userIdFromAuthorization(request) {
  try {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) return null;
    const parts = match[1].split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    return jwtSubject(payload);
  } catch {
    return null;
  }
}

function userDataCacheForRequest(request) {
  const userId = userIdFromAuthorization(request);
  return userId ? userDataCacheName(userId) : null;
}

// آخر مستخدم كتب في كاشه (لإعادة التحميل أوفلاين بلا توكن).
const SW_META_CACHE = 'market-sw-meta';
const LAST_USER_KEY = '/__sw-last-user';
let lastUserIdMemo = null;

function lastUserKeyUrl() {
  return new URL(LAST_USER_KEY, self.location.origin).href;
}

async function rememberLastUserId(userId) {
  if (!userId || userId === lastUserIdMemo) return;
  lastUserIdMemo = userId;
  try {
    const cache = await caches.open(SW_META_CACHE);
    await cache.put(lastUserKeyUrl(), new Response(userId, { headers: { 'Content-Type': 'text/plain' } }));
  } catch {   }
}

async function readLastUserId() {
  if (lastUserIdMemo) return lastUserIdMemo;
  try {
    const cache = await caches.open(SW_META_CACHE);
    const res = await cache.match(lastUserKeyUrl());
    if (!res) return null;
    const text = (await (typeof res.clone === 'function' ? res.clone() : res).text()).trim();
    if (text) lastUserIdMemo = text;
    return text || null;
  } catch {
    return null;
  }
}

async function forgetLastUserId() {
  lastUserIdMemo = null;
  try { await caches.delete(SW_META_CACHE); } catch {   }
}

const DATA_CACHE_MIGRATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ترحيل بيانات الكاش الحديثة بين الإصدارات قبل حذف القديم.
async function copyCacheEntries(fromName, toName) {
  const from = await caches.open(fromName);
  const to = await caches.open(toName);
  const requests = await from.keys();
  for (const req of requests) {
    try {
      if (await to.match(req, { ignoreVary: true })) continue;
      const res = await from.match(req, { ignoreVary: true });
      if (!res) continue;
      const cachedAt = Number(res.headers && res.headers.get('X-SW-Cached-At')) || 0;
      if (cachedAt && Date.now() - cachedAt > DATA_CACHE_MIGRATION_MAX_AGE_MS) continue;
      await to.put(req, res);
    } catch {   }
  }
}

function planDataCacheMigration(cacheNames) {
  const plan = [];
  for (const name of cacheNames) {
    let m = /^market-api-v(\d+)$/.exec(name);
    if (m) { if (name !== API_CACHE) plan.push({ v: Number(m[1]), from: name, to: API_CACHE }); continue; }
    m = /^market-core-v(\d+)$/.exec(name);
    if (m) { if (name !== CORE_CACHE) plan.push({ v: Number(m[1]), from: name, to: CORE_CACHE }); continue; }
    m = /^market-images-v(\d+)$/.exec(name);
    if (m) { if (name !== IMAGE_CACHE) plan.push({ v: Number(m[1]), from: name, to: IMAGE_CACHE }); continue; }
    m = /^market-user-data-v(\d+)-(.+)$/.exec(name);
    if (m) {
      const to = `${USER_DATA_CACHE_PREFIX}${m[2]}`;
      if (name !== to) plan.push({ v: Number(m[1]), from: name, to });
    }
  }
  return plan.sort((a, b) => b.v - a.v);
}

async function migrateDataCaches(cacheNames) {
  for (const step of planDataCacheMigration(cacheNames)) {
    try { await copyCacheEntries(step.from, step.to); } catch {   }
  }
}

// شكل الصفحات الشخصية — منفصل ويُمسح عند الخروج.
const PERSONAL_SHELL_CACHE = `market-personal-shell-${CACHE_VERSION}`;

// يطابق CORE_CACHE في lib/offlineCoreBundle.ts.
const CORE_CACHE = `market-core-${CACHE_VERSION}`;

// إعلانات محفوظة يدويًا — بلا رقم إصدار عمدًا.
const SAVED_ADS_CACHE = 'market-saved-ads';

const MAX_API_ENTRIES = MARKET_STORAGE_POLICY.apiEntries ?? 60;

const MAX_IMAGE_ENTRIES = MARKET_STORAGE_POLICY.imageEntries ?? 80;

const MAX_STATIC_ENTRIES = MARKET_STORAGE_POLICY.staticEntries ?? 500;

const MAX_STATIC_BYTES = MARKET_STORAGE_POLICY.staticBytes ?? 30 * 1024 * 1024;

const MAX_SAVED_ADS_ENTRIES = MARKET_STORAGE_POLICY.savedAdsEntries ?? 700;

const MAX_PERSONAL_SHELL_ENTRIES = MARKET_STORAGE_POLICY.personalShellEntries ?? 300;

const PERMANENT_PUBLIC_SHELL_PATHS = new Set(['/offline', '/about', '/contact', '/privacy', '/terms']);
const PERMANENT_PERSONAL_SHELL_PATHS = new Set([
  '/ads/create', '/my-store/products/new', '/my-services/new', '/requests/new', '/complete-profile',
]);

function pathnameOfCacheKey(request) {
  try { return new URL(typeof request === 'string' ? request : request.url, self.location.origin).pathname; }
  catch { return ''; }
}

function isPermanentShellKey(request, cacheName) {
  const pathname = pathnameOfCacheKey(request);
  if (cacheName === PERSONAL_SHELL_CACHE) return PERMANENT_PERSONAL_SHELL_PATHS.has(pathname);
  if (cacheName === STATIC_CACHE) return PERMANENT_PUBLIC_SHELL_PATHS.has(pathname);
  return false;
}

async function collectPermanentShellAssets() {
  const assets = new Set();
  const cacheSpecs = [
    [STATIC_CACHE, PERMANENT_PUBLIC_SHELL_PATHS],
    [PERSONAL_SHELL_CACHE, PERMANENT_PERSONAL_SHELL_PATHS],
  ];
  await Promise.all(cacheSpecs.map(async ([cacheName, paths]) => {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      await Promise.all(keys.map(async (key) => {
        if (!paths.has(pathnameOfCacheKey(key))) return;
        const response = await cache.match(key);
        if (!response || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return;
        const html = await response.clone().text();
        for (const match of html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+\.(?:js|css))(?:[?][^"']*)?["']/g)) {
          if (match[1]) assets.add(new URL(match[1], self.location.origin).href);
        }
      }));
    } catch {   }
  }));
  return assets;
}

const OFFLINE_URL = '/offline';

// صفحة خطأ صغيرة تُبقي الرابط وتعرض زر إعادة المحاولة.
function buildOfflineErrorPage() {
  const html = [
    '<!DOCTYPE html><html lang="ar" dir="rtl"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>\u062a\u0639\u0630\u0651\u0631 \u0627\u0644\u062a\u062d\u0645\u064a\u0644</title>',
    '<style>',
    'html,body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fafaf8;color:#1f1a13;min-height:100%}',
    'body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}',
    '.card{max-width:22rem;width:100%;padding:2rem 1.5rem;border:1px solid #e6e2db;border-radius:1rem;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.04);text-align:center}',
    'h1{font-size:1.125rem;margin:0 0 .5rem;font-weight:700}',
    'p{color:#6b6358;font-size:.875rem;margin:0 0 1.25rem;line-height:1.6}',
    'button{background:#2d5a3d;color:#fff;border:0;border-radius:.6rem;padding:.75rem 1.25rem;font-size:.875rem;font-weight:600;cursor:pointer;font-family:inherit}',
    'button:active{transform:scale(.97)}',
    '</style></head><body><div class="card">',
    '<h1>\u062a\u0639\u0630\u0651\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0635\u0641\u062d\u0629</h1>',
    '<p>\u064a\u0628\u062f\u0648 \u0623\u0646 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0636\u0639\u064a\u0641 \u0623\u0648 \u0645\u0646\u0642\u0637\u0639\u060c \u0648\u0627\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0645 \u062a\u064f\u062d\u0641\u064e\u0638 \u0639\u0644\u0649 \u062c\u0647\u0627\u0632\u0643.</p>',
    '<button onclick="location.reload()">\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629</button>',
    '</div></body></html>',
  ].join('');
  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

const READ_BATCH_PATH = '/api/v1/batch';

// يجب أن تطابق lib/offlineQueue.ts.
const QUEUE_DB_NAME = 'market-offline-queue';
const QUEUE_DB_VERSION = 2;
const QUEUE_STORE_NAME = 'requests';

const SYNC_TAG = 'replay-offline-queue';

// مهلات الشبكة الضعيفة: الطلب الحقيقي يكمل بالخلفية بعد المهلة.
const NETWORK_TIMEOUT_MS = 5000

const NAVIGATE_TIMEOUT_MS = 15000

const NAVIGATE_TIMEOUT_CACHED_MS = 8000

const MAX_QUEUE_RETRIES = 5

const MAX_QUEUE_SERVER_RETRIES = 3

const QUEUE_RETRY_MIN_GAP_MS = 30_000;

let queueRetryMinGapMs = QUEUE_RETRY_MIN_GAP_MS;
let queueConcurrencyHint = 1;

const MAX_QUEUE_BODY_BYTES = 6 * 1024 * 1024;

const MAX_QUEUE_ENTRIES = 500;
const MAX_QUEUE_TOTAL_BYTES = 20 * 1024 * 1024;

// ترويسات لا تُخزَّن ولا تُعاد (بينها Authorization).
const QUEUE_STRIP_HEADERS = new Set([
  'content-length',
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-connection',
  'accept-encoding',

  'authorization',
]);

function decodeAccessTokenUserId(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return jwtSubject(payload);
  } catch {
    return null;
  }
}

function createOfflineOperationId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {}

  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeQueueHeaders(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (QUEUE_STRIP_HEADERS.has(String(key).toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

// سباق بين fetch والمهلة دون إلغاء fetch.
function withNetworkTimeout(fetchPromise, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error('SW network timeout'), { name: 'SwTimeoutError' }));
    }, ms);

    fetchPromise.then(
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const API_PATH_PREFIX = '/api/v1';

const PROTECTED_AD_EDIT_RE = /^\/ads\/[^/]+\/edit(?:\/.*)?$/;

// صفحات شخصية: لا تُخزَّن في STATIC_CACHE العام. طابِقها مع middleware.ts.
function isProtectedPage(url) {
  if (PROTECTED_AD_EDIT_RE.test(url.pathname)) return true;
  const protectedPrefixes = [
    '/dashboard',
    '/account',
    '/settings',
    '/my-ads',
    '/my-services',
    '/favorites',
    '/messages',

    '/notifications',
    '/ads/create',

    '/my-store',
    '/admin',

    '/service-requests',
    '/my-reports',
    '/complete-profile',

    '/my-requests',
    '/requests/new',
    '/requests/me',
    '/requests/offers',
    '/activity',
    '/saved-searches',
  ];
  return protectedPrefixes.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

function isNeverCache(url) {
  return url.pathname.includes('/auth/') || url.pathname.includes('/csrf');
}

function isAuthPage(url) {
  const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  return authPaths.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
}

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

// قوائم عامة تُحفظ في كاش المستخدم حتى مع Authorization.
const PUBLIC_LIST_API_PREFIXES = [
  '/api/v1/ads',
  '/api/v1/products',
  '/api/v1/stores',
  '/api/v1/services',
  '/api/v1/service-listings',
  '/api/v1/categories',
  '/api/v1/product-categories',
  '/api/v1/service-categories',
  '/api/v1/home',

  '/api/v1/home/feed',
];

function isPublicListApiPath(url) {

  const path = url.pathname;
  return PUBLIC_LIST_API_PREFIXES.some((prefix) => path === prefix);
}

function isImageRequest(request, url) {
  if (request.destination === 'image') return true;

  const host = String(url.hostname || '').toLowerCase();
  return host === 'cloudinary.com' || host.endsWith('.cloudinary.com');
}

// الـ API يُستدعى من نفس النطاق؛ يمكن إضافة نطاقات عبر MARKET_CACHE_POLICY.apiOrigins.
const EXTRA_API_ORIGINS = new Set(
  Array.isArray(self.MARKET_CACHE_POLICY?.apiOrigins)
    ? self.MARKET_CACHE_POLICY.apiOrigins.filter((o) => typeof o === 'string')
    : [],
);

function isTrustedApiOrigin(url) {
  return url.origin === self.location.origin || EXTRA_API_ORIGINS.has(url.origin);
}

// عناصر الطابور تُرسل مع الكوكيز والتوكن: لا تُرسل إلا لـ API الخاص بنا.
function isTrustedQueueUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    return (u.protocol === 'https:' || u.protocol === 'http:') &&
      isTrustedApiOrigin(u) &&
      u.pathname.startsWith(`${API_PATH_PREFIX}/`);
  } catch { return false; }
}

// روابط الإشعارات: نفس النطاق فقط.
function safeSameOriginUrl(raw, fallback = '/') {
  try {
    const parsed = new URL(String(raw ?? ''), self.location.origin);
    if (parsed.origin !== self.location.origin) return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return fallback; }
}

function isReadBatchRequest(url, request) {
  return request.method === 'POST' && url.pathname === READ_BATCH_PATH;
}

function isUnsafeMethod(method) {
  const m = String(method || 'POST').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

function isRscShellRequest(request) {
  return request.headers.get('RSC') === '1';
}

const HUB_PATHS = new Set([
  '/my-store',
  '/my-services',
  '/settings',
  '/activity',
  ]);

function hubDocumentKey(request, url) {
  if (
    request.mode === 'navigate' &&
    HUB_PATHS.has(url.pathname) &&
    url.search
  ) {
    return url.origin + url.pathname;
  }
  return request;
}

function rscShellKey(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(String(input), self.location.origin);
  } catch {
    return `${String(input).split('?')[0]}?__offline_rsc_shell`;
  }

  const params = new URLSearchParams(url.search);
  params.delete('_rsc');
  params.delete('__offline_rsc_shell');
  if (HUB_PATHS.has(url.pathname)) {
    return `${url.pathname}?__offline_rsc_shell`;
  }
  params.sort();
  const query = params.toString();
  return `${url.pathname}?${query ? `${query}&` : ''}__offline_rsc_shell`;
}

function isPersonalShellRoute(url) {
  const path = url.pathname;

  if (PROTECTED_AD_EDIT_RE.test(path)) return false;
  if (path === '/admin' || path.startsWith('/admin/')) return false;
  if (isAuthPage(url)) return false;

  return isProtectedPage(url);
}

// يكشف captive portal (تحويل لأصل مختلف).
function isSameOriginResponse(response) {
  if (!response) return false;
  if (!response.redirected) return true;
  try {
    return new URL(response.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

async function stripVaryAndClone(response) {
  const headers = new Headers(response.headers);
  headers.delete('Vary');
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function normalizeExistingHtmlCache(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    for (const request of requests) {
      try {
        let url;
        try { url = new URL(request.url); } catch { continue; }
        if (url.origin !== self.location.origin || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) continue;
        if (url.searchParams.has('_rsc') || url.searchParams.has('__offline_rsc_shell')) continue;
        if (/\.[a-z0-9]{2,8}$/i.test(url.pathname)) continue;
        const response = await cache.match(request);
        if (!response || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) continue;
        if (!response.headers.has('Vary')) continue;
        await cache.put(request, await stripVaryAndClone(response));
      } catch {

        continue;
      }
    }
  } catch {

  }
}

async function putTimestamped(cache, request, response, cacheSource) {
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cached-At', String(Date.now()));
  if (cacheSource) headers.set('X-SW-Cache-Source', cacheSource);
  const body = await response.blob();
  const stamped = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, stamped);
}

function isUsableStaticAssetResponse(assetUrl, response) {
  if (!response || !response.ok || !isSameOriginResponse(response)) return false;
  let pathname = assetUrl;
  try { pathname = new URL(assetUrl, self.location.origin).pathname; } catch {   }
  const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (/\.css$/i.test(pathname)) return contentType === 'text/css';
  if (/\.js$/i.test(pathname)) return contentType.includes('javascript') || contentType.includes('ecmascript');
  return false;
}

// يحفظ HTML الصفحة وملفاتها الأولية معًا أو لا يحفظ شيئًا.
async function cacheVisitedDocumentShell(url, htmlCache, documentResponse, htmlCacheName = STATIC_CACHE) {
  try {
    const docUrl = new URL(url.href);

    const rawParts = docUrl.search.slice(1).split('&').filter(Boolean);
    const keptParts = rawParts.filter((part) => {
      const rawKey = part.split('=')[0];
      try {
        return decodeURIComponent(rawKey.replace(/\+/g, ' ')) !== '_rsc';
      } catch {
        return rawKey !== '_rsc';
      }
    });
    docUrl.search = keptParts.length ? `?${keptParts.join('&')}` : '';

    const response = documentResponse
      ? documentResponse.clone()
      : await fetch(docUrl.href, {
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        });
    if (
      !response.ok ||
      response.redirected ||
      !isSameOriginResponse(response) ||
      !response.headers.get('content-type')?.toLowerCase().includes('text/html')
    ) return;

    const html = await response.clone().text();
    const assetUrls = [...new Set(Array.from(
      html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+\.(?:js|css))(?:\?[^"']*)?["']/g),
    )
      .map((match) => match[1])
      .filter((value) => typeof value === 'string' && value.length > 0))];
    if (assetUrls.length === 0) return;

    const staticCache = await caches.open(STATIC_CACHE);
    const missing = [];
    const alreadyCached = [];
    for (const assetUrl of assetUrls) {
      const existing = await staticCache.match(assetUrl);
      if (isUsableStaticAssetResponse(assetUrl, existing)) alreadyCached.push({ assetUrl, asset: existing });
      else {
        if (existing) await staticCache.delete(assetUrl);
        missing.push(assetUrl);
      }
    }

    const downloaded = [];
    for (let i = 0; i < missing.length; i += 4) {
      const batch = await Promise.all(missing.slice(i, i + 4).map(async (assetUrl) => {
        const asset = await fetch(assetUrl, { credentials: 'same-origin' });
        if (!isUsableStaticAssetResponse(assetUrl, asset)) throw new Error(`asset-invalid-${asset.status}`);
        return { assetUrl, asset };
      }));
      downloaded.push(...batch);
    }

    for (const item of [...alreadyCached, ...downloaded]) {
      await putTimestamped(staticCache, item.assetUrl, item.asset, 'visit-asset');
    }
    const cacheKey = HUB_PATHS.has(docUrl.pathname) && docUrl.search
      ? docUrl.pathname
      : docUrl.href;
    await putTimestamped(htmlCache, cacheKey, await stripVaryAndClone(response), 'visit');

    const committedHtml = await htmlCache.match(cacheKey);
    if (!committedHtml || !committedHtml.headers.get('content-type')?.toLowerCase().includes('text/html')) return;
    for (const assetUrl of assetUrls) {
      const committedAsset = await staticCache.match(assetUrl);
      if (!isUsableStaticAssetResponse(assetUrl, committedAsset)) {
        await htmlCache.delete(cacheKey);
        return;
      }
    }
    await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES);
    if (htmlCacheName === PERSONAL_SHELL_CACHE) {
      await trimCache(PERSONAL_SHELL_CACHE, MAX_PERSONAL_SHELL_ENTRIES);
    }
  } catch {

  }
}

function isRealRscNavigation(request) {
  if (!isRscShellRequest(request)) return false;
  const prefetch = request.headers.get('Next-Router-Prefetch');
  const purpose = request.headers.get('Purpose') || request.headers.get('Sec-Purpose') || '';
  return prefetch !== '1' && !/prefetch/i.test(purpose);
}

// كتابة الكاش بالخلفية دون حجب الرد.
async function staleWhileRevalidate(event, request, cacheKey) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(cacheKey);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {

        const snapshot = response.clone();
        const isRsc = isRscShellRequest(request);
        event.waitUntil((async () => {
          try {
            const toStore = isRsc ? await stripVaryAndClone(snapshot) : snapshot;

            await putTimestamped(cache, cacheKey, toStore);
            await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES);
          } catch {   }
        })());
      }
      return response;
    })
    .catch(() => undefined);

  event.waitUntil(networkFetch);

  if (cachedResponse) return cachedResponse;

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  if (isRscShellRequest(request)) {
    return Response.error();
  }

  if (request.mode === 'navigate') {
    return buildOfflineErrorPage();
  }

  return Response.error();
}

// لا تُقدَّم صفحة مخزنة إن غابت ملفاتها (يمنع ChunkLoadError).
async function verifyCachedChunks(cachedResponse, cache) {
  try {
    if (!cachedResponse.headers.get('content-type')?.toLowerCase().includes('text/html')) return false;
    const html = await cachedResponse.clone().text();
    const chunkUrls = Array.from(
      html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+\.(?:js|css))(?:\?[^"']*)?["']/g),
    )
      .map((match) => match[1])
      .filter((value) => typeof value === 'string' && value.length > 0);
    if (chunkUrls.length === 0) return false;
    for (const url of chunkUrls) {
      const hit = await cache.match(url);
      if (!isUsableStaticAssetResponse(url, hit)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function lookupShellWithFallback(cache, request, url) {
  const isRsc = isRscShellRequest(request);
  const exact = await cache.match(request);
  if (exact) return exact;
  if (request.mode !== 'navigate' && !isRsc) return null;
  if (url.search) {
    const bareKey = isRsc ? rscShellKey(url.origin + url.pathname) : url.origin + url.pathname;
    const bare = await cache.match(bareKey);
    if (bare) return bare;
  }
  const altPath = url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1) || '/'
    : url.pathname + '/';
  const altKey = isRsc ? rscShellKey(url.origin + altPath) : url.origin + altPath;
  return await cache.match(altKey) || null;
}

// صفحات عامة: شبكة أولًا ثم آخر نسخة مخزنة.
async function networkFirstPage(event, request, cacheKey) {
  const url = new URL(request.url);
  const cache = await caches.open(STATIC_CACHE);

  const hasCachedShell = !!(await lookupShellWithFallback(cache, request, url));
  const navigateTimeout = hasCachedShell ? NAVIGATE_TIMEOUT_CACHED_MS : NAVIGATE_TIMEOUT_MS;
  const fetchPromise = fetch(request);
  try {
    const response = await withNetworkTimeout(fetchPromise, navigateTimeout);
    if (response && response.ok && isSameOriginResponse(response)) {
      const isHtmlVisit = request.mode === 'navigate' &&
        (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
      if (isHtmlVisit) {

        event.waitUntil(cacheVisitedDocumentShell(url, cache, response.clone(), STATIC_CACHE));
      } else {

        const snapshot = response.clone();
        const shellSource = isRscShellRequest(request) ? 'rsc' : undefined;
        event.waitUntil((async () => {
          try {
            const toStore = await stripVaryAndClone(snapshot);
            await putTimestamped(cache, cacheKey, toStore, shellSource);
            await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES);
          } catch {   }
        })());
        if (isRealRscNavigation(request)) {
          event.waitUntil(cacheVisitedDocumentShell(url, cache, undefined, STATIC_CACHE));
        }
      }
    }
    return response;
  } catch (err) {

    if (err && err.name === 'SwTimeoutError') {
      event.waitUntil(
        fetchPromise
          .then(async (response) => {
            if (response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
              const isHtmlVisit = request.mode === 'navigate' &&
                (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
              if (isHtmlVisit) {
                await cacheVisitedDocumentShell(url, cache, response.clone(), STATIC_CACHE);
              } else {
                const toStore = await stripVaryAndClone(response.clone());
                await putTimestamped(cache, cacheKey, toStore, isRscShellRequest(request) ? 'rsc' : undefined);
                if (isRealRscNavigation(request)) await cacheVisitedDocumentShell(url, cache, undefined, STATIC_CACHE);
                await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES);
              }
            }
          })
          .catch(() => {}),
      );
    }

    const cachedResponse = await lookupShellWithFallback(cache, request, url);
    if (cachedResponse) {

      if (!isRscShellRequest(request)) {
        const safe = await verifyCachedChunks(cachedResponse, cache);
        if (!safe) {

          return buildOfflineErrorPage();
        }
      }
      return cachedResponse;
    }

    if (isRscShellRequest(request)) {
      return Response.error();
    }

    if (request.mode === 'navigate') {
      return buildOfflineErrorPage();
    }

    return Response.error();
  }
}

const protectedNavGeneration = new Map();

// صفحات محمية: شبكة أولًا؛ كاش PERSONAL_SHELL للمسارات المسموحة فقط.
async function handleProtectedPage(event, request, url) {
  const useShellCache = isPersonalShellRoute(url);
  const cacheKey = isRscShellRequest(request) ? rscShellKey(url) : hubDocumentKey(request, url);

  const myGeneration = (protectedNavGeneration.get(url.pathname) || 0) + 1;
  protectedNavGeneration.set(url.pathname, myGeneration);

  if (protectedNavGeneration.size > 200) {
    const keysToDelete = Array.from(protectedNavGeneration.keys()).slice(0, 100);
    keysToDelete.forEach((k) => protectedNavGeneration.delete(k));
  }

  let navigateTimeout = NETWORK_TIMEOUT_MS;
  if (useShellCache) {
    const shellCache = await caches.open(PERSONAL_SHELL_CACHE);
    if (await shellCache.match(cacheKey)) {
      navigateTimeout = NAVIGATE_TIMEOUT_CACHED_MS;
    }
  }
  const fetchPromise = fetch(request);
  try {
    const response = await withNetworkTimeout(fetchPromise, navigateTimeout);

    if (useShellCache && response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
      const cache = await caches.open(PERSONAL_SHELL_CACHE);
      const isHtmlVisit = request.mode === 'navigate' &&
        (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
      if (isHtmlVisit) {

        event.waitUntil(cacheVisitedDocumentShell(url, cache, response.clone(), PERSONAL_SHELL_CACHE));
      } else {

        const snapshot = response.clone();
        const shellSource = isRscShellRequest(request) ? 'rsc' : undefined;
        event.waitUntil((async () => {
          try {
            const toStore = await stripVaryAndClone(snapshot);
            await putTimestamped(cache, cacheKey, toStore, shellSource);
            await trimCache(PERSONAL_SHELL_CACHE, MAX_PERSONAL_SHELL_ENTRIES);
          } catch {   }
        })());
        if (isRealRscNavigation(request)) {
          event.waitUntil(cacheVisitedDocumentShell(url, cache, undefined, PERSONAL_SHELL_CACHE));
        }
      }
    }
    return response;
  } catch (err) {

    if (err && err.name === 'SwTimeoutError') {
      if (useShellCache) {
        event.waitUntil(
          fetchPromise
            .then(async (response) => {
              if (response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
                const cache = await caches.open(PERSONAL_SHELL_CACHE);
                const isHtmlVisit = request.mode === 'navigate' &&
                  (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
                if (isHtmlVisit) {
                  await cacheVisitedDocumentShell(url, cache, response.clone(), PERSONAL_SHELL_CACHE);
                } else {
                  const toStore = await stripVaryAndClone(response.clone());
                  await putTimestamped(cache, cacheKey, toStore, isRscShellRequest(request) ? 'rsc' : undefined);
                  if (isRealRscNavigation(request)) await cacheVisitedDocumentShell(url, cache, undefined, PERSONAL_SHELL_CACHE);
                  await trimCache(PERSONAL_SHELL_CACHE, MAX_PERSONAL_SHELL_ENTRIES);
                }
              }
            })
            .catch(() => {}),
        );
      }
    }

    const isSupersededRace =
      err && err.name === 'AbortError' && protectedNavGeneration.get(url.pathname) !== myGeneration;
    if (isSupersededRace) {
      throw err;
    }
    if (useShellCache) {
      const shellCache = await caches.open(PERSONAL_SHELL_CACHE);

      const cachedShell = await lookupShellWithFallback(shellCache, request, url);
      if (cachedShell) {

        if (!isRscShellRequest(request)) {
          const staticCache = await caches.open(STATIC_CACHE);
          const safe = await verifyCachedChunks(cachedShell, staticCache);
          if (!safe) {
            if (request.mode === 'navigate') {
              const offlineFallback = await staticCache.match(OFFLINE_URL);
              return offlineFallback || Response.error();
            }
            return Response.error();
          }
        }
        return cachedShell;
      }
    }

    if (isRscShellRequest(request)) {
      return Response.error();
    }

    if (request.mode === 'navigate') {
      const cache = await caches.open(STATIC_CACHE);
      const offlineFallback = await cache.match(OFFLINE_URL);
      return offlineFallback || Response.error();
    }
    return Response.error();
  }
}

async function handlePageRequest(event, request, url) {
  if (isProtectedPage(url)) {
    return handleProtectedPage(event, request, url);
  }

  if (isAuthPage(url)) {
    return fetch(request);
  }

  const cacheKey = isRscShellRequest(request) ? rscShellKey(url) : hubDocumentKey(request, url);
  return networkFirstPage(event, request, cacheKey);
}

// الصور: IMAGE_CACHE ثم SAVED_ADS ثم CORE ثم الشبكة.
async function cacheFirstImage(event, request, url) {

  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const savedCache = await caches.open(SAVED_ADS_CACHE);
  const savedHit = await savedCache.match(request);
  if (savedHit) {

    event.waitUntil(trimCache(SAVED_ADS_CACHE, MAX_SAVED_ADS_ENTRIES));
    return savedHit;
  }

  if (url.pathname === '/_next/image') {
    const inner = url.searchParams.get('url');
    if (inner) {
      try {

        const rawHit = await savedCache.match(inner);
        if (rawHit) return rawHit;
      } catch {

      }
    }
  }

  try {
    const coreCache = await caches.open(CORE_CACHE);
    const coreHit = await coreCache.match(request.url);
    if (coreHit) return coreHit;
  } catch {

  }

  try {
    const response = await fetch(request);

    if (response && response.ok && response.status !== 206) {

      const len = response.headers.get('content-length');
      const lenNum = len ? Number(len) : 0;
      const tooLarge = Number.isFinite(lenNum) && lenNum > 2.5 * 1024 * 1024;
      if (!tooLarge) {

        const toCache = response.clone();
        event.waitUntil(
          shouldSkipDisposableCacheWrite(IMAGE_CACHE).then((skip) => {
            if (skip) return;
            return putTimestamped(cache, request, toCache).then(() =>
              trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES),
            );
          }).catch(() => {}),
        );
      }
    }
    return response;
  } catch (error) {

    if (url.pathname === '/_next/image') {
      try {
        const inner = url.searchParams.get('url');
        if (inner) {
          const coreCache = await caches.open(CORE_CACHE);

          const warmed = await coreCache.match(inner);
          if (warmed) return warmed;
        }
      } catch {

      }
    }
    console.warn('[SW IMAGE] network error', request.url, error && error.message);
    return Response.error();
  }
}

const AGE_WEIGHT = {
  200: 0.1,
  100: 0.1,
   60: 0.5,
   55: 0.5,
   45: 1,
   20: 1,
   15: 5,
    8: 2,
    3: 3,
   10: 1,
};
function ageWeightFor(tier) {
  return AGE_WEIGHT[tier] ?? 1;
}

// أولوية الاحتفاظ لكل مدخل عند التقليم (الأعلى يبقى أطول).
function inferCacheTier(cacheName, request) {
  if (cacheName.includes('saved-ads')) return 200;
  if (cacheName.includes('personal-shell')) {

    try {
      const path = new URL(request.url).pathname;

      if (path === '/settings/storage' || path === '/settings/sync') return 55;
    } catch {

    }
    return 20;
  }
  if (cacheName.includes('image')) return 3;
  if (cacheName.includes('api')) return 15;
  if (cacheName.includes('static')) {
    try {
      const parsedRequestUrl = new URL(request.url);
      if (parsedRequestUrl.searchParams.has('__offline_rsc_shell')) return 8;
      const path = parsedRequestUrl.pathname;
      if (path === '/offline' || path === '/') return 100;

      if (path.startsWith('/_next/static')) return 45;
      if (
        path.startsWith('/products') ||
        path.startsWith('/search') ||
        path.startsWith('/ads') ||
        path.startsWith('/services') ||
        path.startsWith('/stores')
      ) return 60;
      return 8;
    } catch {
      return 10;
    }
  }
  return 10;
}

const TRIM_MIN_INTERVAL_MS = 30_000;
const lastTrimAtByCache = new Map();

async function storagePressureRatio() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number' || estimate.quota <= 0) return null;
    return Math.min(1, Math.max(0, estimate.usage / estimate.quota));
  } catch { return null; }
}

function adaptiveCacheLimits(cacheName, maxEntries, maxBytes, ratio) {
  if (ratio == null || (cacheName !== API_CACHE && cacheName !== IMAGE_CACHE)) return { maxEntries, maxBytes };
  if (ratio >= 0.95) return { maxEntries: Math.max(10, Math.floor(maxEntries * 0.25)), maxBytes: maxBytes ? Math.floor(maxBytes * 0.25) : undefined };
  if (ratio >= 0.90) return { maxEntries: Math.max(20, Math.floor(maxEntries * 0.5)), maxBytes: maxBytes ? Math.floor(maxBytes * 0.5) : undefined };
  return { maxEntries, maxBytes };
}

async function shouldSkipDisposableCacheWrite(cacheName) {
  const ratio = await storagePressureRatio();
  return ratio != null && ratio >= 0.95 && (cacheName === API_CACHE || cacheName === IMAGE_CACHE);
}

// تقليم بحسب الأولوية والعمر والحجم (X-SW-Cached-At).
async function trimCache(cacheName, maxEntries, maxBytes) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const limits = adaptiveCacheLimits(cacheName, maxEntries, maxBytes, await storagePressureRatio());
  maxEntries = limits.maxEntries;
  maxBytes = limits.maxBytes;

  if (keys.length <= maxEntries && maxBytes === undefined) return;

  if (keys.length <= maxEntries) {
    const last = lastTrimAtByCache.get(cacheName) || 0;
    if (Date.now() - last < TRIM_MIN_INTERVAL_MS) return;
  }
  lastTrimAtByCache.set(cacheName, Date.now());

  const MISSING_LEN_ESTIMATE = 48 * 1024;

  if (maxBytes !== undefined && keys.length <= maxEntries) {
    const sampleSize = Math.min(50, keys.length);
    let sampleBytes = 0;
    let measured = 0;
    for (let i = 0; i < sampleSize; i += 1) {
      const res = await cache.match(keys[i]);
      const len = res && res.headers.get('content-length');
      const n = len ? Number(len) : 0;
      if (Number.isFinite(n) && n > 0) {
        sampleBytes += n;
        measured += 1;
      } else {
        sampleBytes += MISSING_LEN_ESTIMATE;
      }
    }
    const avg = sampleSize > 0 ? sampleBytes / sampleSize : 0;
    const estimated = avg * keys.length;

    if (estimated < maxBytes * 0.9 && measured >= sampleSize * 0.3) return;
  }

  const now = Date.now();
  const permanentAssets = cacheName === STATIC_CACHE ? await collectPermanentShellAssets() : new Set();
  const entries = await Promise.all(
    keys.map(async (key) => {
      const res = await cache.match(key);
      const raw = res && res.headers.get('X-SW-Cached-At');
      const ts = raw ? Number(raw) : 0;

      const lenRaw = res && res.headers.get('content-length');
      const parsed = lenRaw ? Number(lenRaw) : NaN;
      const size = Number.isFinite(parsed) && parsed > 0 ? parsed : MISSING_LEN_ESTIMATE;
      const tier = inferCacheTier(cacheName, key);
      const source = res && res.headers.get('X-SW-Cache-Source');
      const contentType = (res && res.headers.get('content-type') || '').toLowerCase();

      const permanentShell = isPermanentShellKey(key, cacheName);
      const permanentAsset = cacheName === STATIC_CACHE && permanentAssets.has(new URL(key.url).href);
      const permanentBonus = permanentShell ? 1_000_000_000 : permanentAsset ? 900_000_000 : 0;
      const visitBonus = contentType.includes('text/html') && source === 'visit'
        ? 100000
        : source === 'visit-asset' ? 160000 : 0;
      const ageHours = ts > 0 ? (now - ts) / 3_600_000 : 9999;
      const sizeKB = Number.isFinite(size) && size > 0 ? size / 1024 : 0;

      const score =
        permanentBonus + visitBonus + tier * 1000 - ageHours * ageWeightFor(tier) - sizeKB / 100;
      return { key, ts, size: Number.isFinite(size) ? size : 0, score };
    }),
  );

  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  const overEntries = entries.length > maxEntries;
  const overBytes = maxBytes !== undefined && totalBytes > maxBytes;
  if (!overEntries && !overBytes) return;

  entries.sort((a, b) => a.score - b.score);

  let remainingEntries = entries.length;
  let remainingBytes = totalBytes;
  for (const e of entries) {
    if (remainingEntries <= maxEntries && (maxBytes === undefined || remainingBytes <= maxBytes)) {
      break;
    }
    await cache.delete(e.key);
    remainingEntries -= 1;
    remainingBytes -= e.size;
  }
}

function cacheControlHasDirective(value, directive) {
  return String(value || '').split(',').some((part) => part.trim().split('=')[0].trim().toLowerCase() === directive.toLowerCase());
}

function cacheControlRequiresValidation(value) {
  const directives = String(value || '').split(',').map((part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    return {
      name: String(rawName || '').trim().toLowerCase(),
      value: rawValue.join('=').trim().replace(/^"|"$/g, ''),
    };
  });
  return directives.some(({ name, value }) =>
    name === 'no-store' ||
    name === 'no-cache' ||
    name === 'must-revalidate' ||
    name === 'proxy-revalidate' ||
    ((name === 'max-age' || name === 's-maxage') && value === '0'),
  );
}

function responseVariesBy(response, headerName) {
  const vary = (response?.headers?.get('vary') || '').split(',').map((part) => part.trim().toLowerCase());
  return vary.includes('*') || vary.includes(headerName.toLowerCase());
}

function isSafeSharedApiSnapshot(response) {
  if (!response) return false;
  const headers = response.headers;
  const cacheControl = headers.get('cache-control') || '';

  return !cacheControlRequiresValidation(cacheControl) &&
    !cacheControlHasDirective(cacheControl, 'private') &&
    !headers.has('set-cookie') &&
    !responseVariesBy(response, 'cookie') &&
    !responseVariesBy(response, 'authorization');
}

function isSafeUserApiSnapshot(response) {
  if (!response) return false;
  const headers = response.headers;
  const cacheControl = headers.get('cache-control') || '';

  return !cacheControlRequiresValidation(cacheControl) &&
    !headers.has('set-cookie') &&
    !responseVariesBy(response, 'cookie') &&
    !responseVariesBy(response, 'authorization');
}

// GET للـ API: شبكة أولًا ثم كاش آمن حسب الهوية.
async function networkFirstApi(event, request, url) {
  const cache = await caches.open(API_CACHE);
  const fetchPromise = fetch(request);
  const hadAuth = request.headers.get('authorization') != null;
  const userCacheName = hadAuth ? userDataCacheForRequest(request) : null;
  const publicListOk = isPublicListApiPath(url);
  const isAdminApi = url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/') || /\/api\/v\d+\/admin(?:\/|$)/i.test(url.pathname);
  const isSensitiveApi = isNeverCache(url) || isAdminApi || /\/(?:auth|csrf|sessions?|tokens?|password|payment-intents?|checkout\/confirm)(?:\/|$)/i.test(url.pathname);

  const storeIfAllowed = async (response) => {
    if (!response || isSensitiveApi) return;
    const headers = response.headers;
    const contentType = (headers.get('content-type') || '').toLowerCase();
    const cacheControl = headers.get('cache-control') || '';
    if (!(response.ok && response.status !== 206 && isSameOriginResponse(response) && contentType.includes('application/json'))) return;
    if (cacheControlRequiresValidation(cacheControl) || headers.has('set-cookie')) return;

    if (!hadAuth) {
      if (!isSafeSharedApiSnapshot(response)) return;
      if (await shouldSkipDisposableCacheWrite(API_CACHE)) return;
      await putTimestamped(cache, request, response.clone());
      await trimCache(API_CACHE, MAX_API_ENTRIES);
      return;
    }

    if (!userCacheName || responseVariesBy(response, 'cookie')) return;
    const userDataCache = await caches.open(userCacheName);
    await putTimestamped(userDataCache, request, response.clone());
    await trimCache(userCacheName, MAX_USER_DATA_ENTRIES, MAX_USER_DATA_BYTES);
    if (publicListOk) await rememberLastUserId(userIdFromAuthorization(request));
  };

  try {
    const response = await withNetworkTimeout(fetchPromise, NETWORK_TIMEOUT_MS);

    event.waitUntil(storeIfAllowed(response.clone()).catch(() => {}));
    return response;
  } catch (err) {
    const timedOut = !!(err && err.name === 'SwTimeoutError');
    if (timedOut) event.waitUntil(fetchPromise.then((late) => storeIfAllowed(late.clone())).catch(() => {}));

    if (hadAuth) {
      if (!isSensitiveApi && userCacheName) {
        const userDataCache = await caches.open(userCacheName);
        const cachedUserData = await userDataCache.match(request, { ignoreVary: true });
        if (cachedUserData && isSafeUserApiSnapshot(cachedUserData)) return cachedUserData;
      }

      if (publicListOk && !isSensitiveApi) {
        const cachedApi = await cache.match(request, { ignoreVary: true });
        if (cachedApi && isSafeSharedApiSnapshot(cachedApi)) return cachedApi;
        const coreCache = await caches.open(CORE_CACHE);
        const cachedCore = await coreCache.match(request.url);
        if (cachedCore && isSafeSharedApiSnapshot(cachedCore)) return cachedCore;
      }
    } else {

      if (publicListOk && !isSensitiveApi) {
        const lastUserId = await readLastUserId();
        if (lastUserId) {
          const lastUserCache = await caches.open(userDataCacheName(lastUserId));
          const cachedForUser = await lastUserCache.match(request, { ignoreVary: true });
          if (cachedForUser && isSafeUserApiSnapshot(cachedForUser)) return cachedForUser;
        }
      }
      const cachedApi = await cache.match(request, { ignoreVary: true });
      if (cachedApi && isSafeSharedApiSnapshot(cachedApi)) return cachedApi;
      const coreCache = await caches.open(CORE_CACHE);
      const cachedCore = await coreCache.match(request.url);
      if (cachedCore && isSafeSharedApiSnapshot(cachedCore)) return cachedCore;
    }

    if (!isSensitiveApi) {
      const savedCache = await caches.open(SAVED_ADS_CACHE);
      const cachedSaved = await savedCache.match(request.url);
      if (cachedSaved) return cachedSaved;
    }
    if (timedOut) return fetchPromise.catch(() => Response.error());
    return Response.error();
  }
}

// طابور الأوفلاين (IndexedDB).
function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      const db = req.result;

      db.onversionchange = () => { try { db.close(); } catch {   } };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Offline queue DB upgrade blocked'));
  });
}

function estimateQueueEntryBytes(entry) {
  let bodyBytes = 0;
  const body = entry && entry.body;
  try {
    if (typeof Blob !== 'undefined' && body instanceof Blob) bodyBytes = body.size;
    else if (body instanceof ArrayBuffer) bodyBytes = body.byteLength;
    else if (ArrayBuffer.isView(body)) bodyBytes = body.byteLength;
    else if (typeof body === 'string') bodyBytes = body.length * 2;
    else if (body && typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) bodyBytes = body.toString().length * 2;
    else if (body != null) bodyBytes = JSON.stringify(body).length * 2;
  } catch { bodyBytes = MAX_QUEUE_BODY_BYTES + 1; }
  let metadataBytes = 1024;
  try {
    const metadata = { ...entry, body: undefined };
    metadataBytes = new TextEncoder().encode(JSON.stringify(metadata)).byteLength + 256;
  } catch {   }
  return bodyBytes + metadataBytes;
}

async function queueRequestEntry(entry, lifecycleVersion = queueLifecycleVersion) {
  const db = await openQueueDb();
  try {
    return await queueRequestEntryOnDb(db, entry, lifecycleVersion);
  } finally {

    try { db.close(); } catch {   }
  }
}

function queueRequestEntryOnDb(db, entry, lifecycleVersion) {
  return new Promise((resolve, reject) => {

    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) {
      reject(Object.assign(new Error('Queue lifecycle changed before enqueue'), { code: 'QUEUE_LIFECYCLE_CHANGED' }));
      return;
    }
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE_NAME);
    const getAll = store.getAll();
    let rejected = false;
    getAll.onsuccess = () => {
      if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) {
        rejected = true;
        reject(Object.assign(new Error('Queue lifecycle changed before enqueue'), { code: 'QUEUE_LIFECYCLE_CHANGED' }));
        return;
      }
      const existing = Array.isArray(getAll.result) ? getAll.result : [];
      const incomingBytes = estimateQueueEntryBytes(entry);
      const existingBytes = existing.reduce((sum, row) => sum + estimateQueueEntryBytes(row), 0);
      if (existing.length >= MAX_QUEUE_ENTRIES || existingBytes + incomingBytes > MAX_QUEUE_TOTAL_BYTES) {
        rejected = true;
        reject(Object.assign(new Error('Offline queue storage limit reached'), {
          code: 'QUEUE_LIMIT_EXCEEDED',
          maxEntries: MAX_QUEUE_ENTRIES,
          maxBytes: MAX_QUEUE_TOTAL_BYTES,
        }));
        return;
      }
      try {
        store.add({ status: 'pending', ...entry });
      } catch (err) {
        rejected = true;
        reject(err);
      }
    };
    getAll.onerror = () => {
      rejected = true;
      reject(getAll.error || new Error('Unable to inspect offline queue capacity'));
    };
    tx.oncomplete = () => { if (!rejected) resolve(); };
    tx.onerror = () => { if (!rejected) reject(tx.error || new Error('Offline queue transaction failed')); };
    tx.onabort = () => { if (!rejected) reject(tx.error || new Error('Offline queue transaction aborted')); };
  });
}

async function getAllQueuedEntries() {
  const db = await openQueueDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
      const req = tx.objectStore(QUEUE_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error || new Error('queue read aborted'));
    });
  } finally {
    try { db.close(); } catch {   }
  }
}

async function getQueuedEntry(id) {
  const db = await openQueueDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
      const req = tx.objectStore(QUEUE_STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error || new Error('queue read aborted'));
    });
  } finally {
    try { db.close(); } catch {   }
  }
}

async function deleteQueuedEntry(id) {
  const db = await openQueueDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      tx.objectStore(QUEUE_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('queue delete failed'));

      tx.onabort = () => reject(tx.error || new Error('queue delete aborted'));
    });
  } finally {
    try { db.close(); } catch {   }
  }
}

async function markQueuedEntry(id, patch) {
  const db = await openQueueDb();
  try {
    return await markQueuedEntryOnDb(db, id, patch);
  } finally {
    try { db.close(); } catch {   }
  }
}

function markQueuedEntryOnDb(db, id, patch) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE_NAME);
    const getReq = store.get(id);
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    getReq.onsuccess = () => {
      const current = getReq.result;
      if (!current) {
        settle(resolve, null);
        return;
      }
      const updated = { ...current, ...patch };
      try {
        store.put(updated);
      } catch (putErr) {

        settle(reject, putErr);
        return;
      }
      tx.oncomplete = () => settle(resolve, updated);
    };
    getReq.onerror = () => settle(reject, getReq.error);

    tx.onabort = () => settle(reject, tx.error || new Error('queue tx aborted'));
    tx.onerror = () => settle(reject, tx.error || new Error('queue tx failed'));
  });
}

async function notifyClients(message) {
  const clientsList = await self.clients.matchAll();
  clientsList.forEach((client) => client.postMessage(message));
}

// يجدد التوكن؛ يعيد ok أو reason: auth | network | page-priority.
async function refreshAccessToken(sampleUrl) {

  try {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const visible = clients.filter((c) => c.visibilityState === 'visible');
    if (visible.length > 0) {

      visible.forEach((c) => c.postMessage({ type: 'SW_REQUEST_REFRESH' }));
      return { ok: false, reason: 'page-priority' };
    }
  } catch {   }
  let origin;
  try {
    const parsed = new URL(sampleUrl);

    origin = isTrustedApiOrigin(parsed) ? parsed.origin : self.location.origin;
  } catch {
    return null;
  }
  let response;
  try {
    response = await fetch(`${origin}${API_PATH_PREFIX}/auth/refresh`, {
      method: 'POST',

      credentials: 'include',
    });
  } catch (err) {
    console.warn('[SW] refreshAccessToken network failure:', err && err.message);
    return { ok: false, reason: 'network' };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'auth' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'network' };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'network' };
  }
  const accessToken = body?.data?.tokens?.accessToken;
  const csrfToken = body?.data?.csrfToken;
  if (typeof accessToken !== 'string' || !accessToken) {
    return { ok: false, reason: 'network' };
  }

  if (typeof csrfToken === 'string' && csrfToken) {
    void notifyClients({ type: 'SW_TOKEN_REFRESHED', csrfToken }).catch(() => {});
  }

  return { ok: true, accessToken, csrfToken: typeof csrfToken === 'string' ? csrfToken : null };
}

// إرسال عنصر واحد: sent | failed | still-offline | retryable-http | server-error.
async function replayOne(entry, hasRetriedAfterRefresh, freshCreds, refreshReason, lifecycleVersion = queueLifecycleVersion) {
  if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return 'still-offline';

  await markQueuedEntry(entry.id, { processing: true, processingStartedAt: Date.now() });
  try {

    if ((entry.needsCsrf || entry.needsAuth) && !freshCreds) {
      if (refreshReason === 'auth') {

        await notifyClients({
          type: 'QUEUE_NEEDS_RELOGIN',
          operationId: entry.operationId || null,
        });
      }
      return 'still-offline';
    }

    let sendHeaders = sanitizeQueueHeaders(entry.headers || {});

    if (typeof entry.operationId === 'string' && entry.operationId.trim()) {
      sendHeaders['x-offline-op-id'] = entry.operationId.trim().slice(0, 128);
    }
    if ((entry.needsCsrf || entry.needsAuth || isUnsafeMethod(entry.method)) && freshCreds) {
      sendHeaders = {
        ...sendHeaders,
        authorization: `Bearer ${freshCreds.accessToken}`,
        ...(freshCreds.csrfToken ? { 'x-csrf-token': freshCreds.csrfToken } : {}),
      };
    } else if (freshCreds && freshCreds.accessToken) {

      sendHeaders = {
        ...sendHeaders,
        authorization: `Bearer ${freshCreds.accessToken}`,
      };
    }
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return 'still-offline';

    if (!isTrustedQueueUrl(entry.url)) {
      const message = 'عنوان العملية غير مسموح به ولن تُرسل.';
      await markQueuedEntry(entry.id, { status: 'failed', lastError: { status: 400, message } });
      await notifyClients({ type: 'QUEUE_ITEM_FAILED', id: entry.id, url: entry.url, status: 400, message, operationId: entry.operationId || null });
      return 'failed';
    }

    const queuedOwner =
      entry.ownerUserId || decodeAccessTokenUserId(entry.headers?.authorization);
    const currentOwner = freshCreds ? decodeAccessTokenUserId(freshCreds.accessToken) : null;

    if (queuedOwner && !currentOwner) {
      if (refreshReason === 'auth') {
        await notifyClients({
          type: 'QUEUE_NEEDS_RELOGIN',
          operationId: entry.operationId || null,
          message: 'سجّل الدخول بالحساب الذي أنشأ العملية لمتابعة مزامنتها.',
        });
      }
      return 'still-offline';
    }

    if (isUnsafeMethod(entry.method) && currentOwner && !queuedOwner) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        needsRecovery: true,
        lastError: {
          status: 409,
          message: 'تعذّر التحقق من الحساب الذي أنشأ هذه العملية؛ لن تُرسل بجلسة حساب آخر.',
        },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: 409,
        message: 'تعذّر التحقق من الحساب الذي أنشأ هذه العملية؛ لن تُرسل بجلسة حساب آخر.',
        operationId: entry.operationId || null,
      });
      return 'failed';
    }
    if (entry.needsAuth && !queuedOwner) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        needsRecovery: true,
        lastError: {
          status: 409,
          message: 'عملية أوفلاين قديمة لا يمكن التحقق من الحساب الذي أنشأها. أعد تنفيذها من جديد.',
        },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: 409,
        message: 'عملية أوفلاين قديمة لا يمكن التحقق من الحساب الذي أنشأها. أعد تنفيذها من جديد.',
        operationId: entry.operationId || null,
      });
      return 'failed';
    }
    if (queuedOwner && currentOwner && queuedOwner !== currentOwner) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        lastError: {
          status: 403,
          message: 'هذه العملية مرتبطة بحساب آخر ولن تُرسل بهذا الحساب',
        },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: 403,
        message: 'هذه العملية مرتبطة بحساب آخر ولن تُرسل بهذا الحساب',
        operationId: entry.operationId || null,
      });
      return 'failed';
    }
    const replayController = new AbortController();
    activeReplayControllers.add(replayController);
    let response;
    try {
      response = await fetch(entry.url, {
        method: entry.method,
        headers: sendHeaders,
        body: entry.body ?? undefined,
        signal: replayController.signal,

        credentials: 'include',
      });
    } finally {
      activeReplayControllers.delete(replayController);
    }

    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return 'still-offline';

    if (response.ok) {
      await deleteQueuedEntry(entry.id);
      await notifyClients({
        type: 'QUEUE_ITEM_SENT',
        id: entry.id,
        url: entry.url,
        operationId: entry.operationId || null,
      });
      return 'sent';
    }

    let csrfRejected = false;
    if (response.status === 403) {
      try {
        const body403 = await response.clone().json();
        csrfRejected = /csrf/i.test(String(body403?.message ?? ''));
      } catch {
        csrfRejected = false;
      }
    }

    if ((response.status === 401 || csrfRejected) && !hasRetriedAfterRefresh) {
      const fresh = await refreshAccessToken(entry.url);
      if (fresh && fresh.ok) {

        const updatedEntry = await getQueuedEntry(entry.id);
        if (updatedEntry) {

          return replayOne(updatedEntry, true, fresh, 'ok', lifecycleVersion);
        }
      }

      if (!fresh || fresh.reason === 'network' || fresh.reason === 'page-priority') {
        return 'still-offline';
      }

    }

    if (csrfRejected) {
      return 'still-offline';
    }

    let message;
    try {
      const data = await response.clone().json();
      message = typeof data?.message === 'string' ? data.message : undefined;
    } catch {
      message = undefined;
    }

    const retryableHttp = [408, 425, 429, 502, 503, 504].includes(response.status);
    if (retryableHttp) {
      const retryAfterRaw = response.headers.get('retry-after');
      let retryAfterMs = 0;
      if (retryAfterRaw) {
        const seconds = Number(retryAfterRaw);
        if (Number.isFinite(seconds)) {
          retryAfterMs = Math.max(0, seconds * 1000);
        } else {
          const dateMs = Date.parse(retryAfterRaw);
          if (Number.isFinite(dateMs)) retryAfterMs = Math.max(0, dateMs - Date.now());
        }
      }
      await markQueuedEntry(entry.id, {
        lastError: { status: response.status, message },
        ...(retryAfterMs > 0 ? { retryNotBefore: Date.now() + Math.min(retryAfterMs, 15 * 60_000) } : {}),
      });
      return 'retryable-http';
    }

    if (response.status >= 400 && response.status < 500) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        lastError: { status: response.status, message },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: response.status,
        message,
        operationId: entry.operationId || null,
      });
      return 'failed';
    }

    return 'server-error';
  } catch {

    return 'still-offline';
  } finally {

    try { await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null }); } catch {}
  }
}

function inferQueuePriority(url, method) {
  const u = String(url || '').toLowerCase();
  const m = String(method || 'POST').toUpperCase();
  if (
    u.includes('/messages') ||
    u.includes('/conversations') ||
    u.includes('/auth/') ||
    u.includes('/payments') ||
    u.includes('/checkout')
  ) {
    return 'critical';
  }
  if (
    u.includes('/analytics') ||
    u.includes('/views') ||
    u.includes('/presence') ||
    u.includes('/heartbeat') ||
    m === 'GET' ||
    m === 'HEAD'
  ) {
    return 'low';
  }
  return 'normal';
}

function queuePriorityRank(p) {
  if (p === 'critical') return 0;
  if (p === 'normal') return 1;
  return 2;
}

function isBatchableAnalyticsUrl(url) {
  return String(url || '').includes('/analytics/events');
}

async function tryCoalesceAnalyticsEntry(entry) {
  if (!isBatchableAnalyticsUrl(entry.url) || entry.method !== 'POST') return false;
  if (!entry.body) return false;

  let newEvents;
  try {
    const text =
      typeof entry.body === 'string'
        ? entry.body
        : await new Response(entry.body).text();
    const parsed = JSON.parse(text);
    newEvents = Array.isArray(parsed?.events) ? parsed.events : Array.isArray(parsed) ? parsed : null;
    if (!newEvents || newEvents.length === 0) return false;
  } catch {
    return false;
  }

  const all = await getAllQueuedEntries();
  const existing = all.find(
    (e) =>
      e.status !== 'failed' && e.status !== 'cancelled' &&
      e.method === 'POST' &&
      isBatchableAnalyticsUrl(e.url),
  );
  if (!existing) return false;

  try {
    const oldText =
      typeof existing.body === 'string'
        ? existing.body
        : existing.body
          ? await new Response(existing.body).text()
          : '{}';
    const oldParsed = JSON.parse(oldText || '{}');
    const oldEvents = Array.isArray(oldParsed?.events)
      ? oldParsed.events
      : Array.isArray(oldParsed)
        ? oldParsed
        : [];

    const MAX_ANALYTICS_EVENTS = 20;
    if (oldEvents.length + newEvents.length > MAX_ANALYTICS_EVENTS) {
      return false;
    }
    const merged = [...oldEvents, ...newEvents];
    const newBody = JSON.stringify(
      oldParsed && !Array.isArray(oldParsed) && typeof oldParsed === 'object'
        ? { ...oldParsed, events: merged }
        : { events: merged },
    );
    await markQueuedEntry(existing.id, {
      body: newBody,
      queuedAt: existing.queuedAt,

      priority: existing.priority || 'low',
    });
    return true;
  } catch {
    return false;
  }
}

function isOrderSensitiveQueueEntry(entry) {
  const u = String(entry.url || '');
  return (
    u.includes('/messages') ||
    u.includes('/conversations') ||
    u.includes('/chat')
  );
}

let replayQueueInFlight = false;
let queueClearInFlight = false;
let queueClearDepth = 0;

let queueLifecycleVersion = 0;
const activeReplayControllers = new Set();

const QUEUE_PROCESSING_LEASE_MS = 2 * 60_000;
function hasActiveProcessingLease(entry, now = Date.now()) {
  if (!entry?.processing) return false;
  const startedAt = entry.processingStartedAt;
  return Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < QUEUE_PROCESSING_LEASE_MS;
}

async function replayQueue() {
  if (queueClearInFlight || replayQueueInFlight) return;
  replayQueueInFlight = true;
  const lifecycleVersion = queueLifecycleVersion;
  const startedAt = Date.now();
  try {

    try {
      await notifyClients({ type: 'QUEUE_DRAIN_STARTED', startedAt });
    } catch (notifyError) {
      console.warn('[SW] Unable to notify queue drain start:', notifyError);
    }
    const result = await replayQueueImpl(lifecycleVersion);
    try {
      await notifyClients({
        type: 'QUEUE_DRAIN_FINISHED',
        startedAt,
        durationMs: Date.now() - startedAt,
        processed: result?.processed ?? 0,
        sent: result?.sent ?? 0,
        failed: result?.failed ?? 0,
        stillOffline: Boolean(result?.stillOffline),
      });
    } catch (notifyError) {
      console.warn('[SW] Unable to notify queue drain completion:', notifyError);
    }
  } catch (drainError) {

    console.warn('[SW] Queue drain failed; a later sync may retry:', drainError);
    try {
      await notifyClients({ type: 'QUEUE_DRAIN_FAILED', message: 'تعذر إكمال المزامنة؛ ستتم المحاولة لاحقًا.' });
    } catch {   }
  } finally {
    replayQueueInFlight = false;
  }
}

// ترتيب بالأولوية، حد لكل دورة، تراجع تصاعدي، وبقاء ترتيب الرسائل.
async function replayQueueImpl(lifecycleVersion = queueLifecycleVersion) {
  const metrics = { processed: 0, sent: 0, failed: 0, stillOffline: false };

  if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return metrics;

  let entries;
  try {
    entries = await getAllQueuedEntries();
  } catch {
    return metrics;
  }

  if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return metrics;

  let freshCreds = null;

  let refreshReason = null;
  const anyNeedsCsrf = entries.some(
    (e) =>
      e.status !== 'failed' && e.status !== 'cancelled' &&
      (e.needsCsrf || e.needsAuth || isUnsafeMethod(e.method)),
  );
  if (anyNeedsCsrf && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    const r = await refreshAccessToken(entries[0].url);
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return metrics;
    if (r && r.ok) {
      freshCreds = r;
    } else {
      refreshReason = r?.reason ?? 'network';
    }
  }

  const trulyOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  entries = entries.slice().sort((a, b) => {
    const ra = queuePriorityRank(a.priority || inferQueuePriority(a.url, a.method));
    const rb = queuePriorityRank(b.priority || inferQueuePriority(b.url, b.method));
    if (ra !== rb) return ra - rb;
    return (a.queuedAt || 0) - (b.queuedAt || 0);
  });

  const maxDrainEntries = Math.max(4, Math.min(12, queueConcurrencyHint * 4));
  let processedEntries = 0;

  for (const entry of entries) {
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) break;
    if (processedEntries >= maxDrainEntries) break;
    if (entry.status === 'failed' || entry.status === 'cancelled') continue;

    if (hasActiveProcessingLease(entry)) continue;
    if (entry.processing) {
      await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null });
      entry.processing = false;
      entry.processingStartedAt = null;
    }

    const now = Date.now();
    const lastAttemptAt =
      typeof entry.lastAttemptAt === 'number' ? entry.lastAttemptAt : 0;
    const retries = typeof entry.retryCount === 'number' ? entry.retryCount : 0;
    const minGap = Math.min(
      queueRetryMinGapMs * Math.pow(2, Math.max(0, retries - 1)),
      5 * 60_000,
    );
    const tooSoon = lastAttemptAt > 0 && now - lastAttemptAt < minGap;
    const retryNotBefore = typeof entry.retryNotBefore === 'number' ? entry.retryNotBefore : 0;
    const retryAfterGate = retryNotBefore > now;
    const orderSensitive = isOrderSensitiveQueueEntry(entry);

    if (tooSoon || retryAfterGate) {
      if (orderSensitive || trulyOffline) break;
      continue;
    }

    processedEntries += 1;
    metrics.processed += 1;
    const result = await replayOne(entry, false, freshCreds, refreshReason, lifecycleVersion);

    if (result === 'sent' || result === 'failed') {
      if (result === 'sent') metrics.sent += 1;
      else metrics.failed += 1;
      continue;
    }

    const entryOwner =
      entry.ownerUserId || decodeAccessTokenUserId(entry.headers?.authorization);
    const sessionIdentityUnverified =
      Boolean(entryOwner) && (!freshCreds || !decodeAccessTokenUserId(freshCreds.accessToken));
    const deferRetryCount =
      result === 'still-offline' &&
      (refreshReason === 'page-priority' ||
        refreshReason === 'network' ||
        sessionIdentityUnverified ||
        ((entry.needsCsrf || entry.needsAuth) && !freshCreds));

    if (deferRetryCount) {
      await markQueuedEntry(entry.id, {
        lastAttemptAt: now,
        lastSoftError: result,
        processing: false,
      });
      if (trulyOffline) { metrics.stillOffline = true; break; }
      if (orderSensitive) break;
      continue;
    }

    const nextRetries = retries + 1;
    const isServer = result === 'server-error' || result === 'retryable-http';
    const limit = isServer ? MAX_QUEUE_SERVER_RETRIES : MAX_QUEUE_RETRIES;

    if (nextRetries >= limit) {
      metrics.failed += 1;
      await markQueuedEntry(entry.id, {
        status: 'failed',
        retryCount: nextRetries,
        lastAttemptAt: now,
        lastError: {
          status: isServer ? (entry.lastError?.status ?? 500) : 0,
          message: isServer
            ? 'فشل الطلب بعد عدة محاولات — أعد المحاولة يدويًا أو احذف العملية'
            : 'تعذّر الإرسال بعد عدة محاولات — أعد المحاولة يدويًا أو احذف الطلب',
        },
        retryNotBefore: 0,
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: isServer ? 500 : 0,
        message: isServer
          ? 'فشل السيرفر بعد عدة محاولات'
          : 'تعذّر الإرسال بعد عدة محاولات',
        operationId: entry.operationId || null,
      });
      continue;
    }

    await markQueuedEntry(entry.id, {
      retryCount: nextRetries,
      lastAttemptAt: now,
      lastSoftError: result,

      ...(result === 'retryable-http' ? {} : { retryNotBefore: 0 }),
    });

    if (trulyOffline) {
      metrics.stillOffline = true;
      break;
    }

    if (orderSensitive) {
      break;
    }

  }

  await notifyClients({ type: 'QUEUE_REPLAYED' });
  return metrics;
}

function isAnalyticsBeacon(url) {
  return url.pathname === '/api/v1/analytics/events';
}

// قائمة بيضاء لعمليات الكتابة التي يجوز تأجيلها.
function isOfflineMutationQueueAllowed(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = String(request.method || 'POST').toUpperCase();
    if (!path.startsWith('/api/v1/')) return false;
    if (/\/(auth|payments|checkout|appointments)(?:\/|$)/i.test(path)) return false;
    if (/\/(analytics|presence|heartbeat|csrf)(?:\/|$)/i.test(path)) return false;

    if (/\/favorites(?:\/|$)/i.test(path)) return false;
    const opId = request.headers.get('x-offline-op-id');
    if (/\/(messages|conversations)\/[^/]+\/messages(?:\/(?:image|file|audio))?$/i.test(path)) return Boolean(opId);
    if (/\/sales$/i.test(path)) return method === 'POST' && Boolean(opId);

    if (/\/(ads|products|service-listings|requests|service-requests)$/i.test(path)) {
      return method === 'POST' && Boolean(opId);
    }
    return false;
  } catch { return false; }
}

// أونلاين: تمرير مباشر. فشل الشبكة: حفظ في الطابور والرد 202.
async function handleMutation(request) {

  if (!isOfflineMutationQueueAllowed(request)) return fetch(request);

  const enqueueLifecycleVersion = queueLifecycleVersion;

  try {
    const beaconUrl = new URL(request.url);
    if (isAnalyticsBeacon(beaconUrl)) {
      try {
        return await fetch(request);
      } catch {
        return Response.error();
      }
    }
  } catch {

  }

  try {
    const presenceUrl = new URL(request.url);
    if (presenceUrl.pathname.endsWith('/users/me/presence')) {

      return fetch(request);
    }
  } catch {

  }

  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  const requestForQueue = request.clone();
  try {
    return await fetch(request);
  } catch {

    let body = null;
    try {
      const blob = await requestForQueue.blob();
      body = blob.size > 0 ? blob : null;
    } catch (blobErr) {
      console.warn('[SW] queue body read failed:', blobErr && blobErr.message);
      body = null;
    }

    if (body && body.size > MAX_QUEUE_BODY_BYTES) {
      console.warn('[SW] body too large for offline queue:', body.size);
      return new Response(
        JSON.stringify({
          queued: false,
          code: 'QUEUE_BODY_TOO_LARGE',
          message:
            'حجم المرفقات كبير للأوفلاين — حُفظت مسودة محلية وستُرفع عند عودة الاتصال.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const headers = {};
    let ownerUserId = null;

    let needsCsrf = false;

    let needsAuth = false;
    requestForQueue.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'x-csrf-token') {
        needsCsrf = true;
        return;
      }
      if (lower === 'authorization') {
        needsAuth = true;
        ownerUserId = decodeAccessTokenUserId(value);
        return;
      }

      if (QUEUE_STRIP_HEADERS.has(lower)) return;
      headers[key] = value;
    });

    const operationId = String(
      headers['x-offline-op-id'] || headers['X-Offline-Op-Id'] || createOfflineOperationId(),
    ).trim().slice(0, 128);

    headers['x-offline-op-id'] = operationId;

    try {
      const priority = inferQueuePriority(requestForQueue.url, requestForQueue.method);
      if (queueClearInFlight || enqueueLifecycleVersion !== queueLifecycleVersion) {
        return new Response(
          JSON.stringify({
            queued: false,
            code: 'QUEUE_SESSION_CHANGED',
            message: 'تغيّرت الجلسة أثناء حفظ العملية؛ لم تُحفظ لإعادة الإرسال بحساب آخر.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const entry = {
        url: requestForQueue.url,
        method: requestForQueue.method,
        headers,
        body,
        queuedAt: Date.now(),
        operationId,
        priority,
        needsCsrf,
        needsAuth,
        ownerUserId,
        retryCount: 0,
      };

      const coalesced = await tryCoalesceAnalyticsEntry(entry);
      if (!coalesced) {
        await queueRequestEntry(entry, enqueueLifecycleVersion);
      }
    } catch (storeErr) {

      const lifecycleChanged =
        storeErr?.code === 'QUEUE_LIFECYCLE_CHANGED' ||
        queueClearInFlight || enqueueLifecycleVersion !== queueLifecycleVersion;
      console.warn('[SW] queueRequestEntry failed:', storeErr && storeErr.message);
      return new Response(
        JSON.stringify({
          queued: false,
          code: lifecycleChanged ? 'QUEUE_SESSION_CHANGED' : storeErr?.code === 'QUEUE_LIMIT_EXCEEDED' ? 'QUEUE_LIMIT_EXCEEDED' : 'QUEUE_STORE_FAILED',
          message: lifecycleChanged
            ? 'تغيّرت الجلسة أثناء حفظ العملية؛ لم تُحفظ لإعادة الإرسال بحساب آخر.'
            : storeErr?.code === 'QUEUE_LIMIT_EXCEEDED'
              ? 'وصل طابور الأوفلاين إلى حد التخزين الآمن. أرسل العمليات المعلّقة أو احذف العناصر الفاشلة قبل إضافة عمليات جديدة.'
              : 'تعذّر حفظ العملية في طابور الأوفلاين — حُفظت مسودة محلية إن أمكن وستُرفع عند عودة الاتصال.',
        }),
        { status: lifecycleChanged ? 409 : 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (self.registration && self.registration.sync) {
      try {
        await self.registration.sync.register(SYNC_TAG);
      } catch {

      }
    }

    return new Response(
      JSON.stringify({
        queued: true,
        message: isOffline
          ? 'لا يوجد اتصال — سيُعاد إرسال العملية تلقائيًا عند عودة الاتصال.'
          : 'تعذّر إرسال الطلب — سيُعاد المحاولة تلقائيًا.',
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// تخزين /offline وملفاتها مسبقًا.
self.addEventListener('install', (event) => {

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        const response = await fetch(OFFLINE_URL, { credentials: 'same-origin' });

        if (!response.ok || !isSameOriginResponse(response)) return;
        await cache.put(OFFLINE_URL, response.clone());

        const html = await response.clone().text();
        const assetUrls = Array.from(
          html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+\.(?:js|css))(?:\?[^"']*)?["']/g),
        )
          .map((match) => match[1])
          .filter((url) => Boolean(url));

        await Promise.allSettled(
          assetUrls.map(async (assetUrl) => {
            try {
              const assetResponse = await fetch(assetUrl, { credentials: 'same-origin' });
              const assetType = (assetResponse.headers.get('content-type') || '').toLowerCase();

              if (assetResponse.ok && isSameOriginResponse(assetResponse) && !assetType.includes('text/html')) {
                await cache.put(assetUrl, assetResponse.clone());
              }
            } catch {

            }
          }),
        );
      } catch {

      }
    })(),
  );

});

// حذف كاشات market-* القديمة بعد ترحيل البيانات.
self.addEventListener('activate', (event) => {
  const currentCaches = [
    STATIC_CACHE,
    IMAGE_CACHE,
    API_CACHE,
    CORE_CACHE,
    SAVED_ADS_CACHE,
    PERSONAL_SHELL_CACHE,

    'market-auto-read-ads',
    SW_META_CACHE,
  ];
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await migrateDataCaches(cacheNames);
      await Promise.all(
        cacheNames
          .filter((name) =>
            name.startsWith('market-') &&
            !currentCaches.includes(name) &&
            !name.startsWith(USER_DATA_CACHE_PREFIX),
          )
          .map((name) => caches.delete(name)),
      );

      try {
        const staticCache = await caches.open(STATIC_CACHE);
        const keys = await staticCache.keys();
        const authPathPrefixes = ['/login', '/register', '/forgot-password', '/reset-password'];
        await Promise.all(
          keys
            .filter((req) => {
              try {
                const p = new URL(req.url).pathname;
                return authPathPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
              } catch {
                return false;
              }
            })
            .map((req) => staticCache.delete(req)),
        );
      } catch {

      }

      await Promise.all([
        normalizeExistingHtmlCache(STATIC_CACHE),
        normalizeExistingHtmlCache(PERSONAL_SHELL_CACHE),
      ]);
      await self.clients.claim();
    })(),
  );
});

// أوامر من الصفحة: تحديث، مسح كاش، طابور.
self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;

  if (type === 'GET_SW_STATUS') {
    const status = {
      type: 'SW_STATUS',
      cacheVersion: CACHE_VERSION,
      state: self.registration?.active ? 'active' : 'running',
      timestamp: Date.now(),
    };

    const replyPort = event.ports && event.ports[0];
    if (replyPort) replyPort.postMessage(status);
    else if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(status);
    }
    return;
  }

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'INVALIDATE_API_CACHE') {
    const prefixes = Array.isArray(event.data?.prefixes)
      ? event.data.prefixes.filter((value) => typeof value === 'string' && value.startsWith('/'))
      : [];
    const domains = Array.isArray(event.data?.domains)
      ? event.data.domains.filter((value) => typeof value === 'string')
      : [];

    if (prefixes.length === 0 && domains.length === 0) return;

    const contractPrefixes = domains.length && self.MARKET_CACHE_CONTRACT?.invalidation
      ? self.MARKET_CACHE_CONTRACT.invalidation
          .filter((rule) => Array.isArray(rule.domains) && rule.domains.some((domain) => domains.includes(domain)))
          .flatMap((rule) => Array.isArray(rule.prefixes) ? rule.prefixes : [])
      : [];
    const effectivePrefixes = [...new Set([...prefixes, ...contractPrefixes])];

    const matchesPrefix = (request) => {
      try {
        const pathname = new URL(request.url).pathname;
        return effectivePrefixes.some((prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
        );
      } catch {
        return false;
      }
    };

    event.waitUntil((async () => {
      const cacheNames = await caches.keys();
      const targetNames = cacheNames.filter((name) =>
        name === API_CACHE ||
        name.startsWith(USER_DATA_CACHE_PREFIX),
      );
      await Promise.all(targetNames.map(async (name) => {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        await Promise.all(keys.filter(matchesPrefix).map((request) => cache.delete(request)));
      }));
    })());
    return;
  }

  if (type === 'TRIM_DISPOSABLE_CACHES') {

    event.waitUntil((async () => {
      const ratio = await storagePressureRatio();
      const factor = ratio != null && ratio >= 0.95 ? 0.25 : 0.5;
      await Promise.all([
        trimCache(API_CACHE, Math.max(10, Math.floor(MAX_API_ENTRIES * factor))),
        trimCache(IMAGE_CACHE, Math.max(10, Math.floor(MAX_IMAGE_ENTRIES * factor))),
      ]);

      try { await caches.delete('market-auto-read-ads'); } catch (_) {}
    })());
    return;
  }

  if (type === 'CLEAR_API_CACHE') {

    event.waitUntil(Promise.all([
      caches.delete(API_CACHE),
      caches.delete(PERSONAL_SHELL_CACHE),
      caches.keys().then((names) =>
        Promise.all(names.filter((name) => name.startsWith(USER_DATA_CACHE_PREFIX)).map((name) => caches.delete(name))),
      ),
      forgetLastUserId(),
    ]));
    return;
  }

  if (type === 'NETWORK_POLICY_UPDATE') {
    const tier = String(event.data?.tier || 'unknown');
    const allowed = new Set(['offline', 'very-slow', 'slow', 'normal', 'fast', 'unknown']);
    if (allowed.has(tier)) {
      const gaps = {
        offline: 60_000,
        'very-slow': 60_000,
        slow: 45_000,
        normal: 30_000,
        fast: 15_000,
        unknown: 30_000,
      };
      queueRetryMinGapMs = gaps[tier] || QUEUE_RETRY_MIN_GAP_MS;
      const requestedConcurrency = Number(event.data?.queueConcurrency);
      queueConcurrencyHint = Number.isFinite(requestedConcurrency)
        ? Math.max(1, Math.min(3, Math.floor(requestedConcurrency)))
        : 1;
    }
    return;
  }

  if (type === 'REPLAY_QUEUE_NOW') {
    event.waitUntil(replayQueue());
  }

  if (type === 'CLEAR_QUEUE') {
    event.waitUntil(
      (async () => {

        queueClearDepth += 1;
        queueLifecycleVersion += 1;
        queueClearInFlight = true;

        activeReplayControllers.forEach((controller) => {
          try { controller.abort(); } catch {}
        });
        try {
          const all = await getAllQueuedEntries();
          for (const entry of all) {
            await deleteQueuedEntry(entry.id);
          }
          await notifyClients({ type: 'QUEUE_CLEARED' });
        } catch (err) {
          console.warn('[SW] CLEAR_QUEUE failed:', err);
          await notifyClients({ type: 'QUEUE_CLEAR_FAILED' });
        } finally {

          queueClearDepth = Math.max(0, queueClearDepth - 1);
          if (queueClearDepth === 0) queueClearInFlight = false;
        }
      })(),
    );
  }

  if (type === 'RETRY_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {
        const entry = await getQueuedEntry(event.data.id);
        if (!entry) return;
        if (!entry.ownerUserId || event.data.ownerUserId !== entry.ownerUserId) return;

        if (hasActiveProcessingLease(entry)) return;
        if (entry.processing) {

          await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null });
          entry.processing = false;
          entry.processingStartedAt = null;
        }

        const canRetry = entry.status === 'failed' || entry.status === 'cancelled';
        if (canRetry) {
          await markQueuedEntry(entry.id, { status: 'pending', retryCount: 0, lastAttemptAt: 0, retryNotBefore: 0, lastSoftError: undefined, lastError: undefined });

          await notifyClients({ type: 'QUEUE_REPLAYED', id: entry.id });
        }

        if (replayQueueInFlight) {

          await notifyClients({ type: 'QUEUE_REPLAYED' });
          return;
        }

        try {
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          clients
            .filter((c) => c.visibilityState === 'visible')
            .forEach((c) => c.postMessage({ type: 'SW_REQUEST_REFRESH' }));
        } catch {   }

        await new Promise((r) => setTimeout(r, 400));
        await replayQueue();
        await notifyClients({ type: 'QUEUE_REPLAYED' });
      })(),
    );
  }

  if (type === 'CANCEL_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {
        const entry = await getQueuedEntry(event.data.id);
        if (!entry || !entry.ownerUserId || event.data.ownerUserId !== entry.ownerUserId) return;

        if (hasActiveProcessingLease(entry)) {
          await notifyClients({
            type: 'QUEUE_CANCEL_REJECTED',
            id: event.data.id,
            reason: 'processing',
          });
          return;
        }
        if (entry.processing) {

          await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null });
        }
        await markQueuedEntry(event.data.id, { status: 'cancelled' });
        await notifyClients({
          type: 'QUEUE_ITEM_CANCELLED',
          id: event.data.id,
          operationId: entry.operationId || null,
        });
      })(),
    );
  }

  if (type === 'RETRY_QUEUE_OPERATION' && typeof event.data.operationId === 'string') {
    event.waitUntil(
      (async () => {
        const all = await getAllQueuedEntries();
        const ownerUserId = typeof event.data.ownerUserId === 'string' ? event.data.ownerUserId : null;
        const matches = all.filter((entry) => entry.operationId === event.data.operationId && entry.ownerUserId && ownerUserId === entry.ownerUserId);
        for (const entry of matches) {
          await markQueuedEntry(entry.id, { status: 'pending', lastError: undefined });
        }
        event.ports?.[0]?.postMessage({ found: matches.length > 0 });
        if (matches.length > 0) {
          await replayQueue();
          await notifyClients({ type: 'QUEUE_REPLAYED' });
        }
      })(),
    );
  }

  if (type === 'CANCEL_QUEUE_OPERATION' && typeof event.data.operationId === 'string') {
    event.waitUntil(
      (async () => {
        const all = await getAllQueuedEntries();
        const ownerUserId = typeof event.data.ownerUserId === 'string' ? event.data.ownerUserId : null;
        const matches = all.filter((entry) => entry.operationId === event.data.operationId && entry.ownerUserId && ownerUserId === entry.ownerUserId);
        for (const entry of matches) {
          await markQueuedEntry(entry.id, { status: 'cancelled' });
          await notifyClients({ type: 'QUEUE_ITEM_CANCELLED', id: entry.id, operationId: entry.operationId || null });
        }
        event.ports?.[0]?.postMessage({ found: matches.length > 0 });
      })(),
    );
  }

  if (type === 'DISCARD_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {

        const entry = await getQueuedEntry(event.data.id);
        if (!entry || !entry.ownerUserId || event.data.ownerUserId !== entry.ownerUserId) return;
        await deleteQueuedEntry(event.data.id);
        await notifyClients({
          type: 'QUEUE_ITEM_DISCARDED',
          id: event.data.id,
          operationId: entry?.operationId || null,
        });
      })(),
    );
  }

  if (type === 'DISCARD_QUEUE_ITEM_BY_OP_ID' && typeof event.data.operationId === 'string') {
    event.waitUntil(
      (async () => {
        try {
          const opId = event.data.operationId;
          const ownerUserId = typeof event.data.ownerUserId === 'string' ? event.data.ownerUserId : null;
          if (!ownerUserId) return;
          const all = await getAllQueuedEntries();
          const matches = all.filter((e) => e.operationId === opId && e.ownerUserId === ownerUserId);
          for (const m of matches) {
            await deleteQueuedEntry(m.id);
            await notifyClients({
              type: 'QUEUE_ITEM_DISCARDED',
              id: m.id,
              operationId: opId,
            });
          }
        } catch (err) {

          console.warn('[SW] DISCARD_QUEUE_ITEM_BY_OP_ID failed:', err);
        }
      })(),
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

function pushActionsFor(data) {
  const tag = typeof data.tag === 'string' ? data.tag : '';
  const type = typeof data.type === 'string' ? data.type : '';
  const dismiss = { action: 'dismiss', title: 'تجاهل' };
  if (type === 'NEW_MESSAGE' || tag.startsWith('conversation-')) {
    return [{ action: 'open', title: 'الرد على الرسالة' }, dismiss];
  }
  if (type === 'NEW_REQUEST_OFFER' || type === 'REQUEST_OFFER_ACCEPTED') {
    return [{ action: 'open', title: 'عرض التفاصيل' }, dismiss];
  }
  if (type === 'FAV_AD_SOLD' || type === 'FAV_AD_PRICE_CHANGED') {
    return [{ action: 'open', title: 'عرض الإعلان' }, dismiss];
  }
  if (type === 'TEST') {
    return [dismiss];
  }
  return [{ action: 'open', title: 'عرض التفاصيل' }, dismiss];
}

// الحمولة: { title, body, url?, tag?, image?, urgent?, type? }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};

  const title = (typeof data.title === 'string' && data.title.trim() ? data.title : 'سوق غزة').slice(0, 120);
  const targetUrl = safeSameOriginUrl(data.url);
  const pushTag = typeof data.tag === 'string' && data.tag ? data.tag.slice(0, 100) : undefined;
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 400) : '',
    tag: pushTag,
    renotify: Boolean(pushTag),
    timestamp: Date.now(),
    data: { url: targetUrl, type: typeof data.type === 'string' ? data.type : 'GENERAL' },
    icon: '/icon-192',
    badge: '/icon-192',

    vibrate: data.urgent ? [120, 60, 120] : [80],

    requireInteraction: data.urgent === true,

    dir: 'rtl',
    lang: 'ar',

    ...(typeof data.image === 'string' && data.image.startsWith('https://')
      ? { image: data.image }
      : {}),
    actions: pushActionsFor(data),
  };

  event.waitUntil(
    (async () => {
      try {
        if (typeof data.tag === 'string' && data.tag.startsWith('conversation-')) {
          const targetPath = new URL(targetUrl, self.location.origin).pathname;
          const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          const viewing = windows.some((c) => {
            try {
              return (
                c.visibilityState === 'visible' &&
                c.focused === true &&
                new URL(c.url).pathname === targetPath
              );
            } catch {
              return false;
            }
          });
          if (viewing) return;
        }
      } catch {

      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();
  if (action === 'dismiss') return;

  const rawUrl = safeSameOriginUrl(event.notification.data && event.notification.data.url);

  const targetPath = (() => {
    try {
      return new URL(rawUrl, self.location.origin).pathname;
    } catch {
      return '/';
    }
  })();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {

      let sameOriginFallback = null;
      for (const client of clientsList) {
        try {
          const parsed = new URL(client.url);
          if (parsed.origin !== self.location.origin) continue;
          if (parsed.pathname === targetPath && 'focus' in client) {
            return client.focus();
          }
          if (!sameOriginFallback) sameOriginFallback = client;
        } catch {

        }
      }
      if (sameOriginFallback && 'focus' in sameOriginFallback) {
        if ('navigate' in sameOriginFallback) {

          return Promise.resolve(sameOriginFallback.navigate(rawUrl))
            .then((c) => (c && 'focus' in c ? c.focus() : sameOriginFallback.focus()))
            .catch(() => (self.clients.openWindow ? self.clients.openWindow(rawUrl) : undefined));
        }
        return sameOriginFallback.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(rawUrl);
      return undefined;
    }),
  );
});

// الموجِّه الرئيسي للطلبات.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isReadBatchRequest(url, request)) return;

  if (
    url.origin !== self.location.origin &&
    !(isApiRequest(url) && isTrustedApiOrigin(url)) &&
    !isImageRequest(request, url)
  ) {
    return;
  }

  if (request.headers.has('range')) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (request.method !== 'GET' && request.method !== 'OPTIONS') {
    if (isApiRequest(url) && isTrustedApiOrigin(url) && !isNeverCache(url)) {
      event.respondWith(handleMutation(request));
    }
    return;
  }

  if (isNeverCache(url)) {
    return;
  }

  if (isAuthPage(url)) {
    return;
  }

  if (isImageRequest(request, url)) {

    event.respondWith(cacheFirstImage(event, request, url));
    return;
  }

  if (isApiRequest(url) && isTrustedApiOrigin(url)) {
    event.respondWith(networkFirstApi(event, request, url));
    return;
  }

  if (request.mode === 'navigate' || isRscShellRequest(request)) {
    event.respondWith(handlePageRequest(event, request, url));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, request, request));
});
