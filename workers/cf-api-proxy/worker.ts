import type {
  BackendServer,
  CacheStoreOptions,
  CanonicalUrl,
  CloudflareRequest,
  DurableObjectStateLike,
  DurableObjectStubLike,
  Env,
  ExecutionContextLike,
  FrontendServer,
  GatewayFailureState,
  GatewayHealthSnapshot,
  GatewayHealthState,
  GatewayAdaptivePolicy,
  GatewayKind,
  GatewayRegistry,
  GatewayRegistryLoad,
  GoWorkerServer,
  GatewayRouteResult,
  GatewayServer,
  GatewayTarget,
  HealthRecordDetails,
  HealthSource,
  HealthSnapshotCacheEntry,
  ProcessUpstreamArgs,
  ProbeResult,
  ReferenceCacheMetadata,
  ReferenceCacheRead,
  RegistryCacheEntry,
  RegistrySource,
  RevalidateArgs,
  OriginLoadArgs,
  ResponseDescriptor,
  UpstreamResult,
} from './src/types';

type UnknownRecord = Record<string, unknown>;

declare global {
  interface CacheStorage { readonly default: Cache; }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGatewayHealthState(value: unknown): value is GatewayHealthState {
  if (!isRecord(value) || typeof value.failures !== 'number' || !Number.isFinite(value.failures) || value.failures < 0 ||
      typeof value.openUntil !== 'number' || !Number.isFinite(value.openUntil)) return false;
  if (value.quarantined !== undefined && typeof value.quarantined !== 'boolean') return false;
  if (value.healthy !== undefined && typeof value.healthy !== 'boolean') return false;
  if (value.status !== undefined && value.status !== null && (typeof value.status !== 'number' || !Number.isInteger(value.status) || value.status < 100 || value.status > 599)) return false;
  if (value.durationMs !== undefined && value.durationMs !== null && (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0)) return false;
  if (value.checkedAt !== undefined && value.checkedAt !== null && typeof value.checkedAt !== 'string') return false;
  if (value.source !== undefined && value.source !== 'traffic' && value.source !== 'probe') return false;
  if (value.updatedAt !== undefined && (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt))) return false;
  if (value.ewmaDurationMs !== undefined && value.ewmaDurationMs !== null && (typeof value.ewmaDurationMs !== 'number' || !Number.isFinite(value.ewmaDurationMs) || value.ewmaDurationMs < 0)) return false;
  if (value.errorRate !== undefined && (typeof value.errorRate !== 'number' || !Number.isFinite(value.errorRate) || value.errorRate < 0 || value.errorRate > 1)) return false;
  if (value.activeRequests !== undefined && value.activeRequests !== null && (!Number.isInteger(value.activeRequests) || Number(value.activeRequests) < 0 || Number(value.activeRequests) > 100000)) return false;
  if (value.ewmaActiveRequests !== undefined && value.ewmaActiveRequests !== null && (typeof value.ewmaActiveRequests !== 'number' || !Number.isFinite(value.ewmaActiveRequests) || value.ewmaActiveRequests < 0 || value.ewmaActiveRequests > 100000)) return false;
  if (value.sampleCount !== undefined && (!Number.isInteger(value.sampleCount) || Number(value.sampleCount) < 0)) return false;
  return true;
}

function parseGatewayHealthStates(value: unknown): Record<string, GatewayHealthState> {
  if (!isRecord(value)) return {};
  const states: Record<string, GatewayHealthState> = {};
  for (const [key, state] of Object.entries(value)) {
    if (key.length <= 256 && isGatewayHealthState(state)) states[key] = state;
  }
  return states;
}

/**
 * MarketPlat Smart Cache & Gateway Worker v8
 *
 * New in v4 (edge-cache round 2):
 * - #7  Cache-key normalization: params sorted, encoding unified (NFC + RFC3986),
 *       tracking params dropped, trailing slashes / %XX paths canonicalised, and the
 *       key host pinned to a stable origin namespace so cache entries survive
 *       backend-pool changes without creating one cache partition per server.
 * - #12 Full stale-while-revalidate on the edge: an entry past s-maxage but inside
 *       the SWR window is served immediately and refreshed in the background
 *       (single-flight, ETag-aware). Stale-on-error still applies on top.
 * - #9  Negative caching: 404s of detail-like paths are cached for 60s.
 * - #10 D1-backed reference tier (binding DB), with REFERENCE_KV as a
 *       compatibility fallback: tagged rows, bounded query keys, and SWR refresh.
 * - #8  Cache-Tag header on every stored response + POST /__purge__ for native
 *       Workers Cache tag invalidation; empty-body POST keeps legacy KV flush support.
 * - #13 Native Workers Cache is enabled before fetch() on workers.dev; inner Cache API
 *       remains an additional per-colo tier, and cacheable responses vary by Host and Origin.
 * - Fix: single-flight shared a Response whose body was already consumed.
 *
 * Keeps v4 cache behavior and adds independent Backend, Frontend, and Go service
 * pools with weighted routing, passive circuit breaking, and safe GET/HEAD failover.
 * Go services are selected by longest internal path prefix and can have multiple
 * replicas. A SQLite-backed Durable Object coordinates health across isolates;
 * each isolate caches that snapshot briefly and keeps a local fallback. Cache warm-up is limited to fixed public routes; health probing remains manual.
 */

const DEFAULT_RENDER_ORIGIN = 'https://marketplat-nz19.onrender.com';

function getRenderOrigin(env: Env): string {
  const raw = String((env && env.RENDER_ORIGIN) || DEFAULT_RENDER_ORIGIN).trim();
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('RENDER_ORIGIN must be a valid HTTPS origin'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('RENDER_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment');
  }
  return parsed.origin;
}

async function safeCacheMatch(cache: Cache, key: Request | string): Promise<Response | undefined> {
  try { return await cache.match(key); } catch { return undefined; }
}

async function safeCachePut(cache: Cache, key: Request | string, response: Response): Promise<boolean> {
  try { await cache.put(key, response); return true; } catch { return false; }
}

const FORCE_CACHE_PREFIXES = [
  '/api/v1/categories',
  '/api/v1/ads',
  '/api/v1/products',
  '/api/v1/stores',
  '/api/v1/service-categories',
  '/api/v1/sellers',
  '/api/v1/home'
];

const CACHEABLE_PREFIXES = [
  '/api/v1/home',
  '/api/v1/categories',
  '/api/v1/product-categories',
  '/api/v1/service-categories',
  '/api/v1/service-types',
  '/api/v1/store-types',
  '/api/v1/ads',
  '/api/v1/products',
  '/api/v1/stores',
  '/api/v1/service-listings',
  '/api/v1/service-providers',
  '/api/v1/service-reviews',
  '/api/v1/badges',
  '/api/v1/collections',
  '/api/v1/public/stores',
  '/api/v1/sellers',
  '/api/v1/sellers/ranking',
  '/api/v1/recommendations',
  '/api/v1/search',
  '/api/v1/requests',
];

const DEFAULT_TTL = 900;   // Increased from 300 → 5 min to 15 min
const DEFAULT_SWR = 3600;  // Increased from 900 → 15 min to 60 min
const MAX_CACHE_SIZE = 10 * 1024 * 1024;
const STALE_ON_ERROR = true;
// Extra physical retention after ttl+swr so stale-on-error has something to serve.
const STALE_ERROR_GRACE_SEC = 600;

// Bumped v2 -> v3: key format changed (normalised query, pinned host, SWR metadata).
const CACHE_KEY_VERSION = 'v3';

// Negative caching (#9)
const NEGATIVE_TTL_SEC = 60;
const NEGATIVE_MAX_BODY = 4096;

// Reference cache tier: D1 with Workers KV fallback (#10)
const REFERENCE_ROUTES = new Set([
  'categories',
  'product-categories',
  'service-categories',
  'service-types',
  'store-types',
  'home',
  'ads',
  'products',
  'stores',
  'service-listings',
  'service-providers',
  'service-reviews',
  'collections',
  'public',
  'sellers',
  'search',
  'requests',
]);

// D1 reference-cache namespace. v2 adds invalidation tags to every entry;
// the v1 namespace is intentionally abandoned so untagged legacy rows can never
// be served after this deployment. Expired v1 rows are removed by the daily sweep.
const KV_PREFIX = 'ref:v2:';
const KV_DEFAULT_FRESH_SEC = 3600; // Reference data can use a longer default window
const KV_DEFAULT_MAX_AGE_SEC = 86400; // Reference data: at most 24h before origin fallback
const KV_MUTABLE_FRESH_SEC = 60; // Mutable catalog data: refresh at least every minute
const KV_MUTABLE_MAX_AGE_SEC = 600; // Mutable catalog data: never serve older than 10 minutes
const KV_LONG_FRESH_SEC = 86400; // Explicit opt-in: 24h between origin refreshes
const KV_LONG_MAX_AGE_SEC = 604800; // Opt-in: serve stale-once-refresh entries for at most 7 days
const MAX_SEARCH_CACHE_TERMS = 500;
// Mutable route families enter D1 only after the explicit purge-readiness gate.
const MUTABLE_REFERENCE_ROUTES_REQUIRE_PURGE = new Set([
  // Admin-managed dictionaries are mutable too; they must not inherit the
  // long static-reference fallback window when purge readiness is disabled.
  'categories',
  'product-categories',
  'service-categories',
  'service-types',
  'store-types',
  'home',
  'ads',
  'products',
  'stores',
  'service-listings',
  'service-providers',
  'service-reviews',
  'collections',
  'public',
  'sellers',
  'search',
  'requests',
]);
const KV_MAX_PARAMS = 12;
const KV_MAX_PARAM_VALUE = 160;

// Search caching is deliberately bounded. These are the initial terms supplied
// for this rollout; add terms only after confirming they are common in analytics.
const DEFAULT_SEARCH_CACHE_WHITELIST = new Set([
  'سيارة', 'هاتف', 'لابتوب', 'شقة', 'غرفة', 'كرسي',
  'ثلاجة', 'غسالة', 'تكييف', 'سباك', 'كهربائي',
]);
const KV_MAX_BODY = 1024 * 1024;
const KV_MAX_KEY = 400;

// Query params that never change the response: removed from key AND origin URL.
const IGNORED_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|msclkid|igshid|mc_cid|mc_eid|_ga|__mp_.*)$/i;

// Detail-path tag prefixes: /api/v1/ads/123 -> ad:123 (backend purges by these).
const DETAIL_TAG_PREFIX: Record<string, string> = {
  ads: 'ad',
  products: 'product',
  stores: 'store',
  'service-listings': 'service',
  'service-providers': 'provider',
  sellers: 'seller',
};

// Cache-busting guard: a client can make every URL unique with junk params and
// turn the edge into a pass-through to Neon. Pathological shapes are served
// uncached (and counted as BYPASS-SHAPE) instead of polluting the cache.
const MAX_PARAMS = 16;
const MAX_KEY_LENGTH = 1024;

const inflight = new Map<string, Promise<unknown>>();

/* ───────────────────── dynamic backend gateway ───────────────────── */

// Separate namespace prefix from reference-cache entries. /__purge__ only deletes
// ref:v1:* keys, so a reference-data purge can never erase routing configuration.
const GATEWAY_REGISTRY_KEY = 'gateway:registry:v1';
// The registry changes only on an admin save, which refreshes the saving isolate
// immediately. 60s keeps steady-state DO reads low; other isolates may lag that long.
const GATEWAY_REGISTRY_CACHE_MS = 60000;
const GATEWAY_MAX_SERVERS = 16;
const GATEWAY_MAX_GO_TARGETS = 32;
const GATEWAY_MAX_GO_FAILOVER_ATTEMPTS = 3;
const GATEWAY_MAX_PROBE_TARGETS_PER_REQUEST = 8;
const GATEWAY_DEFAULT_TIMEOUT_MS = 20000;
const GATEWAY_GO_DEFAULT_TIMEOUT_MS = 540000; // API callers may wait up to 9 minutes for selected maintenance jobs.
const GATEWAY_GO_MAX_TIMEOUT_MS = 600000;
const GO_GATEWAY_PREFIX = '/__go';
const GATEWAY_FAILURE_THRESHOLD = 2;
const GATEWAY_OPEN_MS = 30000;
const GATEWAY_HEALTH_STATE_KEY = 'health:backend:v1';
const GATEWAY_HEALTH_OBJECT_NAME = 'backend-pool-v1';
const GATEWAY_REGISTRY_OBJECT_NAME = 'gateway-registry-v1';
const FRONTEND_RELEASE_COOKIE = '__Host-mp-frontend-release';
// Health snapshots are control-plane reads. A 15s isolate cache cuts DO reads
// by roughly 2/3 versus 5s while local circuit breakers still react immediately.
const GATEWAY_HEALTH_CACHE_MS = 45000; // was 15s; local circuit breakers still react immediately
const GATEWAY_HEALTH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const GATEWAY_HEALTH_HISTORY_INTERVAL_SEC = 15 * 60;
const GATEWAY_HEALTH_HISTORY_RETENTION_SEC = 30 * 24 * 60 * 60;
const gatewayFailures = new Map<string, GatewayFailureState>();
const goTrafficSampleCounters = new Map<string, number>();
// Sample successful Go traffic at 1-in-25 (was 1-in-10); failures remain unsampled
// (every failure is still recorded), reducing DO writes on healthy high-volume paths.
const GATEWAY_GO_METRIC_SAMPLE_EVERY = 25;
// Healthy-traffic samples are also rate-limited per target (failures/recovery are never delayed).
const GATEWAY_HEALTHY_WRITE_MIN_GAP_MS = 30000;
const lastHealthyWriteAt = new Map<string, number>();
let gatewayRegistryCache: RegistryCacheEntry | null = null;
let gatewayHealthSnapshotCache: HealthSnapshotCacheEntry | null = null;
// Single-flight: concurrent cache misses in one isolate share one Durable Object read
// instead of each issuing its own (the 12 same-second registry reads seen in tail logs).
let gatewayRegistryBinding: string | null = null;
let gatewayRegistryGeneration = 0;
let gatewayRegistryInflight: { binding: string; generation: number; promise: Promise<GatewayRegistryLoad> } | null = null;
let gatewayHealthInflight: { binding: unknown; promise: Promise<GatewayHealthSnapshot> } | null = null;

function validateBackendOrigin(raw: unknown, env: Env, label = 'Backend'): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) throw new Error(`${label} URL is required and must be at most 2048 characters`);
  let parsed;
  try { parsed = new URL(raw.trim()); } catch { throw new Error(`${label} URL must be a valid URL`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} URL must be an HTTPS origin without credentials, path, query, or fragment`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || !hostname.includes('.') || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') || hostname.endsWith('.home') || hostname.endsWith('.onion')) {
    throw new Error(`${label} hostname must be a public DNS hostname`);
  }
  if (isValidIpAddress(hostname)) throw new Error(`${label} IP-literal URLs are not allowed; use a public DNS hostname`);

  const allowedHosts = String((env && env.GATEWAY_ALLOWED_HOSTS) || '')
    .split(',').map((host) => host.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  if (allowedHosts.length && !allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error(`${label} hostname is not in GATEWAY_ALLOWED_HOSTS`);
  }
  return parsed.origin;
}

function validateGatewayPath(raw: unknown, fallback: string, label: string): string {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
  if (value.length > 512) throw new Error(`${label} exceeds 512 characters`);
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('?') || value.includes('#')) {
    throw new Error(`${label} must be a same-origin absolute path without query or fragment`);
  }
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { throw new Error(`${label} contains invalid URL encoding`); }
  if (decoded.includes('\\') || decoded.split('/').some((segment) => segment === '.' || segment === '..' || /[\u0000-\u001f]/.test(segment))) {
    throw new Error(`${label} contains an unsafe path segment`);
  }
  return new URL(value, 'https://gateway-validation.invalid').pathname;
}

function validateGatewayServer(server: unknown, env: Env, kind: 'backend', ids: Set<string>): BackendServer;
function validateGatewayServer(server: unknown, env: Env, kind: 'frontend', ids: Set<string>): FrontendServer;
function validateGatewayServer(server: unknown, env: Env, kind: 'go', ids: Set<string>): GoWorkerServer;
function validateGatewayServer(server: unknown, env: Env, kind: GatewayKind, ids: Set<string>): GatewayServer {
  if (!isRecord(server)) throw new Error(`Each ${kind} target must be an object`);
  const id = String(server.id || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) throw new Error(`${kind} target id must be 1-64 safe characters`);
  if (ids.has(id)) throw new Error(`Duplicate ${kind} target id: ${id}`);
  ids.add(id);

  const weight = Number(server.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new Error(`Invalid weight for ${id}; expected integer 1-1000`);
  const priority = server.priority === undefined || server.priority === null ? 100 : Number(server.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 1000) throw new Error(`Invalid priority for ${id}; expected integer 1-1000 (lower number wins)`);
  const timeoutMs = server.timeoutMs === undefined || server.timeoutMs === null
    ? (kind === 'go' ? GATEWAY_GO_DEFAULT_TIMEOUT_MS : GATEWAY_DEFAULT_TIMEOUT_MS)
    : Number(server.timeoutMs);
  const maximumTimeoutMs = kind === 'go' ? GATEWAY_GO_MAX_TIMEOUT_MS : 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > maximumTimeoutMs) throw new Error(`Invalid timeoutMs for ${id}; expected integer 1000-${maximumTimeoutMs}`);
  if (typeof server.enabled !== 'boolean') throw new Error(`Target ${id} must have an enabled boolean`);

  const label = kind === 'frontend' ? 'Frontend' : kind === 'go' ? 'Go Worker' : 'Backend';
  const url = validateBackendOrigin(server.url, env, label);
  if (kind === 'frontend') {
    const originHost = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    const publicHosts = String(env.FRONTEND_GATEWAY_HOSTS || '').split(',')
      .map((value) => value.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
    if (publicHosts.includes(originHost)) {
      throw new Error(`Frontend ${id} origin cannot equal a public FRONTEND_GATEWAY_HOSTS host (routing loop)`);
    }
  }

  const common = {
    id,
    url,
    weight,
    priority,
    timeoutMs,
    enabled: server.enabled,
    provider: typeof server.provider === 'string' ? server.provider.trim().slice(0, 64) : '',
    region: typeof server.region === 'string' ? server.region.trim().slice(0, 64) : '',
    healthPath: validateGatewayPath(server.healthPath, kind === 'frontend' ? '/build-id.json' : kind === 'go' ? '/healthz' : '/health', `${kind} healthPath`),
  };

  if (kind === 'frontend') {
    const buildId = String(server.buildId || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(buildId)) {
      throw new Error(`Frontend ${id} must include a valid buildId/release id`);
    }
    const frontendServer: FrontendServer = {
      ...common,
      healthKind: 'frontend',
      buildId,
      releasePath: validateGatewayPath(server.releasePath, '/build-id.json', `Frontend ${id} releasePath`),
    };
    return frontendServer;
  }

  if (kind === 'go') {
    const serviceKey = String(server.serviceKey || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(serviceKey)) {
      throw new Error(`Go target ${id} must include a valid serviceKey (1-64 lowercase safe characters)`);
    }
    const routePrefix = validateGatewayPath(server.routePrefix, '', `Go target ${id} routePrefix`).replace(/\/$/, '');
    const upstreamPrefix = validateGatewayPath(server.upstreamPrefix, routePrefix, `Go target ${id} upstreamPrefix`).replace(/\/$/, '');
    if (!routePrefix.startsWith('/internal/') || !upstreamPrefix.startsWith('/internal/')) {
      throw new Error(`Go target ${id} routePrefix and upstreamPrefix must remain under /internal/`);
    }
    const manualShareRaw = server.manualSharePercent === undefined || server.manualSharePercent === null
      ? null
      : Number(server.manualSharePercent);
    if (manualShareRaw !== null && (!Number.isFinite(manualShareRaw) || manualShareRaw <= 0 || manualShareRaw > 100)) {
      throw new Error(`Invalid manualSharePercent for ${id}; expected a number greater than 0 and at most 100`);
    }
    const goServer: GoWorkerServer = {
      ...common,
      healthKind: 'go',
      serviceKey,
      routePrefix,
      upstreamPrefix,
      // Legacy registries keep their relative weight until group normalization below.
      manualSharePercent: manualShareRaw === null ? 0 : manualShareRaw,
    };
    return goServer;
  }

  const backendServer: BackendServer = { ...common, healthKind: 'backend' };
  return backendServer;
}

function validateGatewayRegistry(input: unknown, env: Env): GatewayRegistry {
  if (!isRecord(input)) throw new Error('Registry body must be an object');
  const backend = input.backend;
  if (!isRecord(backend)) throw new Error('Registry must contain backend');
  if (backend.strategy && backend.strategy !== 'weighted-random') throw new Error('Only weighted-random strategy is supported in this release');
  if (!Array.isArray(backend.servers) || backend.servers.length < 1 || backend.servers.length > GATEWAY_MAX_SERVERS) {
    throw new Error(`Backend pool must contain 1-${GATEWAY_MAX_SERVERS} servers`);
  }
  const backendIds = new Set<string>();
  const backendServers = backend.servers.map((server: unknown) => validateGatewayServer(server, env, 'backend', backendIds));
  if (!backendServers.some((server) => server.enabled)) throw new Error('At least one backend server must be enabled');

  const frontend = isRecord(input.frontend) ? input.frontend : { servers: [] as unknown[] };
  if (frontend.strategy && frontend.strategy !== 'weighted-random') throw new Error('Only weighted-random frontend strategy is supported');
  if (!Array.isArray(frontend.servers) || frontend.servers.length > GATEWAY_MAX_SERVERS) {
    throw new Error(`Frontend pool must contain 0-${GATEWAY_MAX_SERVERS} servers`);
  }
  const frontendIds = new Set<string>();
  const frontendServers = frontend.servers.map((server: unknown) => validateGatewayServer(server, env, 'frontend', frontendIds));
  const activeFrontendBuilds = new Set(frontendServers.filter((server) => server.enabled).map((server) => server.buildId));
  if (activeFrontendBuilds.size > 1) {
    throw new Error('All enabled frontend servers must use the same buildId to protect RSC and Server Actions compatibility');
  }

  // Go services are optional for backwards compatibility with earlier registries.
  const go = isRecord(input.go) ? input.go : { servers: [] as unknown[] };
  if (go.strategy && go.strategy !== 'weighted-random') throw new Error('Only weighted-random Go service strategy is supported');
  if (!Array.isArray(go.servers) || go.servers.length > GATEWAY_MAX_GO_TARGETS) {
    throw new Error(`Go service pool must contain 0-${GATEWAY_MAX_GO_TARGETS} targets`);
  }
  const goIds = new Set<string>();
  const goServers = go.servers.map((server: unknown) => validateGatewayServer(server, env, 'go', goIds));
  // Normalize manual shares inside each service + priority tier. Older registry
  // records did not have manualSharePercent, so their relative `weight` values
  // are migrated without changing their effective distribution.
  const goShareGroups = new Map<string, GoWorkerServer[]>();
  for (const server of goServers) {
    const key = `${server.serviceKey}|${server.priority}`;
    const group = goShareGroups.get(key) || [];
    group.push(server);
    goShareGroups.set(key, group);
  }
  for (const group of goShareGroups.values()) {
    const sourceTotal = group.reduce((sum, server) => sum + (server.manualSharePercent > 0 ? server.manualSharePercent : server.weight), 0);
    for (const server of group) {
      const sourceShare = server.manualSharePercent > 0 ? server.manualSharePercent : server.weight;
      server.manualSharePercent = sourceTotal > 0 ? Math.round((sourceShare / sourceTotal) * 10000) / 100 : 100 / group.length;
    }
  }
  const adaptiveInput = isRecord(go.adaptive) ? go.adaptive : {};
  const adaptiveEnabled = adaptiveInput.enabled === undefined ? true : adaptiveInput.enabled;
  const adaptiveSensitivity = adaptiveInput.sensitivity === undefined ? 65 : Number(adaptiveInput.sensitivity);
  if (typeof adaptiveEnabled !== 'boolean') throw new Error('Go adaptive.enabled must be a boolean');
  if (!Number.isInteger(adaptiveSensitivity) || adaptiveSensitivity < 0 || adaptiveSensitivity > 100) {
    throw new Error('Go adaptive.sensitivity must be an integer between 0 and 100');
  }
  const goRouteByKey = new Map<string, { routePrefix: string; upstreamPrefix: string }>();
  const goKeyByRoute = new Map<string, string>();
  const goTargetByServiceAndOrigin = new Set<string>();
  for (const server of goServers) {
    const targetKey = `${server.serviceKey}|${server.url}`;
    if (goTargetByServiceAndOrigin.has(targetKey)) {
      throw new Error(`Go service ${server.serviceKey} contains the same origin more than once`);
    }
    goTargetByServiceAndOrigin.add(targetKey);
    const known = goRouteByKey.get(server.serviceKey);
    if (known && (known.routePrefix !== server.routePrefix || known.upstreamPrefix !== server.upstreamPrefix)) {
      throw new Error(`All Go targets for service ${server.serviceKey} must use the same routePrefix and upstreamPrefix`);
    }
    goRouteByKey.set(server.serviceKey, { routePrefix: server.routePrefix, upstreamPrefix: server.upstreamPrefix });
    const routeOwner = goKeyByRoute.get(server.routePrefix);
    if (routeOwner && routeOwner !== server.serviceKey) {
      throw new Error(`Go routePrefix ${server.routePrefix} is already assigned to service ${routeOwner}`);
    }
    goKeyByRoute.set(server.routePrefix, server.serviceKey);
  }

  return {
    version: Number.isInteger(input.version) && Number(input.version) > 0 ? Number(input.version) : 1,
    strategy: 'weighted-random',
    backend: { strategy: 'weighted-random', servers: backendServers },
    frontend: { strategy: 'weighted-random', servers: frontendServers },
    go: { strategy: 'weighted-random', servers: goServers, adaptive: { enabled: adaptiveEnabled, sensitivity: adaptiveSensitivity } },
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  };
}

function fallbackGatewayRegistry(env: Env): GatewayRegistry {
  return {
    version: 0,
    strategy: 'single-origin-fallback',
    backend: {
      strategy: 'weighted-random',
      servers: [validateGatewayServer({ id: 'render-primary', url: getRenderOrigin(env), weight: 100, enabled: true }, env, 'backend', new Set<string>())],
    },
    frontend: { strategy: 'weighted-random', servers: [] },
    go: { strategy: 'weighted-random', servers: [] },
    updatedAt: null,
  };
}

function gatewayRegistryObject(env: Env): DurableObjectStubLike | null {
  const binding = env && env.GATEWAY_HEALTH;
  if (!binding || typeof binding.idFromName !== 'function' || typeof binding.get !== 'function') return null;
  try { return binding.get(binding.idFromName(GATEWAY_REGISTRY_OBJECT_NAME)); } catch { return null; }
}

async function callRegistryCoordinator(env: Env, path: string, init?: RequestInit): Promise<Response | null> {
  const stub = gatewayRegistryObject(env);
  if (!stub) return null;
  const response = await stub.fetch(`https://gateway-registry.internal${path}`, init);
  return response;
}

async function loadGatewayRegistry(env: Env, force = false): Promise<GatewayRegistryLoad> {
  const cacheBinding = `${Boolean(env && env.REFERENCE_KV)}:${Boolean(env && env.GATEWAY_HEALTH)}`;

  // An isolate may be reused with a different set of bindings in tests or during
  // deployment. A binding change invalidates both cached and pending reads.
  if (gatewayRegistryBinding !== cacheBinding) {
    gatewayRegistryBinding = cacheBinding;
    gatewayRegistryGeneration += 1;
    gatewayRegistryCache = null;
    gatewayRegistryInflight = null;
  }

  if (force) {
    // A forced read starts a new generation. Older requests may still finish,
    // but they can no longer publish their result into the shared cache.
    gatewayRegistryGeneration += 1;
    gatewayRegistryCache = null;
    gatewayRegistryInflight = null;
  } else if (gatewayRegistryCache && gatewayRegistryCache.binding === cacheBinding && Date.now() < gatewayRegistryCache.expiresAt) {
    return gatewayRegistryCache.value;
  }

  const generation = gatewayRegistryGeneration;
  if (!force && gatewayRegistryInflight &&
      gatewayRegistryInflight.binding === cacheBinding &&
      gatewayRegistryInflight.generation === generation) {
    return gatewayRegistryInflight.promise;
  }

  const promise = loadGatewayRegistryUncached(env, cacheBinding, generation);
  const entry = { binding: cacheBinding, generation, promise };
  gatewayRegistryInflight = entry;
  const clear = () => { if (gatewayRegistryInflight === entry) gatewayRegistryInflight = null; };
  promise.then(clear, clear);
  return promise;
}

async function loadGatewayRegistryUncached(
  env: Env,
  cacheBinding: string,
  generation: number,
): Promise<GatewayRegistryLoad> {

  let value = null;
  let source: RegistrySource = 'env-fallback';
  // The Durable Object is the strongly-consistent control-plane authority. KV is
  // retained as a low-latency read replica and a fallback when the coordinator is
  // unavailable, but it is not the concurrency authority when the DO is bound.
  try {
    const response = await callRegistryCoordinator(env, '/registry', { method: 'GET' });
    if (response && response.ok) {
      const payload: unknown = await response.json();
      if (isRecord(payload) && payload.registry) {
        value = validateGatewayRegistry(payload.registry, env);
        source = 'durable-object';
      }
    }
  } catch (error) {
    console.error('[gateway] durable registry read failed; checking KV replica', errorMessage(error));
  }

  let kvValue = null;
  if (!value && env && env.REFERENCE_KV) {
    try {
      const stored = await getKv(env).get(GATEWAY_REGISTRY_KEY, 'json');
      if (stored) {
        kvValue = validateGatewayRegistry(stored, env);
        value = kvValue;
        source = 'kv';
      }
    } catch (error) {
      console.error('[gateway] registry KV read failed; using RENDER_ORIGIN fallback', errorMessage(error));
    }
  }

  // First-read bootstrap: migrate an existing KV registry into the DO exactly once.
  if (kvValue && gatewayRegistryObject(env)) {
    try {
      await callRegistryCoordinator(env, '/registry/seed', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ registry: kvValue }),
      });
    } catch (error) {
      console.error('[gateway] registry bootstrap failed; retaining KV replica', errorMessage(error));
    }
  }

  if (!value) value = fallbackGatewayRegistry(env);
  const result = { registry: value, source };
  // Only the newest read for the active bindings may publish to the cache.
  if (gatewayRegistryBinding === cacheBinding && gatewayRegistryGeneration === generation) {
    gatewayRegistryCache = { binding: cacheBinding, expiresAt: Date.now() + GATEWAY_REGISTRY_CACHE_MS, value: result };
  }
  return result;
}

function weightedOrder<T extends GatewayServer>(servers: T[], weightFor: (server: T) => number = (server) => server.weight): T[] {
  return servers.map((server) => ({
    server,
    score: -Math.log(Math.max(Math.random(), 1e-12)) / Math.max(0.001, weightFor(server)),
  })).sort((a, b) => a.score - b.score).map((entry) => entry.server);
}

function backendStateKey(server: GatewayServer): string {
  return `${gatewayHealthId(server)}|${server.url}`;
}

function gatewayHealthId(server: GatewayServer): string {
  const prefix = server.healthKind === 'frontend' ? 'frontend--' : server.healthKind === 'go' ? 'go--' : 'backend--';
  return `${prefix}${server.id}`;
}

function weightedPriorityOrder<T extends GatewayServer>(servers: T[], weightFor?: (server: T) => number): T[] {
  const tiers = new Map();
  for (const server of servers) {
    const priority = Number.isInteger(server.priority) ? server.priority : 100;
    if (!tiers.has(priority)) tiers.set(priority, []);
    tiers.get(priority).push(server);
  }
  return [...tiers.keys()].sort((a, b) => a - b).flatMap((priority) => weightedOrder(tiers.get(priority), weightFor));
}

function backendCandidates<T extends GatewayServer>(servers: T[], now = Date.now(), weightFor?: (server: T) => number): T[] {
  // An explicit frontend build mismatch is a hard quarantine, not a transient
  // circuit-open event. It must never become a last-resort half-open candidate.
  const enabled = servers.filter((server) => {
    if (!server.enabled) return false;
    const state = gatewayFailures.get(backendStateKey(server));
    return !(state && state.quarantined === true);
  });
  const healthy = enabled.filter((server) => {
    const state = gatewayFailures.get(backendStateKey(server));
    return !state || state.openUntil <= now;
  });
  const open = enabled.filter((server) => !healthy.includes(server));
  if (healthy.length) return [...weightedPriorityOrder(healthy, weightFor), ...open.sort((a, b) => {
    const aa = gatewayFailures.get(backendStateKey(a));
    const bb = gatewayFailures.get(backendStateKey(b));
    const priorityDiff = (a.priority || 100) - (b.priority || 100);
    return priorityDiff || (aa ? aa.openUntil : 0) - (bb ? bb.openUntil : 0);
  })];
  // When every server is open, try the highest-priority/earliest-expiring circuit
  // as a half-open candidate. Lower priorities follow only when necessary.
  return open.sort((a, b) => {
    const aa = gatewayFailures.get(backendStateKey(a));
    const bb = gatewayFailures.get(backendStateKey(b));
    const priorityDiff = (a.priority || 100) - (b.priority || 100);
    return priorityDiff || (aa ? aa.openUntil : 0) - (bb ? bb.openUntil : 0);
  });
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Build per-target weights from admin-controlled manual shares, adjusted by
 * recent traffic latency, failure ratio and the Go process's active-request
 * signal. It deliberately does not claim to measure host CPU or RAM.
 */
function goAdaptiveWeightMap(
  servers: GoWorkerServer[],
  policy: GatewayAdaptivePolicy | undefined,
  states: Record<string, GatewayHealthState>,
): Map<string, number> {
  const result = new Map<string, number>();
  const groups = new Map<string, GoWorkerServer[]>();
  for (const server of servers) {
    const key = `${server.serviceKey}|${server.priority}`;
    const group = groups.get(key) || [];
    group.push(server);
    groups.set(key, group);
  }

  const enabled = policy?.enabled !== false;
  const strength = enabled ? clampNumber((policy?.sensitivity ?? 65) / 100, 0, 1) : 0;
  for (const group of groups.values()) {
    const measured = group.map((server) => states[backendStateKey(server)])
      .filter((state): state is GatewayHealthState => Boolean(state && (state.sampleCount || 0) >= 5 && Number.isFinite(state.ewmaDurationMs) && Number(state.ewmaDurationMs) > 0));
    const durations = measured.map((state) => Number(state.ewmaDurationMs)).sort((a, b) => a - b);
    const concurrency = measured
      .filter((state) => Number.isFinite(state.ewmaActiveRequests))
      .map((state) => Number(state.ewmaActiveRequests))
      .sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const lowerMedian = durations[middle - 1] ?? 0;
    const upperMedian = durations[middle] ?? 0;
    const baseline = durations.length === 0 ? 0 : durations.length % 2 ? upperMedian : (lowerMedian + upperMedian) / 2;
    const concurrencyMiddle = Math.floor(concurrency.length / 2);
    const concurrencyBaseline = concurrency.length === 0 ? 0 : concurrency.length % 2
      ? (concurrency[concurrencyMiddle] ?? 0)
      : ((concurrency[concurrencyMiddle - 1] ?? 0) + (concurrency[concurrencyMiddle] ?? 0)) / 2;

    for (const server of group) {
      const manualShare = Math.max(0.001, server.manualSharePercent || server.weight);
      const state = states[backendStateKey(server)];
      let factor = 1;
      if (strength > 0 && baseline > 0 && state && (state.sampleCount || 0) >= 5) {
        const latency = Number(state.ewmaDurationMs) || baseline;
        const latencyFactor = clampNumber(Math.sqrt(baseline / Math.max(1, latency)), 0.55, 1.55);
        const errorPenalty = clampNumber(1 - (Number(state.errorRate) || 0) * 1.5, 0.25, 1);
        const active = Number.isFinite(state.ewmaActiveRequests) ? Number(state.ewmaActiveRequests) : null;
        // Only compare concurrency once at least two targets have a signal;
        // +1 avoids division by zero when an instance is idle.
        const loadFactor = active !== null && concurrency.length >= 2
          ? clampNumber(Math.sqrt((concurrencyBaseline + 1) / (active + 1)), 0.55, 1.55)
          : 1;
        const observedCapacity = clampNumber(latencyFactor * errorPenalty * loadFactor, 0.35, 1.55);
        factor = clampNumber(1 + ((observedCapacity - 1) * strength), 0.35, 1.55);
      }
      result.set(server.id, manualShare * factor);
    }
  }
  return result;
}

function shouldSampleGoTraffic(server: GoWorkerServer): boolean {
  const key = backendStateKey(server);
  const next = (goTrafficSampleCounters.get(key) || 0) + 1;
  goTrafficSampleCounters.set(key, next);
  if (goTrafficSampleCounters.size > GATEWAY_MAX_GO_TARGETS * 2) {
    const oldest = goTrafficSampleCounters.keys().next().value;
    if (oldest !== undefined && oldest !== key) goTrafficSampleCounters.delete(oldest);
  }
  return next % GATEWAY_GO_METRIC_SAMPLE_EVERY === 0;
}

/**
 * True while this isolate's circuit for the server is already open. The central Durable
 * Object already received the failures that opened it, so repeating one write per
 * further failed request only adds DO load (and CPU) without changing any state.
 */
function circuitAlreadyOpen(server: GatewayServer): boolean {
  const state = gatewayFailures.get(backendStateKey(server));
  return Boolean(state && state.openUntil > Date.now());
}

function recordBackendResult(server: GatewayServer, healthy: boolean, options: HealthRecordDetails = {}): void {
  const stateKey = backendStateKey(server);
  const existing = gatewayFailures.get(stateKey);
  if (healthy) {
    if (existing && existing.quarantined === true && options.clearQuarantine !== true) return;
    gatewayFailures.delete(stateKey);
    return;
  }
  const current = existing || { failures: 0, openUntil: 0, quarantined: false };
  if (options.quarantined === true) current.quarantined = true;
  current.failures += 1;
  if (current.failures >= GATEWAY_FAILURE_THRESHOLD) {
    current.openUntil = Date.now() + GATEWAY_OPEN_MS;
  }
  gatewayFailures.set(stateKey, current);
  if (gatewayFailures.size > 64) {
    const oldest = gatewayFailures.keys().next().value;
    if (oldest !== undefined && oldest !== stateKey) gatewayFailures.delete(oldest);
  }
}

function normalizeGatewayRequestTarget(pathAndSearch: string): GatewayTarget {
  const raw = String(pathAndSearch || '');
  const queryIndex = raw.indexOf('?');
  const pathname = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  const search = queryIndex >= 0 ? raw.slice(queryIndex) : '';
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\') ||
      pathname.includes('#') || /[\u0000-\u001f]/.test(pathname) || search.includes('#')) {
    throw new Error('Unsafe gateway request path');
  }
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new Error('Malformed gateway request path'); }
  if (decoded.includes('\\') || decoded.startsWith('//') || decoded.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Unsafe gateway request path');
  }
  return { pathname, search };
}

function buildGatewayTargetUrl(origin: string, target: GatewayTarget): string {
  const url = new URL(origin);
  url.pathname = target.pathname;
  url.search = target.search;
  return url.toString();
}

function isFailoverStatus(status: number): boolean {
  // Only read-only GET/HEAD requests reach this policy. 500 is an application
  // server failure just as transient as 502/503/504 for a replicated pool;
  // 408/425 also indicate that this origin could not safely serve the read.
  // Deliberately exclude 429: it is commonly a shared user/IP rate limit, so
  // fanning it out to every replica would amplify load instead of helping.
  return status === 408 || status === 425 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isTransientUpstreamFailure(status: number): boolean {
  // For public cacheable GETs, stale content is safer and more useful than a
  // hard page-level error during a short upstream outage or rate-limit window.
  return status === 408 || status === 425 || status === 429 ||
    status === 500 || status === 502 || status === 503 || status === 504;
}

function gatewayHealthObject(env: Env): DurableObjectStubLike | null {
  const binding = env && env.GATEWAY_HEALTH;
  if (!binding || typeof binding.idFromName !== 'function' || typeof binding.get !== 'function') return null;
  try {
    return binding.get(binding.idFromName(GATEWAY_HEALTH_OBJECT_NAME));
  } catch {
    return null;
  }
}

function localGatewayHealthSnapshot(): GatewayHealthSnapshot {
  const states: Record<string, GatewayHealthState> = {};
  for (const [key, state] of gatewayFailures.entries()) {
    states[key] = {
      failures: state.failures,
      openUntil: state.openUntil,
      healthy: false,
      quarantined: state.quarantined === true,
      status: null,
      durationMs: null,
      checkedAt: null,
      source: 'traffic',
      updatedAt: Date.now(),
    };
  }
  return { states, scope: 'single-worker-isolate' as const, updatedAt: null };
}

async function loadGatewayHealthSnapshot(env: Env, force = false): Promise<GatewayHealthSnapshot> {
  const binding = env && env.GATEWAY_HEALTH;
  const now = Date.now();
  if (!force && gatewayHealthSnapshotCache && gatewayHealthSnapshotCache.binding === binding && now < gatewayHealthSnapshotCache.expiresAt) {
    return gatewayHealthSnapshotCache.value;
  }

  if (force) return loadGatewayHealthSnapshotUncached(env, binding, now);
  if (gatewayHealthInflight && gatewayHealthInflight.binding === binding) return gatewayHealthInflight.promise;
  const promise = loadGatewayHealthSnapshotUncached(env, binding, now);
  const entry = { binding: binding as unknown, promise };
  gatewayHealthInflight = entry;
  const clear = () => { if (gatewayHealthInflight === entry) gatewayHealthInflight = null; };
  promise.then(clear, clear);
  return promise;
}

async function loadGatewayHealthSnapshotUncached(env: Env, binding: Env['GATEWAY_HEALTH'], now: number): Promise<GatewayHealthSnapshot> {
  const stub = gatewayHealthObject(env);
  if (!stub) return localGatewayHealthSnapshot();
  try {
    const response = await stub.fetch('https://gateway-health.internal/snapshot', { method: 'GET' });
    if (!response.ok) throw new Error(`health coordinator returned ${response.status}`);
    const payload = await response.json();
    const states = isRecord(payload) ? parseGatewayHealthStates(payload.states) : {};
    const value = {
      states,
      scope: 'central-durable-object' as const,
      updatedAt: isRecord(payload) && typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    };
    gatewayFailures.clear();
    for (const [key, state] of Object.entries(states)) {
      if (!state || !Number.isFinite(Number(state.failures)) || (Number(state.failures) <= 0 && state.quarantined !== true)) continue;
      gatewayFailures.set(key, {
        failures: Number(state.failures),
        openUntil: Number(state.openUntil) || 0,
        quarantined: state.quarantined === true,
      });
    }
    gatewayHealthSnapshotCache = { binding, expiresAt: now + GATEWAY_HEALTH_CACHE_MS, value };
    return value;
  } catch (error) {
    console.error('[gateway] central health read failed; using isolate-local state', errorMessage(error));
    const fallback = localGatewayHealthSnapshot();
    gatewayHealthSnapshotCache = { binding, expiresAt: now + GATEWAY_HEALTH_CACHE_MS, value: fallback };
    return fallback;
  }
}

async function persistGatewayHealth(env: Env, server: GatewayServer, healthy: boolean, details: HealthRecordDetails = {}, source: HealthSource = 'traffic'): Promise<boolean> {
  const stub = gatewayHealthObject(env);
  if (!stub) return false;
  try {
    const response = await stub.fetch('https://gateway-health.internal/record', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serverId: gatewayHealthId(server),
        serverUrl: server.url,
        healthy,
        status: Number.isInteger(details.status) ? details.status : null,
        durationMs: Number.isFinite(details.durationMs) ? Math.max(0, Math.min(GATEWAY_GO_MAX_TIMEOUT_MS, Number(details.durationMs))) : null,
        activeRequests: Number.isInteger(details.activeRequests) && Number(details.activeRequests) >= 0 && Number(details.activeRequests) <= 100000 ? Number(details.activeRequests) : null,
        source: source === 'probe' ? 'probe' : 'traffic',
        failureThreshold: Number.isInteger(details.failureThreshold) ? details.failureThreshold : GATEWAY_FAILURE_THRESHOLD,
        openMs: GATEWAY_OPEN_MS,
        quarantined: details.quarantined === true,
        clearQuarantine: details.clearQuarantine === true,
      }),
    });
    if (!response.ok) throw new Error(`health coordinator returned ${response.status}`);
    const payload: unknown = await response.json();
    const key = backendStateKey(server);
    if (gatewayHealthSnapshotCache && gatewayHealthSnapshotCache.binding === env.GATEWAY_HEALTH && isRecord(payload) && isGatewayHealthState(payload.state)) {
      const nextState = payload.state;
      const states = { ...gatewayHealthSnapshotCache.value.states, [key]: nextState };
      gatewayHealthSnapshotCache = {
        ...gatewayHealthSnapshotCache,
        expiresAt: Date.now() + GATEWAY_HEALTH_CACHE_MS,
        value: { ...gatewayHealthSnapshotCache.value, states, updatedAt: nextState.checkedAt || new Date().toISOString() },
      };
    }
    return true;
  } catch (error) {
    console.error('[gateway] central health write failed; isolate-local circuit remains active', errorMessage(error));
    return false;
  }
}

function scheduleGatewayHealthWrite(env: Env, ctx: ExecutionContextLike | null, server: GatewayServer, healthy: boolean, details: HealthRecordDetails = {}, source: HealthSource = 'traffic'): Promise<boolean> {
  const write = persistGatewayHealth(env, server, healthy, details, source);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write.catch(() => {}));
  else return write;
  return Promise.resolve(true);
}

async function reconcileGatewayHealth(env: Env, servers: GatewayServer[]): Promise<boolean> {
  const stub = gatewayHealthObject(env);
  if (!stub) return false;
  try {
    const response = await stub.fetch('https://gateway-health.internal/reconcile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: servers.map((server) => ({ id: gatewayHealthId(server), url: server.url })) }),
    });
    if (!response.ok) throw new Error(`health coordinator returned ${response.status}`);
    gatewayHealthSnapshotCache = null;
    return true;
  } catch (error) {
    console.error('[gateway] central health reconcile failed', errorMessage(error));
    return false;
  }
}

/**
 * Explicit, operator-triggered liveness probes. There is deliberately no Cron:
 * health checks run only when an ADMIN requests them from Infrastructure Management.
 * /health is the API's lightweight liveness contract and must not perform DB work.
 */
type GatewayProbeTarget = { kind: GatewayKind; id: string };

async function probeGatewayServers(env: Env, targetRefs?: GatewayProbeTarget[], loaded?: GatewayRegistryLoad): Promise<{ ok: boolean; source: RegistrySource; checkedAt: string; scope: string; stateScope: string; results: ProbeResult[] }> {
  const { registry, source } = loaded || await loadGatewayRegistry(env, true);
  const checkedAt = new Date().toISOString();
  const probeOne = async (server: GatewayServer, kind: GatewayKind): Promise<ProbeResult> => {
    if (!server.enabled) return { kind, id: server.id, enabled: false, healthy: null, status: null, durationMs: 0, detail: 'disabled' };
    const startedAt = Date.now();
    try {
      const probeHeaders = new Headers({ accept: 'application/json' });
      if (server.healthKind === 'go') {
        const serviceToken = resolveGoServiceToken(env, server.serviceKey);
        if (!serviceToken) {
          const durationMs = Date.now() - startedAt;
          recordBackendResult(server, false);
          await persistGatewayHealth(env, server, false, { status: null, durationMs }, 'probe');
          return { kind, id: server.id, enabled: true, healthy: false, status: null, durationMs, detail: 'service_token_not_configured' };
        }
        // This also allows an operator to use the protected /internal/diagnostics
        // readiness endpoint instead of the public, database-only /healthz.
        probeHeaders.set('authorization', `Bearer ${serviceToken}`);
      }
      const healthResponse = await fetch(new URL(server.healthPath || '/health', server.url).toString(), {
        method: 'GET', headers: probeHeaders, redirect: 'manual', signal: AbortSignal.timeout(4000),
      });
      const healthStatus = healthResponse.status;
      const healthOk = healthStatus >= 200 && healthStatus < 300;
      try { if (healthResponse.body) await healthResponse.body.cancel(); } catch { /* discard probe body */ }
      let healthy = healthOk;
      let detail = healthOk ? 'healthy' : `health_http_${healthStatus}`;
      let status = healthStatus;

      if (healthy && server.healthKind === 'frontend') {
        const releaseResponse = await fetch(new URL(server.releasePath, server.url).toString(), {
          method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(4000),
        });
        status = releaseResponse.status;
        if (!releaseResponse.ok) {
          healthy = false;
          detail = `release_http_${releaseResponse.status}`;
          try { if (releaseResponse.body) await releaseResponse.body.cancel(); } catch { /* discard probe body */ }
        } else {
          let releasePayload: unknown = null;
          try { releasePayload = await releaseResponse.json(); } catch { /* invalid release contract */ }
          if (!isRecord(releasePayload) || releasePayload.buildId !== server.buildId) {
            healthy = false;
            detail = 'build_mismatch';
          } else {
            detail = 'healthy_release_match';
          }
        }
      }

      const durationMs = Date.now() - startedAt;
      const quarantined = server.healthKind === 'frontend' && detail === 'build_mismatch';
      const clearQuarantine = server.healthKind === 'frontend' && healthy && detail === 'healthy_release_match';
      recordBackendResult(server, healthy, { quarantined, clearQuarantine });
      await persistGatewayHealth(env, server, healthy, { status, durationMs, quarantined, clearQuarantine }, 'probe');
      return { kind, id: server.id, enabled: true, healthy, status, durationMs, detail, ...(server.healthKind === 'frontend' ? { buildId: server.buildId } : {}) };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      recordBackendResult(server, false);
      await persistGatewayHealth(env, server, false, { status: null, durationMs }, 'probe');
      return {
        kind, id: server.id, enabled: true, healthy: false, status: null, durationMs,
        detail: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'connection_failed',
        ...(server.healthKind === 'frontend' ? { buildId: server.buildId } : {}),
      };
    }
  };

  const allTargets: Array<{ server: GatewayServer; kind: GatewayKind }> = [
    ...registry.backend.servers.map((server) => ({ server, kind: 'backend' as const })),
    ...registry.frontend.servers.map((server) => ({ server, kind: 'frontend' as const })),
    ...registry.go.servers.map((server) => ({ server, kind: 'go' as const })),
  ];
  const selectedTargets = targetRefs
    ? allTargets.filter(({ server, kind }) => targetRefs.some((target) => target.kind === kind && target.id === server.id))
    : allTargets;
  const results = await Promise.all(selectedTargets.map(({ server, kind }) => probeOne(server, kind)));
  return {
    ok: results.every((result) => result.healthy !== false),
    source,
    checkedAt,
    scope: targetRefs ? 'selected-target-batch' : 'single-request-location',
    stateScope: gatewayHealthObject(env) ? 'central-durable-object' : 'single-worker-isolate',
    results,
  };
}

/**
 * Route one request through the configured backend pool. Only GET/HEAD are retried
 * automatically; mutating requests are never replayed because the first upstream
 * may have committed the operation before the connection failed.
 */
async function fetchBackend(pathAndSearch: string, initFactory: RequestInit | ((server: GatewayServer) => RequestInit), env: Env, retrySafe = false, ctx: ExecutionContextLike | null = null, poolKind: GatewayKind = 'backend', preferredServerId: string | null = null, poolOverride?: GatewayServer[]): Promise<GatewayRouteResult> {
  const { registry, source } = await loadGatewayRegistry(env);
  await loadGatewayHealthSnapshot(env);
  let requestTarget;
  try { requestTarget = normalizeGatewayRequestTarget(pathAndSearch); } catch (error) {
    return { res: new Response(JSON.stringify({ success: false, code: 'INVALID_PROXY_PATH', message: 'The requested path is not a valid same-origin path.' }), { status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }), serverId: null, attempts: 0, ms: 0, mode: 'rejected', error: errorMessage(error) };
  }
  const poolServers: GatewayServer[] = poolOverride || (poolKind === 'frontend' ? registry.frontend.servers : poolKind === 'go' ? registry.go.servers : registry.backend.servers);
  const goWeights = poolKind === 'go'
    ? goAdaptiveWeightMap(poolServers.filter((server): server is GoWorkerServer => server.healthKind === 'go'), registry.go.adaptive, gatewayHealthSnapshotCache?.value.states || {})
    : null;
  const candidates = backendCandidates(poolServers, Date.now(), goWeights ? (server) => goWeights.get(server.id) || server.weight : undefined);
  if (preferredServerId) {
    const preferred = candidates.find((server) => server.id === preferredServerId);
    const state = preferred ? gatewayFailures.get(backendStateKey(preferred)) : null;
    if (preferred && (!state || state.openUntil <= Date.now())) {
      candidates.splice(candidates.indexOf(preferred), 1);
      candidates.unshift(preferred);
    }
  }
  const method = typeof initFactory === 'function' ? null : String((initFactory && initFactory.method) || 'GET').toUpperCase();
  const retryAllowed = retrySafe && (method === null || method === 'GET' || method === 'HEAD');
  const maxAttempts = retryAllowed
    ? Math.min(candidates.length, poolKind === 'go' ? GATEWAY_MAX_GO_FAILOVER_ATTEMPTS : candidates.length)
    : Math.min(1, candidates.length);
  let totalMs = 0;
  let last = null;

  const attemptServers = candidates.slice(0, maxAttempts);
  for (const [attemptIndex, server] of attemptServers.entries()) {
    try {
      const init = typeof initFactory === 'function' ? initFactory(server) : initFactory;
      const targetUrl = buildGatewayTargetUrl(server.url, requestTarget);
      const timeoutSignal = AbortSignal.timeout(server.timeoutMs || GATEWAY_DEFAULT_TIMEOUT_MS);
      const requestSignal = init.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      const timedInit = { ...init, signal: requestSignal };
      const result = await fetchUpstream(targetUrl, timedInit);
      const activeHeader = poolKind === 'go' ? result.res?.headers.get('x-mp-worker-active-requests') : null;
      const activeRequests = activeHeader && /^\d{1,6}$/.test(activeHeader) ? clampNumber(Number(activeHeader), 0, 100000) : null;
      totalMs += result.ms;
      last = { ...result, serverId: server.id, attempts: (last ? last.attempts : 0) + 1, mode: source === 'env-fallback' ? 'fallback' : 'pool' };
      if (!result.res || isFailoverStatus(result.res.status)) {
        const alreadyOpen = circuitAlreadyOpen(server);
        recordBackendResult(server, false);
        if (!alreadyOpen) {
          void scheduleGatewayHealthWrite(env, ctx, server, false, {
            status: result.res ? result.res.status : null,
            durationMs: result.ms,
            activeRequests,
          }, 'traffic');
        }
        if (retryAllowed && attemptIndex < attemptServers.length - 1) {
          try { if (result.res && result.res.body) await result.res.body.cancel(); } catch { /* discard failed upstream body before the next attempt */ }
          continue;
        }
        // Preserve the last upstream response body when the retry budget is
        // exhausted so callers can return the real 502/503/504 body to Express.
        return { ...last, ms: totalMs };
      }
      const hadFailure = gatewayFailures.has(backendStateKey(server));
      recordBackendResult(server, true);
      const adaptiveSample = poolKind === 'go' && server.healthKind === 'go' && shouldSampleGoTraffic(server);
      const nowMs = Date.now();
      const healthyKey = backendStateKey(server);
      const gapOk = nowMs - (lastHealthyWriteAt.get(healthyKey) || 0) >= GATEWAY_HEALTHY_WRITE_MIN_GAP_MS;
      if (hadFailure || (adaptiveSample && gapOk)) {
        lastHealthyWriteAt.set(healthyKey, nowMs);
        // Go success samples are sampled at 1-in-25 per target to bound the
        // central Durable Object write rate; failures and circuit recovery
        // events remain unsampled so health protection is not delayed.
        void scheduleGatewayHealthWrite(env, ctx, server, true, { status: result.res.status, durationMs: result.ms, activeRequests }, 'traffic');
      }
      return { ...last, ms: totalMs };
    } catch (error) {
      const alreadyOpen = circuitAlreadyOpen(server);
      recordBackendResult(server, false);
      if (!alreadyOpen) void scheduleGatewayHealthWrite(env, ctx, server, false, { status: null }, 'traffic');
      last = { res: null, error: errorMessage(error), serverId: server.id,
        ms: totalMs, attempts: (last ? last.attempts : 0) + 1, mode: source === 'env-fallback' ? 'fallback' : 'pool' };
      if (!retryAllowed) return last;
    }
  }
  return last || { res: null, error: 'No enabled backend servers', serverId: null, ms: totalMs, attempts: 0, mode: source };
}

function addGatewayHeaders(desc: ResponseDescriptor | null, route: Partial<GatewayRouteResult> | null): ResponseDescriptor | null {
  if (!desc || !desc.headers || !route) return desc;
  if (route.serverId) desc.headers.set('x-mp-backend-id', route.serverId);
  desc.headers.set('x-mp-route-attempts', String(route.attempts || 1));
  desc.headers.set('x-mp-route-mode', route.mode || 'fallback');
  return desc;
}

async function handleGatewayAdmin(request: Request, env: Env): Promise<Response> {
  const secret = env && env.GATEWAY_ADMIN_TOKEN;
  if (!secret) return new Response(JSON.stringify({ ok: false, error: 'GATEWAY_ADMIN_NOT_CONFIGURED' }), {
    status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  if (!timingSafeEqual(request.headers.get('x-gateway-admin-token'), secret)) {
    return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), {
      status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  if (request.method !== 'GET' && request.method !== 'PUT' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, PUT, POST', 'cache-control': 'no-store' } });
  }
  if (!env || (!env.REFERENCE_KV && !gatewayRegistryObject(env))) {
    return new Response(JSON.stringify({ ok: false, error: 'GATEWAY_STORAGE_NOT_CONFIGURED' }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > 1024) return new Response(JSON.stringify({ ok: false, error: 'PROBE_REQUEST_TOO_LARGE' }), {
      status: 413, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
    let payload;
    try { payload = JSON.parse(text || '{}'); } catch {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_JSON' }), {
        status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    if (!isRecord(payload) || payload.action !== 'probe') {
      return new Response(JSON.stringify({ ok: false, error: 'UNSUPPORTED_GATEWAY_ACTION' }), {
        status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    let targetRefs: GatewayProbeTarget[] | undefined;
    if (payload.targetIds !== undefined) {
      if (!Array.isArray(payload.targetIds) || payload.targetIds.length < 1 || payload.targetIds.length > GATEWAY_MAX_PROBE_TARGETS_PER_REQUEST) {
        return new Response(JSON.stringify({ ok: false, error: 'INVALID_PROBE_TARGETS', maxTargets: GATEWAY_MAX_PROBE_TARGETS_PER_REQUEST }), {
          status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      const seen = new Set<string>();
      targetRefs = [];
      for (const item of payload.targetIds) {
        if (!isRecord(item) || !['backend', 'frontend', 'go'].includes(String(item.kind)) ||
            typeof item.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(item.id)) {
          return new Response(JSON.stringify({ ok: false, error: 'INVALID_PROBE_TARGET' }), {
            status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
          });
        }
        const kind = item.kind as GatewayKind;
        const key = `${kind}:${item.id}`;
        if (seen.has(key)) return new Response(JSON.stringify({ ok: false, error: 'DUPLICATE_PROBE_TARGET' }), {
          status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
        seen.add(key);
        targetRefs.push({ kind, id: item.id });
      }
    }
    const current = await loadGatewayRegistry(env, true);
    const allCurrentTargets: Array<{ kind: GatewayKind; id: string }> = [
      ...current.registry.backend.servers.map(({ id }) => ({ kind: 'backend' as const, id })),
      ...current.registry.frontend.servers.map(({ id }) => ({ kind: 'frontend' as const, id })),
      ...current.registry.go.servers.map(({ id }) => ({ kind: 'go' as const, id })),
    ];
    if (targetRefs && targetRefs.some((target) => !allCurrentTargets.some((currentTarget) => currentTarget.kind === target.kind && currentTarget.id === target.id))) {
      return new Response(JSON.stringify({ ok: false, error: 'PROBE_TARGET_NOT_FOUND', message: 'Registry changed; reload targets before probing again.' }), {
        status: 409, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    const totalTargets = allCurrentTargets.length;
    if (!targetRefs && totalTargets > GATEWAY_MAX_PROBE_TARGETS_PER_REQUEST) {
      return new Response(JSON.stringify({ ok: false, error: 'PROBE_BATCH_REQUIRED', maxTargets: GATEWAY_MAX_PROBE_TARGETS_PER_REQUEST, totalTargets }), {
        status: 413, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    const result = await probeGatewayServers(env, targetRefs, current);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  if (request.method === 'GET') {
    const current = await loadGatewayRegistry(env, true);
    const healthSnapshot = await loadGatewayHealthSnapshot(env, true);
    const goWeights = goAdaptiveWeightMap(current.registry.go.servers, current.registry.go.adaptive, healthSnapshot.states);
    const health = [
      ...current.registry.backend.servers.map((server) => ({ ...server, kind: 'backend' as const })),
      ...current.registry.frontend.servers.map((server) => ({ ...server, kind: 'frontend' as const })),
      ...current.registry.go.servers.map((server) => ({ ...server, kind: 'go' as const })),
    ].map((server) => {
      const state = healthSnapshot.states[backendStateKey(server)] || null;
      const openUntil = state ? Number(state.openUntil) || 0 : 0;
      const isGo = server.kind === 'go';
      const goServer = isGo ? server as GoWorkerServer : null;
      const peers = goServer ? current.registry.go.servers.filter((item) => { const peerState = healthSnapshot.states[backendStateKey(item)]; return item.serviceKey === goServer.serviceKey && item.priority === goServer.priority && item.enabled && peerState?.quarantined !== true && !(peerState?.openUntil && Number(peerState.openUntil) > Date.now()); }) : [];
      const peerWeightTotal = peers.reduce((sum, item) => sum + (goWeights.get(item.id) || item.weight), 0);
      return {
        id: server.id,
        kind: server.kind,
        failures: state ? Number(state.failures) || 0 : 0,
        circuit: openUntil > Date.now() ? 'open' : 'closed',
        retryAt: openUntil || null,
        healthy: state && typeof state.healthy === 'boolean' ? state.healthy : null,
        quarantined: state && state.quarantined === true,
        status: state && Number.isInteger(state.status) ? state.status : null,
        durationMs: state && Number.isFinite(state.durationMs) ? state.durationMs : null,
        ewmaDurationMs: state && Number.isFinite(state.ewmaDurationMs) ? state.ewmaDurationMs : null,
        errorRate: state && Number.isFinite(state.errorRate) ? state.errorRate : null,
        activeRequests: state && Number.isInteger(state.activeRequests) ? state.activeRequests : null,
        ewmaActiveRequests: state && Number.isFinite(state.ewmaActiveRequests) ? state.ewmaActiveRequests : null,
        sampleCount: state && Number.isInteger(state.sampleCount) ? state.sampleCount : 0,
        manualSharePercent: goServer ? goServer.manualSharePercent : null,
        effectiveSharePercent: goServer && peerWeightTotal > 0 && peers.some((item) => item.id === goServer.id)
          ? Math.round(((goWeights.get(goServer.id) || goServer.weight) / peerWeightTotal) * 1000) / 10
          : (goServer ? 0 : null),
        checkedAt: state && typeof state.checkedAt === 'string' ? state.checkedAt : null,
        healthSource: state && typeof state.source === 'string' ? state.source : null,
      };
    });
    return new Response(JSON.stringify({
      ok: true,
      source: current.source,
      registry: current.registry,
      localHealth: health,
      localHealthScope: healthSnapshot.scope,
      healthScope: healthSnapshot.scope,
      healthUpdatedAt: healthSnapshot.updatedAt,
    }, null, 2), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const text = await request.text();
  if (text.length > 65536) return new Response(JSON.stringify({ ok: false, error: 'REGISTRY_TOO_LARGE' }), {
    status: 413, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  let payload;
  try { payload = JSON.parse(text); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'INVALID_JSON' }), {
      status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  let validated;
  try {
    validated = validateGatewayRegistry(payload, env);
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'INVALID_REGISTRY', message: errorMessage(error) }), {
      status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  let next;
  let registrySource: RegistrySource = 'kv-compatibility-fallback';
  let replicaStatus = 'not-configured';
  try {
    const current = await loadGatewayRegistry(env, true);
    const currentVersion = Math.max(0, Number(current.registry.version) || 0);
    if (Number.isInteger(payload.version) && payload.version !== currentVersion) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'REGISTRY_VERSION_CONFLICT',
        currentVersion,
        message: 'The server registry changed after it was loaded. Refresh before saving.',
      }), {
        status: 409, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    next = { ...validated, version: currentVersion + 1, updatedAt: new Date().toISOString() };

    const coordinator = gatewayRegistryObject(env);
    if (coordinator) {
      const commit = await coordinator.fetch('https://gateway-registry.internal/registry', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: currentVersion, registry: next }),
      });
      if (commit.status === 409) {
        const conflict = await commit.json();
        return new Response(JSON.stringify({
          ok: false, error: 'REGISTRY_VERSION_CONFLICT', currentVersion: conflict.currentVersion,
          message: 'The server registry changed in another location. Refresh before saving.',
        }), { status: 409, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }
      if (!commit.ok) throw new Error(`registry coordinator returned ${commit.status}`);
      registrySource = 'durable-object';
      if (env.REFERENCE_KV) {
        try {
          await getKv(env).put(GATEWAY_REGISTRY_KEY, JSON.stringify(next));
          replicaStatus = 'synced';
        } catch (replicaError) {
          replicaStatus = 'write-failed';
          console.error('[gateway] registry KV replica write failed', errorMessage(replicaError));
        }
      }
    } else if (env.REFERENCE_KV) {
      // Compatibility path for local development only. Production should bind the
      // coordinator so registry writes have atomic compare-and-swap semantics.
      await getKv(env).put(GATEWAY_REGISTRY_KEY, JSON.stringify(next));
      registrySource = 'kv-compatibility-fallback';
      replicaStatus = 'primary';
    } else {
      throw new Error('No registry coordinator or KV binding is configured');
    }
  } catch (error) {
    console.error('[gateway] registry write failed', errorMessage(error));
    return new Response(JSON.stringify({ ok: false, error: 'GATEWAY_REGISTRY_WRITE_FAILED' }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  gatewayFailures.clear();
  gatewayHealthSnapshotCache = null;
  const cacheBinding = `${Boolean(env && env.REFERENCE_KV)}:${Boolean(env && env.GATEWAY_HEALTH)}`;
  // Publishing an admin save supersedes every registry read started before
  // the commit, preventing a late stale read from replacing this new version.
  gatewayRegistryBinding = cacheBinding;
  gatewayRegistryGeneration += 1;
  gatewayRegistryInflight = null;
  gatewayRegistryCache = { binding: cacheBinding, expiresAt: Date.now() + GATEWAY_REGISTRY_CACHE_MS, value: { registry: next, source: registrySource } };
  await reconcileGatewayHealth(env, [...next.backend.servers, ...next.frontend.servers, ...next.go.servers]);
  const propagation = registrySource === 'durable-object'
    ? 'السجل الأساسي مركزي ومتسق؛ قد تحتفظ بعض نسخ Worker بالنسخة المحلية لمدة تصل إلى 60 ثانية.'
    : 'تم استخدام KV كمسار توافق احتياطي؛ قد تتأخر المواقع الأخرى حتى انتشار KV.';
  return new Response(JSON.stringify({ ok: true, registry: next, source: registrySource, replicaStatus, propagation }, null, 2), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/* ───────────────────────── canonicalisation (#7) ───────────────────────── */

function canonicalizePath(pathname: string): string {
  const segs = String(pathname)
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return seg;
      }
    });
  return '/' + segs.join('/');
}

function canonicalPairs(searchParams: URLSearchParams): Array<[string, string]> {
  const pairs = [];
  const cacheBusterParams = new Set(['_t', 't', 'timestamp', 'probe']);
  for (const [rawKey, rawValue] of searchParams) {
    const key = rawKey.normalize('NFC').trim();
    if (!key || IGNORED_PARAM.test(key) || cacheBusterParams.has(key.toLowerCase())) continue;
    pairs.push([key, rawValue.normalize('NFC').trim()] as [string, string]);
  }
  // Stable sort by key only: repeated keys keep their relative order.
  pairs.sort((a, b) => ((a[0] ?? '') < (b[0] ?? '') ? -1 : (a[0] ?? '') > (b[0] ?? '') ? 1 : 0));
  return pairs;
}

function canonicalize(url: URL): CanonicalUrl {
  const path = canonicalizePath(url.pathname);
  const pairs = canonicalPairs(url.searchParams);
  const search = pairs.length
    ? '?' + pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';
  const segs = path.split('/').filter(Boolean); // ['api','v1','ads', ...]
  return {
    path,
    search,
    key: path + search,
    route: segs[2] || '',
    rest: segs.slice(3),
    pairs,
  };
}

// Cache API keys are versioned and pinned to a stable origin namespace so entries
// remain reusable when the selected backend changes.
function makeCacheKey(input: CanonicalUrl | URL, renderOrigin = DEFAULT_RENDER_ORIGIN): Request {
  const canon: CanonicalUrl = input instanceof URL ? canonicalize(input) : input;
  const sep = canon.search ? '&' : '?';
  return new Request(`${renderOrigin}${canon.key}${sep}__mp_cache_policy=${CACHE_KEY_VERSION}`, {
    method: 'GET',
  });
}

/* ───────────────────────── cache tags (#8) ───────────────────────── */

// MUST stay identical to apps/api/src/shared/cache/edgePurge.ts (see parity tests).
function cityTagValue(city: string): string {
  return encodeURIComponent(
    String(city).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/ /g, '-'),
  );
}

function edgeTagsFor(canon: CanonicalUrl): string {
  const tags = ['api'];
  if (canon.route) tags.push(`route:${canon.route}`);
  const detailPrefix = DETAIL_TAG_PREFIX[canon.route];
  if (detailPrefix && canon.rest.length >= 1) tags.push(`${detailPrefix}:${canon.rest[0]}`);
  const cityPair = canon.pairs.find(([k]) => k === 'city');
  tags.push(cityPair && cityPair[1] ? `city:${cityTagValue(cityPair[1])}` : 'city:any');
  return tags.join(',');
}

/* ───────────────────────── upstream policy ───────────────────────── */

function isUpstreamCacheable(response: Pick<Response, 'status' | 'headers'> | null, requestUrl: string): boolean {
  if (!response || response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;


  // Vary: * can never be matched. Vary: Authorization / Cookie is allowed: the
  // origin's public routes (CACHE.STATIC/SHORT/MEDIUM/LIVE) always declare it on
  // anonymous responses, and this Worker only reaches this check for requests
  // that carry NO Authorization header and NO Cookie (see the `hasAuth` gate in
  // fetch()). Rejecting it made every
  // cacheControl() route BYPASS-POLICY, so the edge only ever cached /home.
  const vary = (response.headers.get('vary') || '').toLowerCase();
  if (vary.split(',').some((token) => token.trim() === '*')) return false;
  const cc = (response.headers.get('cache-control') || '').toLowerCase();
  const directives = cc.split(',').map((part) => part.trim().split('=')[0]);
  if (['private', 'no-store', 'no-cache'].some((directive) => directives.includes(directive))) return false;

  // FORCE CACHE for specific public routes regardless of Render's cache-control
  if (requestUrl) {
    const urlObj = new URL(requestUrl, 'https://placeholder.com');
    if (FORCE_CACHE_PREFIXES.some(prefix => urlObj.pathname.startsWith(prefix))) {
      return true;
    }
  }
  // The API Worker is a shared cache: require an explicit public policy from
  // the origin rather than converting private/default responses into public.
  return directives.includes('public') || /(?:^|,)\s*s-maxage=\d+/.test(cc);
}

function parseCacheControl(cc: string): { ttl: number; swr: number; browserMaxAge: number } {
  const sm = cc.match(/s-maxage=(\d+)/);
  const mx = cc.match(/(?:^|[,\s])max-age=(\d+)/);
  const sw = cc.match(/stale-while-revalidate=(\d+)/);
  return {
    ttl: sm ? parseInt(sm[1]!, 10) : mx ? parseInt(mx[1]!, 10) : DEFAULT_TTL,
    swr: sw ? parseInt(sw[1]!, 10) : DEFAULT_SWR,
    browserMaxAge: mx ? parseInt(mx[1]!, 10) : 0,
  };
}

// Browser keeps the origin's own max-age; the edge adds s-maxage + SWR.
function clientCacheControl(browserMaxAge: number, ttl: number, swr: number): string {
  return `public, max-age=${browserMaxAge}, s-maxage=${ttl}, stale-while-revalidate=${swr}`;
}

function inmMatches(clientINM: string | null, etag: string | null): boolean {
  if (!clientINM || !etag) return false;
  const strip = (v: string) => v.trim().replace(/^W\//, '');
  const want = strip(etag);
  return clientINM.split(',').some((candidate) => {
    const c = strip(candidate);
    return c === '*' || c === want;
  });
}

/* ───────────────────────── stored entries (Cache API) ───────────────────────── */

function buildStored(body: ArrayBuffer | string, o: CacheStoreOptions): Response {
  const h = new Headers();
  h.set('content-type', o.contentType || 'application/json');
  h.set('cache-control', `public, max-age=${o.ttl + o.swr + STALE_ERROR_GRACE_SEC}`);
  h.set('x-mp-stored-at', String(o.storedAt));
  h.set('x-mp-ttl', String(o.ttl));
  h.set('x-mp-swr', String(o.swr));
  h.set('x-mp-client-cc', o.clientCc);
  if (o.neg) h.set('x-mp-neg', '1');
  if (o.etag) h.set('etag', o.etag);
  if (o.vary) h.set('vary', o.vary);
  if (o.tags) {
    h.set('cache-tag', o.tags);
    // Cloudflare strips Cache-Tag from Cache API match() responses. Keep a
    // normal, internal copy so a 304 refresh can restore purge metadata.
    h.set('x-mp-cache-tags', o.tags);
  }
  return new Response(body, { status: 200, headers: h });
}

function storedInfo(stored: Response): { storedAt: number; ttl: number; swr: number; age: number; neg: boolean } {
  const h = stored.headers;
  const storedAt = Number(h.get('x-mp-stored-at')) || 0;
  return {
    storedAt,
    ttl: Number(h.get('x-mp-ttl')) || 0,
    swr: Number(h.get('x-mp-swr')) || 0,
    age: Math.max(0, (Date.now() - storedAt) / 1000),
    neg: h.get('x-mp-neg') === '1',
  };
}

function publicHeaders(o: { contentType?: string | null; clientCc: string; etag?: string | null; vary?: string | null; tags?: string | null; age?: number; cacheStatus: string; ms: number; ttl?: number }): Headers {
  const h = new Headers();
  h.set('content-type', o.contentType || 'application/json');
  h.set('cache-control', o.clientCc);
  if (o.etag) h.set('etag', o.etag);
  if (o.vary) h.set('vary', o.vary);
  if (o.tags) h.set('cache-tag', o.tags);
  if (typeof o.age === 'number') h.set('age', String(Math.floor(o.age)));
  h.set('x-proxy-cache', o.cacheStatus);
  h.set('x-upstream-ms', String(o.ms || 0));
  if (o.ttl) h.set('x-cache-ttl', String(o.ttl));
  h.set('access-control-allow-origin', '*');
  return h;
}

// Cache-Tag is omitted by Cloudflare from Cache API match() responses. The
// custom header survives and is the authoritative copy for every re-put.
function storedCacheTags(stored: Response): string | null {
  return stored.headers.get('x-mp-cache-tags') || stored.headers.get('cache-tag');
}

// Entry (stored Response) -> descriptor that is safe to hand to many waiters.
async function storedToDesc(stored: Response, cacheStatus: string, ms: number): Promise<ResponseDescriptor> {
  const info = storedInfo(stored);
  const body = await stored.arrayBuffer();
  return {
    status: info.neg ? 404 : 200,
    body,
    cacheable: !info.neg,
    etag: stored.headers.get('etag'),
    headers: publicHeaders({
      contentType: stored.headers.get('content-type'),
      clientCc: stored.headers.get('x-mp-client-cc') || clientCacheControl(0, info.ttl, info.swr),
      etag: stored.headers.get('etag'),
      vary: stored.headers.get('vary'),
      tags: storedCacheTags(stored),
      age: info.age,
      cacheStatus,
      ms,
      ttl: info.ttl,
    }),
  };
}

function varyByOriginAndHost(headers: Headers): void {
  // Workers Cache is shared across hostnames bound to this Worker; hostname is
  // not part of its default key. CORS can also differ by Origin. Vary on both
  // headers for every variant, including missing/rejected Origin, so neither a
  // second API hostname nor a Frontend gateway hostname can reuse another host's
  // response. Cloudflare honors all Vary header names for Workers Cache.
  const existing = (headers.get('vary') || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (existing.some((value) => value === '*')) return;
  for (const name of ['Origin', 'Host']) {
    if (!existing.some((value) => value.toLowerCase() === name.toLowerCase())) existing.push(name);
  }
  headers.set('vary', existing.join(', '));
}

function descToResponse(desc: ResponseDescriptor, clientINM: string | null, origin: string): Response {
  if (desc.cacheable && desc.status === 200 && inmMatches(clientINM, desc.etag)) {
    const h = new Headers();
    for (const k of ['etag', 'cache-control', 'vary', 'cache-tag']) {
      const v = desc.headers.get(k);
      if (v) h.set(k, v);
    }
    h.set('x-proxy-cache', `${desc.headers.get('x-proxy-cache')}-304`);
    h.set('x-upstream-ms', '0');
    if (origin) h.set('access-control-allow-origin', origin);
    else h.delete('access-control-allow-origin');
    h.set('access-control-allow-credentials', 'true');
    varyByOriginAndHost(h);
    return new Response(null, { status: 304, headers: h });
  }
  const fh = new Headers(desc.headers);
  if (origin) fh.set('access-control-allow-origin', origin);
  else fh.delete('access-control-allow-origin');
  fh.set('access-control-allow-credentials', 'true');
  varyByOriginAndHost(fh);
  return new Response(desc.body, { status: desc.status, headers: fh });
}

/* ───────────────────────── origin ───────────────────────── */

async function fetchUpstream(url: string, init: RequestInit): Promise<UpstreamResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    return { res, ms: Date.now() - t0 };
  } catch (e) {
    return { res: null, ms: Date.now() - t0, error: errorMessage(e) };
  }
}

function isValidIpv4(value: string): boolean {
  const octets = value.split('.');
  return octets.length === 4 && octets.every((octet) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(octet)) return false;
    return Number(octet) <= 255;
  });
}

function isValidIpAddress(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  if (!value.includes(':')) return isValidIpv4(value);

  let address = value;
  if (address.includes('.')) {
    const lastColon = address.lastIndexOf(':');
    if (lastColon < 0 || !isValidIpv4(address.slice(lastColon + 1))) return false;
    address = `${address.slice(0, lastColon + 1)}0:0`;
  }

  const compressionIndex = address.indexOf('::');
  if (compressionIndex !== address.lastIndexOf('::')) return false;
  const explicitGroups = address.split(':').filter(Boolean);
  if (explicitGroups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  return compressionIndex >= 0 ? explicitGroups.length < 8 : explicitGroups.length === 8;
}

function cleanUpstreamHeaders(request: Request | null, extra: Record<string, string> | null, renderOrigin = DEFAULT_RENDER_ORIGIN): Headers {
  if (!request) return new Headers({ 'accept-encoding': 'gzip, br' });
  const h = new Headers(request.headers);
  h.set('host', new URL(renderOrigin).host);
  for (const x of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip']) {
    h.delete(x);
  }
  // FIX IP-FORWARD-01: preserve real client IP for Render rate limiter.
  // CF-Connecting-IP is Cloudflare-owned and cannot be spoofed by clients.
  // Everything else (user-supplied XFF, CF-*) is deleted above to prevent spoofing.
  const __clientIp = request.headers.get('cf-connecting-ip');
  if (__clientIp && isValidIpAddress(__clientIp)) {
    h.set('x-forwarded-for', __clientIp);
    h.set('x-real-ip', __clientIp);
  }
  if (!h.has('accept-encoding')) h.set('accept-encoding', 'gzip, br');
  if (extra) for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

function passthroughDesc(upstream: Response, body: ArrayBuffer, cacheStatus: string, ms: number): ResponseDescriptor {
  const h = new Headers(upstream.headers);
  // Native Workers Cache sits before this Worker. Only successful responses that
  // passed the explicit public-cache policy may leave a cacheable Cache-Control.
  h.set('cache-control', 'private, no-store');
  h.set('x-proxy-cache', cacheStatus);
  h.set('x-upstream-ms', String(ms || 0));
  h.set('access-control-allow-origin', '*');
  return { status: upstream.status, body, cacheable: false, etag: null, headers: h };
}

function isNegativeEligible(canon: CanonicalUrl, upstream: Response, body: ArrayBuffer): boolean {
  if (upstream.status !== 404) return false;
  if (canon.rest.length < 1) return false; // only detail-like paths (/ads/:id)
  if (upstream.headers.has('set-cookie')) return false;
  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('json')) return false;
  return body.byteLength <= NEGATIVE_MAX_BODY;
}

/* ───────────────────── Reference cache tier: D1 / Workers KV (#10) ───────────────────── */


/**
 * Resolve the reference-cache adapter. D1 is the production store;
 * REFERENCE_KV remains a compatibility fallback for tests and older setups.
 */
const D1_SCHEMA_INIT = new WeakMap<object, Promise<void>>();

class D1KVAdapter {
  private initPromise: Promise<void> | null = null;
  constructor(private db: any, private tableName = 'd1_namespace') {}

  private ensureSchema(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const dbIdentity = this.db as object;
    const existing = D1_SCHEMA_INIT.get(dbIdentity);
    if (existing) {
      this.initPromise = existing;
      return existing;
    }

    const initialization = (async () => {
      await this.db.prepare(
        `CREATE TABLE IF NOT EXISTS ${this.tableName} (
          key TEXT PRIMARY KEY NOT NULL,
          value BLOB NOT NULL,
          metadata TEXT,
          expires_at INTEGER
        )`
      ).run();

      // Add indexed tag columns to existing deployments. A duplicate-column
      // error means this isolate is racing another isolate's same migration.
      for (const column of ['route_tag', 'entity_tag', 'city_tag']) {
        try {
          await this.db.prepare(`ALTER TABLE ${this.tableName} ADD COLUMN ${column} TEXT`).run();
        } catch (error) {
          if (!/duplicate column/i.test(errorMessage(error))) throw error;
        }
      }

      await this.db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires ON ${this.tableName}(expires_at)`
      ).run();
      await this.db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_route_tag ON ${this.tableName}(route_tag)`
      ).run();
      await this.db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_entity_tag ON ${this.tableName}(entity_tag)`
      ).run();
      await this.db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_city_tag ON ${this.tableName}(city_tag)`
      ).run();
    })().catch((error) => {
      D1_SCHEMA_INIT.delete(dbIdentity);
      console.error('[d1-kv] ensureSchema failed:', errorMessage(error));
      throw error;
    });

    D1_SCHEMA_INIT.set(dbIdentity, initialization);
    this.initPromise = initialization;
    return initialization;
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    opts?: { expirationTtl?: number; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.ensureSchema();
    const buf = typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const expiresAt = opts?.expirationTtl
      ? Math.floor(Date.now() / 1000) + opts.expirationTtl
      : null;
    const metaJson = opts?.metadata ? JSON.stringify(opts.metadata) : null;
    const tags = Array.isArray((opts?.metadata as { tags?: unknown[] } | undefined)?.tags)
      ? (opts?.metadata as { tags: unknown[] }).tags.map(String)
      : [];
    const routeTag = tags.find((tag) => tag.startsWith('route:')) ?? null;
    const entityTag = tags.find((tag) => /^(ad|product|store|service|provider|category):/.test(tag)) ?? null;
    const cityTag = tags.find((tag) => tag.startsWith('city:')) ?? null;

    await this.db.prepare(
      `INSERT INTO ${this.tableName} (key, value, metadata, expires_at, route_tag, entity_tag, city_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         metadata = excluded.metadata,
         expires_at = excluded.expires_at,
         route_tag = excluded.route_tag,
         entity_tag = excluded.entity_tag,
         city_tag = excluded.city_tag`
    ).bind(key, buf, metaJson, expiresAt, routeTag, entityTag, cityTag).run();
  }

  async getWithMetadata(
    key: string,
    type: 'arrayBuffer' | 'text' | 'json' = 'text'
  ): Promise<{ value: any; metadata: any }> {
    await this.ensureSchema();
    const row = await this.db.prepare(
      `SELECT value, metadata, expires_at FROM ${this.tableName} WHERE key = ?`
    ).bind(key).first();

    if (!row) return { value: null, metadata: null };

    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
      await this.db.prepare(`DELETE FROM ${this.tableName} WHERE key = ?`).bind(key).run();
      return { value: null, metadata: null };
    }

    let parsed: any = row.value;
    if (row.value && type !== 'arrayBuffer') {
      try {
        const bytes = row.value instanceof ArrayBuffer ? new Uint8Array(row.value) : row.value;
        const text = new TextDecoder().decode(bytes);
        parsed = type === 'json' ? JSON.parse(text) : text;
      } catch {
        parsed = null;
      }
    } else if (row.value && row.value instanceof Uint8Array) {
      parsed = row.value.buffer.slice(row.value.byteOffset, row.value.byteOffset + row.value.byteLength);
    }

    return {
      value: parsed,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  async get(key: string, type: 'arrayBuffer' | 'text' | 'json' = 'text'): Promise<any> {
    const { value } = await this.getWithMetadata(key, type);
    return value;
  }

  async delete(key: string): Promise<void> {
    await this.ensureSchema();
    await this.db.prepare(`DELETE FROM ${this.tableName} WHERE key = ?`).bind(key).run();
  }

  async deleteByTags(tags: string[]): Promise<number> {
    if (tags.length === 0) return 0;
    if (tags.includes('api')) return this.deleteReferenceEntries();
    await this.ensureSchema();

    const routeTags = tags.filter((tag) => tag.startsWith('route:'));
    const entityTags = tags.filter((tag) => /^(ad|product|store|service|provider|category):/.test(tag));
    const cityTags = tags.filter((tag) => tag.startsWith('city:'));
    const clauses: string[] = [];
    const values: string[] = [];
    for (const [column, group] of [
      ['route_tag', routeTags],
      ['entity_tag', entityTags],
      ['city_tag', cityTags],
    ] as const) {
      if (group.length === 0) continue;
      clauses.push(`${column} IN (${group.map(() => '?').join(', ')})`);
      values.push(...group);
    }
    if (clauses.length === 0) return 0;

    const result = await this.db.prepare(
      `DELETE FROM ${this.tableName}
       WHERE key LIKE 'ref:v%:%' AND (${clauses.join(' OR ')})`
    ).bind(...values).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0);
  }

  async deleteReferenceEntries(): Promise<number> {
    await this.ensureSchema();
    const result = await this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE key LIKE 'ref:v%:%'`
    ).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0);
  }

  async deleteExpired(now = Math.floor(Date.now() / 1000), limit = 10000): Promise<number> {
    await this.ensureSchema();
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));
    const result = await this.db.prepare(
      `DELETE FROM ${this.tableName}
       WHERE key IN (
         SELECT key FROM ${this.tableName}
         WHERE key LIKE 'ref:v%:%'
           AND expires_at IS NOT NULL AND expires_at < ?
         ORDER BY expires_at ASC LIMIT ?
       )`
    ).bind(now, safeLimit).run();
    return Number(result?.meta?.changes ?? result?.changes ?? 0);
  }
}

function getKv(env: Env): any {
  if (env && (env as any).DB) {
    return new D1KVAdapter((env as any).DB);
  }
  return (env as any)?.REFERENCE_KV ?? null;
}

/**
 * Operator-managed feature flags stored beside the reference cache.
 * Writes and full listing use a private control-plane endpoint; the separate
 * public endpoint exposes only PUBLIC_* names and never exposes this store's
 * internal flags or administration token.
 */
class D1FeatureFlagStore {
  private initPromise: Promise<void> | null = null;
  constructor(private db: any) {}

  private ensureSchema(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.db.prepare(
          `CREATE TABLE IF NOT EXISTS feature_flags (
            name TEXT PRIMARY KEY NOT NULL,
            enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
            rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
            updated_at INTEGER NOT NULL
          )`
        ).run();
        await this.db.prepare(
          `CREATE TABLE IF NOT EXISTS feature_flag_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flag_name TEXT NOT NULL,
            old_enabled INTEGER CHECK (old_enabled IS NULL OR old_enabled IN (0, 1)),
            new_enabled INTEGER NOT NULL CHECK (new_enabled IN (0, 1)),
            old_rollout_percent INTEGER CHECK (old_rollout_percent IS NULL OR old_rollout_percent BETWEEN 0 AND 100),
            new_rollout_percent INTEGER NOT NULL CHECK (new_rollout_percent BETWEEN 0 AND 100),
            changed_by TEXT NOT NULL,
            changed_at INTEGER NOT NULL
          )`
        ).run();
        await this.db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_name_time ON feature_flag_audit (flag_name, changed_at DESC, id DESC)'
        ).run();
        await this.db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_time ON feature_flag_audit (changed_at DESC, id DESC)'
        ).run();

        // Existing installations created before rollout support need an additive migration.
        const columns = await this.db.prepare('PRAGMA table_info(feature_flags)').all();
        const hasRolloutPercent = Array.isArray(columns?.results) && columns.results.some((column: any) => column?.name === 'rollout_percent');
        if (!hasRolloutPercent) {
          try {
            await this.db.prepare('ALTER TABLE feature_flags ADD COLUMN rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100)').run();
          } catch (error) {
            // Another isolate may have completed the same additive migration concurrently.
            if (!/duplicate column/i.test(errorMessage(error))) throw error;
          }
        }
      })().catch((error: unknown) => {
        this.initPromise = null;
        throw error;
      });
    }
    return this.initPromise!;
  }

  async list(): Promise<Array<{ name: string; enabled: boolean; rolloutPercent: number; updatedAt: number }>> {
    await this.ensureSchema();
    const result = await this.db.prepare(
      'SELECT name, enabled, rollout_percent, updated_at FROM feature_flags ORDER BY name ASC'
    ).all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows.map((row: any) => ({
      name: String(row.name),
      enabled: Number(row.enabled) === 1,
      rolloutPercent: Math.max(0, Math.min(100, Number.isInteger(Number(row.rollout_percent)) ? Number(row.rollout_percent) : 100)),
      updatedAt: Number(row.updated_at) || 0,
    }));
  }

  async set(name: string, enabled: boolean, rolloutPercent: number, changedBy: string): Promise<{ name: string; enabled: boolean; rolloutPercent: number; updatedAt: number }> {
    await this.ensureSchema();
    if (typeof this.db.batch !== 'function') throw new Error('D1_BATCH_REQUIRED_FOR_AUDITED_FLAG_WRITES');
    const updatedAt = Math.floor(Date.now() / 1000);

    // D1 batch runs these statements sequentially in one transaction. The
    // first statement snapshots the previous values (or NULL for a new flag);
    // the upsert then commits with the audit row or both statements roll back.
    const auditInsert = this.db.prepare(
      `INSERT INTO feature_flag_audit
         (flag_name, old_enabled, new_enabled, old_rollout_percent, new_rollout_percent, changed_by, changed_at)
       SELECT ?, old.enabled, ?, old.rollout_percent, ?, ?, ?
       FROM (SELECT 1) AS seed
       LEFT JOIN feature_flags AS old ON old.name = ?
       WHERE old.name IS NULL OR old.enabled != ? OR old.rollout_percent != ?`
    ).bind(name, enabled ? 1 : 0, rolloutPercent, changedBy, updatedAt, name, enabled ? 1 : 0, rolloutPercent);
    const flagUpsert = this.db.prepare(
      `INSERT INTO feature_flags (name, enabled, rollout_percent, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled, rollout_percent = excluded.rollout_percent, updated_at = excluded.updated_at`
    ).bind(name, enabled ? 1 : 0, rolloutPercent, updatedAt);
    await this.db.batch([auditInsert, flagUpsert]);
    return { name, enabled, rolloutPercent, updatedAt };
  }

  async listAudit(limit = 25): Promise<Array<{
    id: number; name: string; oldEnabled: boolean | null; enabled: boolean;
    oldRolloutPercent: number | null; rolloutPercent: number; changedBy: string; changedAt: number;
  }>> {
    await this.ensureSchema();
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 25));
    const result = await this.db.prepare(
      `SELECT id, flag_name, old_enabled, new_enabled, old_rollout_percent,
              new_rollout_percent, changed_by, changed_at
       FROM feature_flag_audit ORDER BY id DESC LIMIT ?`
    ).bind(boundedLimit).all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows.map((row: any) => ({
      id: Number(row.id) || 0,
      name: String(row.flag_name),
      oldEnabled: row.old_enabled === null || row.old_enabled === undefined ? null : Number(row.old_enabled) === 1,
      enabled: Number(row.new_enabled) === 1,
      oldRolloutPercent: row.old_rollout_percent === null || row.old_rollout_percent === undefined ? null : Number(row.old_rollout_percent),
      rolloutPercent: Number(row.new_rollout_percent),
      changedBy: String(row.changed_by),
      changedAt: Number(row.changed_at) || 0,
    }));
  }
}

async function handleFeatureFlagsPublic(request: Request, env: Env): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store, max-age=0' };
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), {
      status: 405,
      headers: { ...headers, allow: 'GET' },
    });
  }
  if (!env || !(env as any).DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1_NOT_CONFIGURED' }), { status: 503, headers });
  }

  try {
    const store = new D1FeatureFlagStore((env as any).DB);
    const rows = await store.list();
    const flags = Object.fromEntries(
      rows
        .filter((flag) => flag.name.startsWith('PUBLIC_'))
        .map((flag) => [flag.name, { enabled: flag.enabled, rolloutPercent: flag.rolloutPercent }]),
    );
    return new Response(JSON.stringify({ ok: true, flags }), { status: 200, headers });
  } catch (error) {
    console.error('[feature-flags-public] D1 read failed:', errorMessage(error));
    return new Response(JSON.stringify({ ok: false, error: 'FEATURE_FLAGS_STORAGE_ERROR' }), { status: 503, headers });
  }
}

async function handleFeatureFlagsAdmin(request: Request, env: Env): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const secret = env && env.FEATURE_FLAGS_ADMIN_TOKEN;
  if (!secret || secret.length < 32) return new Response(JSON.stringify({ ok: false, error: 'FEATURE_FLAGS_ADMIN_NOT_CONFIGURED' }), { status: 503, headers });
  if (!timingSafeEqual(request.headers.get('x-feature-flags-token'), secret)) {
    return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status: 403, headers });
  }
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { ...headers, allow: 'GET, PUT' } });
  }
  if (!env || !(env as any).DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1_NOT_CONFIGURED' }), { status: 503, headers });
  }

  try {
    const store = new D1FeatureFlagStore((env as any).DB);
    if (request.method === 'GET') {
      const auditLimitRaw = new URL(request.url).searchParams.get('auditLimit');
      const auditLimit = auditLimitRaw && /^\d{1,3}$/.test(auditLimitRaw) ? Number(auditLimitRaw) : 25;
      return new Response(JSON.stringify({
        ok: true,
        flags: await store.list(),
        audit: await store.listAudit(Math.max(1, Math.min(100, auditLimit))),
      }), { status: 200, headers });
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 4096) return new Response(JSON.stringify({ ok: false, error: 'REQUEST_TOO_LARGE' }), { status: 413, headers });
    const body = await request.text();
    if (body.length > 4096) return new Response(JSON.stringify({ ok: false, error: 'REQUEST_TOO_LARGE' }), { status: 413, headers });
    let payload: unknown;
    try { payload = JSON.parse(body); } catch {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_JSON' }), { status: 400, headers });
    }
    if (!isRecord(payload) || typeof payload.name !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,63}$/.test(payload.name) || typeof payload.enabled !== 'boolean' ||
        (payload.rolloutPercent !== undefined && (!Number.isInteger(payload.rolloutPercent) || Number(payload.rolloutPercent) < 0 || Number(payload.rolloutPercent) > 100))) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_FEATURE_FLAG', expected: { name: 'UPPER_SNAKE_CASE', enabled: 'boolean', rolloutPercent: 'integer 0..100 (optional; defaults to 100)' } }), { status: 400, headers });
    }
    const changedBy = request.headers.get('x-feature-flags-actor')?.trim() || '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(changedBy)) {
      return new Response(JSON.stringify({ ok: false, error: 'FEATURE_FLAG_ACTOR_REQUIRED' }), { status: 400, headers });
    }
    const flag = await store.set(
      payload.name,
      payload.enabled,
      payload.rolloutPercent === undefined ? 100 : Number(payload.rolloutPercent),
      changedBy,
    );
    return new Response(JSON.stringify({ ok: true, flag, audit: await store.listAudit(25) }), { status: 200, headers });
  } catch (error) {
    console.error('[feature-flags] D1 operation failed:', errorMessage(error));
    return new Response(JSON.stringify({ ok: false, error: 'FEATURE_FLAGS_STORAGE_ERROR' }), { status: 503, headers });
  }
}

function normalizeSearchCacheTerm(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function searchCacheTerms(env: Env): Set<string> {
  // Keep the combined built-in + operator-configured dictionary within 500
  // entries so a large Worker variable cannot silently expand the D1 keyspace.
  const terms = new Set(DEFAULT_SEARCH_CACHE_WHITELIST);
  if (typeof env.SEARCH_CACHE_WHITELIST !== 'string') return terms;

  for (const rawTerm of env.SEARCH_CACHE_WHITELIST.split('|')) {
    const term = normalizeSearchCacheTerm(rawTerm);
    if (!term || term.length > 40 || terms.has(term)) continue;
    terms.add(term);
    if (terms.size >= MAX_SEARCH_CACHE_TERMS) break;
  }
  return terms;
}

function searchCacheAllowed(env: Env, canon: CanonicalUrl): boolean {
  const isSearchEndpoint =
    (canon.route === 'search' && canon.rest.length === 0) ||
    (canon.route === 'ads' && canon.rest[0] === 'search');
  const queryPairs = canon.pairs.filter(([key]) => key === 'q');
  if (queryPairs.length === 0) return !isSearchEndpoint;
  if (queryPairs.length !== 1) return false;

  const query = queryPairs[0]?.[1] ?? '';
  if (!query || query.length > 40) return false;

  const allowed = searchCacheTerms(env);
  // Also protect q-based filters on /stores and other catalog routes from
  // generating an unbounded D1 keyspace, not only the top-level /search route.
  return allowed.has(normalizeSearchCacheTerm(query));
}

function isReferencePurgeReady(env: Env): boolean {
  return env.REFERENCE_CACHE_PURGE_READY === 'true' &&
    typeof env.PURGE_TOKEN === 'string' && env.PURGE_TOKEN.length >= 32;
}

function isLongReferenceCacheEnabled(env: Env): boolean {
  return env.REFERENCE_CACHE_LONG_TTL_ENABLED === 'true' && isReferencePurgeReady(env);
}

function kvTtlPolicy(env: Env, canon?: CanonicalUrl): { freshSec: number; maxAgeSec: number } {
  // Long-lived D1 rows are safe only after an operator explicitly confirms the
  // API durable outbox worker + authenticated Worker purge path are deployed.
  // The shared secret is necessary but not sufficient; a separate readiness
  // flag prevents a matching-looking token from enabling D1 by accident.
  if (isLongReferenceCacheEnabled(env)) {
    return { freshSec: KV_LONG_FRESH_SEC, maxAgeSec: KV_LONG_MAX_AGE_SEC };
  }
  // Mutable catalog routes have a shorter default stale window than reference
  // dictionaries. A transient purge failure therefore cannot preserve an old
  // price/listing state for the generic 24h reference-data fallback window.
  if (canon && MUTABLE_REFERENCE_ROUTES_REQUIRE_PURGE.has(canon.route)) {
    return { freshSec: KV_MUTABLE_FRESH_SEC, maxAgeSec: KV_MUTABLE_MAX_AGE_SEC };
  }
  return { freshSec: KV_DEFAULT_FRESH_SEC, maxAgeSec: KV_DEFAULT_MAX_AGE_SEC };
}

function kvEnabled(env: Env, canon: CanonicalUrl): boolean {
  if (!env || (!(env as any).DB && !(env as any).REFERENCE_KV)) return false;
  if (!REFERENCE_ROUTES.has(canon.route) || canon.key.length > KV_MAX_KEY) return false;
  if (MUTABLE_REFERENCE_ROUTES_REQUIRE_PURGE.has(canon.route) && !isReferencePurgeReady(env)) return false;
  if (canon.pairs.length > KV_MAX_PARAMS) return false;
  if (canon.pairs.some(([, value]) => value.length > KV_MAX_PARAM_VALUE)) return false;
  // Keep free-text queries out of D1 unless they are explicitly allowlisted.
  if (canon.pairs.some(([key, value]) => key === 'q' && value.length > 40)) return false;
  return searchCacheAllowed(env, canon);
}

async function kvRead(env: Env, canon: CanonicalUrl): Promise<ReferenceCacheRead | null> {
  const kv = getKv(env);
  if (!kv || !kvEnabled(env, canon)) return null;
  try {
    const { value, metadata } = await kv.getWithMetadata(KV_PREFIX + canon.key, 'arrayBuffer');
    if (!value || !metadata || !metadata.storedAt) return null;
    return { body: value, meta: metadata, age: Math.max(0, (Date.now() - metadata.storedAt) / 1000) };
  } catch (err) {
    console.error('[referenceCache] read failed:', err instanceof Error ? err.message : String(err), 'key:', canon.key);
    return null;
  }
}

async function kvWrite(env: Env, canon: CanonicalUrl, body: ArrayBuffer, meta: ReferenceCacheMetadata): Promise<void> {
  const kv = getKv(env);
  if (!kv || !kvEnabled(env, canon) || body.byteLength > KV_MAX_BODY) return;
  try {
    const { maxAgeSec } = kvTtlPolicy(env, canon);
    await kv.put(KV_PREFIX + canon.key, body, {
      // Entries stop being useful once they exceed the maximum serve age.
      // Do not retain dead rows for an additional freshness window in D1.
      expirationTtl: maxAgeSec,
      metadata: meta,
    });
  } catch (err) {
    console.error('[referenceCache] write failed:', err instanceof Error ? err.message : String(err), 'key:', canon.key);
  }
}

async function kvPurgeByTags(env: Env, tags: string[]): Promise<number> {
  if (!env) return 0;
  if ((env as any).DB) return new D1KVAdapter((env as any).DB).deleteByTags(tags);
  if (!env.REFERENCE_KV) return 0;

  // Compatibility fallback for local/test deployments that use Workers KV.
  // Production uses D1 above, where tag deletion is a single indexed SQL operation.
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await env.REFERENCE_KV.list({ prefix: 'ref:', ...(cursor ? { cursor } : {}) });
    for (const key of page.keys) {
      if (!key.name.startsWith('ref:v')) continue;
      const entry = await env.REFERENCE_KV.getWithMetadata(key.name, 'arrayBuffer');
      const entryTags = Array.isArray(entry.metadata?.tags) ? entry.metadata.tags : [];
      if (entryTags.some((tag) => tags.includes(String(tag)))) {
        await env.REFERENCE_KV.delete(key.name);
        deleted += 1;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}

async function kvPurgeAll(env: Env): Promise<number> {
  if (!env) return 0;
  if ((env as any).DB) return new D1KVAdapter((env as any).DB).deleteReferenceEntries();
  if (!env.REFERENCE_KV) return 0;
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await env.REFERENCE_KV.list({ prefix: 'ref:', ...(cursor ? { cursor } : {}) });
    for (const key of page.keys) {
      if (!key.name.startsWith('ref:v')) continue;
      await env.REFERENCE_KV.delete(key.name);
      deleted += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}

function timingSafeEqual(a: string | null, b: string): boolean {
  const x = String(a || '');
  const y = String(b || '');
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/* ───────────────────────── load from origin + store ───────────────────────── */

/**
 * Turns an origin response into a shareable descriptor and (when allowed) stores
 * it in the Cache API, plus KV for reference routes. Returns a descriptor, never a
 * live Response, so the single-flight promise can be shared by any number of
 * waiters.
 */
async function processUpstream(upstream: Response | null, ms: number, { canon, cache, cacheKey, ctx, env, awaitStore }: ProcessUpstreamArgs): Promise<ResponseDescriptor> {
  // Network error / transient upstream status -> stale-on-error.
  if (!upstream || isTransientUpstreamFailure(upstream.status)) {
    if (STALE_ON_ERROR) {
      const stale = await safeCacheMatch(cache, cacheKey);
      if (stale) return storedToDesc(stale, 'STALE-ERROR', ms);
    }
    if (!upstream) {
      return {
        status: 502,
        body: 'Upstream error',
        cacheable: false,
        etag: null,
        headers: new Headers({ 'x-proxy-cache': 'BYPASS-ERROR', 'access-control-allow-origin': '*' }),
      };
    }
    return passthroughDesc(upstream, await upstream.arrayBuffer(), 'BYPASS-ERROR', ms);
  }

  const body = await upstream.arrayBuffer();
  const tags = edgeTagsFor(canon);
  const store = (entry: Response): Promise<boolean> | undefined => {
    const p = safeCachePut(cache, cacheKey, entry);
    if (awaitStore) return p;
    if (ctx) ctx.waitUntil(p);
    return undefined;
  };

  // Negative caching (#9)
  if (isNegativeEligible(canon, upstream, body)) {
    const clientCc = clientCacheControl(0, NEGATIVE_TTL_SEC, 0);
    const contentType = upstream.headers.get('content-type') || 'application/json';
    await store(
      buildStored(body, {
        contentType,
        ttl: NEGATIVE_TTL_SEC,
        swr: 0,
        clientCc,
        storedAt: Date.now(),
        neg: true,
        tags,
      }),
    );
    return {
      status: 404,
      body,
      cacheable: false,
      etag: null,
      headers: publicHeaders({ contentType, clientCc, tags, cacheStatus: 'NEG-MISS', ms, ttl: NEGATIVE_TTL_SEC }),
    };
  }

  if (upstream.status !== 200) return passthroughDesc(upstream, body, 'BYPASS-NON200', ms);

  // Never override private/no-store/no-cache or Set-Cookie responses with a public
  // Cache-Control header. Protects routes such as /home/feed and /recommendations.
  const { ttl, swr, browserMaxAge } = parseCacheControl(upstream.headers.get('cache-control') || '');
  if (!isUpstreamCacheable({ status: upstream.status, headers: upstream.headers }, canon.path || canon.key) || ttl <= 0) {
    return passthroughDesc(upstream, body, 'BYPASS-POLICY', ms);
  }

  const contentType = upstream.headers.get('content-type') || 'application/json';
  const etag = upstream.headers.get('etag');
  const vary = upstream.headers.get('vary');
  const clientCc = clientCacheControl(browserMaxAge, ttl, swr);
  const storedAt = Date.now();

  if (body.byteLength <= MAX_CACHE_SIZE) {
    await store(buildStored(body, { contentType, etag, vary, tags, ttl, swr, clientCc, storedAt }));
    if (kvEnabled(env, canon)) {
      const kvTask = kvWrite(env, canon, body, {
        ct: contentType, etag, vary, ttl, swr, bcc: browserMaxAge, storedAt,
        tags: edgeTagsFor(canon).split(','),
      });
      if (awaitStore) await kvTask;
      else if (ctx) ctx.waitUntil(kvTask);
    }
  }

  return {
    status: 200,
    body,
    cacheable: true,
    etag,
    headers: publicHeaders({ contentType, clientCc, etag, vary, tags, cacheStatus: 'MISS', ms, ttl }),
  };
}

async function originLoad(args: OriginLoadArgs): Promise<ResponseDescriptor> {
  const routed = await fetchBackend(args.canon.key, (server) => {
    const headers = cleanUpstreamHeaders(args.request, null, server.url);
    // Never forward client validators: we always want a full 200 we can store.
    headers.delete('if-none-match');
    headers.delete('if-modified-since');
    return { method: 'GET', headers, redirect: 'manual' };
  }, args.env, true, args.ctx);
  const desc = await processUpstream(routed.res, routed.ms, args);
  return addGatewayHeaders(desc, routed) ?? desc;
}

// Background revalidation with the stored ETag. A 304 keeps the body and restarts
// the clock; anything else goes through the normal path (policy / negative / error).
async function revalidateLoad(args: RevalidateArgs): Promise<ResponseDescriptor | null> {
  const { canon, request, cache, cacheKey, stale } = args;
  const etag = stale.headers.get('etag');
  if (!etag) return originLoad(args);

  const routed = await fetchBackend(canon.key, (server) => {
    const headers = cleanUpstreamHeaders(request, null, server.url);
    headers.delete('if-modified-since');
    headers.set('if-none-match', etag);
    return { method: 'GET', headers, redirect: 'manual' };
  }, args.env, true, args.ctx);
  const upstream = routed.res;
  const ms = routed.ms;

  if (upstream && upstream.status === 304) {
    const info = storedInfo(stale);
    const body = await stale.arrayBuffer();
    const storedAt = Date.now();
    const clientCc = stale.headers.get('x-mp-client-cc') || clientCacheControl(0, info.ttl, info.swr);
    await safeCachePut(cache,
      cacheKey,
      buildStored(body, {
        contentType: stale.headers.get('content-type') || 'application/json',
        etag,
        vary: stale.headers.get('vary'),
        // Derive tags from the canonical request when upgrading legacy cache
        // entries that predate x-mp-cache-tags; never re-store an untagged row.
        tags: storedCacheTags(stale) || edgeTagsFor(canon),
        ttl: info.ttl,
        swr: info.swr,
        clientCc,
        storedAt,
      }),
    );
    // A 304 confirms the D1 body is still current. Touch metadata so other colos
    // do not repeatedly revalidate the same unchanged reference row.
    const browserMaxAge = parseCacheControl(clientCc).browserMaxAge;
    await kvWrite(args.env, canon, body, {
      ct: stale.headers.get('content-type') || 'application/json',
      etag,
      vary: stale.headers.get('vary'),
      ttl: info.ttl,
      swr: info.swr,
      bcc: browserMaxAge,
      storedAt,
      tags: edgeTagsFor(canon).split(','),
    });
    return null;
  }
  return processUpstream(upstream, ms, args);
}

function startLoad<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/* ───────────────────────── request handling ───────────────────────── */

async function handleCacheable(request: Request, canon: CanonicalUrl, ctx: ExecutionContextLike, env: Env): Promise<Response> {
  const cache: Cache = caches.default;
  const renderOrigin = getRenderOrigin(env);
  const cacheKey = makeCacheKey(canon, renderOrigin);
  const clientINM = request.headers.get('if-none-match');
  const origin = resolveCorsOrigin(request, env);
  const flightKey = canon.key;
  const loadArgs: OriginLoadArgs = { canon, request, cache, cacheKey, ctx, env, renderOrigin };

  // 1. Edge cache
  const cached = await safeCacheMatch(cache, cacheKey);
  if (cached) {
    const info = storedInfo(cached);
    if (info.age <= info.ttl) {
      return descToResponse(await storedToDesc(cached, info.neg ? 'HIT-NEGATIVE' : 'HIT', 0), clientINM, origin);
    }
    // 1b. #12 stale-while-revalidate: answer now, refresh in the background.
    if (!info.neg && info.age <= info.ttl + info.swr) {
      const desc = await storedToDesc(cached.clone(), 'STALE', 0);
      ctx.waitUntil(
        startLoad(`rv:${flightKey}`, () => revalidateLoad({ ...loadArgs, stale: cached })).catch(() => {}),
      );
      return descToResponse(desc, clientINM, origin);
    }
  }

  // 2. #10 KV tier for reference data
  const kv = await kvRead(env, canon);
  if (kv) {
    const m = kv.meta;
    const clientCc = clientCacheControl(m.bcc || 0, m.ttl, m.swr);
    const kvDesc = {
      status: 200,
      body: kv.body,
      cacheable: true,
      etag: m.etag || null,
      headers: publicHeaders({
        contentType: m.ct,
        clientCc,
        etag: m.etag,
        vary: m.vary,
        tags: edgeTagsFor(canon),
        age: kv.age,
        cacheStatus: kv.age <= kvTtlPolicy(env, canon).freshSec ? 'KV-HIT' : 'KV-STALE',
        ms: 0,
        ttl: m.ttl,
      }),
    };
    if (kv.age <= kvTtlPolicy(env, canon).maxAgeSec) {
      ctx.waitUntil(
        safeCachePut(cache,
          cacheKey,
          buildStored(kv.body, {
            contentType: m.ct,
            etag: m.etag,
            vary: m.vary,
            tags: edgeTagsFor(canon),
            ttl: m.ttl,
            swr: m.swr,
            clientCc,
            storedAt: Date.now(),
          }),
        ),
      );
      if (kv.age > kvTtlPolicy(env, canon).freshSec) {
        ctx.waitUntil(startLoad(`rv:${flightKey}`, () => originLoad(loadArgs)).catch(() => {}));
      }
      return descToResponse(kvDesc, clientINM, origin);
    }
  }

  // 3. Miss -> single-flight origin load (descriptor is shareable, Response is not)
  const shared = inflight.has(flightKey);
  try {
    const desc = await startLoad(flightKey, () => originLoad(loadArgs));
    if (shared && desc.headers.get('x-proxy-cache') === 'MISS') {
      const h = new Headers(desc.headers);
      h.set('x-proxy-cache', 'SHARED');
      return descToResponse({ ...desc, headers: h }, clientINM, origin);
    }
    return descToResponse(desc, clientINM, origin);
  } catch (e) {
    const eh = new Headers();
    eh.set('content-type', 'application/json');
    eh.set('access-control-allow-origin', origin);
    eh.set('access-control-allow-credentials', 'true');
    eh.set('cache-control', 'private, no-store');
    return new Response(JSON.stringify({ success: false, message: `Proxy error: ${errorMessage(e)}` }), {
      status: 502, headers: eh,
    });
  }
}



async function handlePassthrough(request: Request, url: URL, env: Env, ctx: ExecutionContextLike | null = null): Promise<Response> {
  const method = request.method.toUpperCase();
  const isGet = method === 'GET' || method === 'HEAD';
  const routed = await fetchBackend(url.pathname + url.search, (server) => {
    const headers = new Headers(request.headers);
    headers.set('host', new URL(server.url).host);

    for (const x of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip']) {
      headers.delete(x);
    }
    // Preserve only the Cloudflare-authenticated client IP; never trust caller XFF.
    const clientIp = request.headers.get('cf-connecting-ip');
    if (clientIp && isValidIpAddress(clientIp)) {
      headers.set('x-forwarded-for', clientIp);
      headers.set('x-real-ip', clientIp);
    }

    const init: RequestInit = { method, headers, redirect: 'manual', signal: request.signal };
    if (!isGet) init.body = request.body;
    return init;
  }, env, isGet, ctx);

  if (!routed.res) {
    return new Response(JSON.stringify({ success: false, code: 'UPSTREAM_UNAVAILABLE', message: 'No backend server could complete the request' }), {
      status: 502,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': resolveCorsOrigin(request, env),
        'access-control-allow-credentials': 'true',
        'x-proxy-cache': 'BYPASS-ERROR',
        'x-mp-route-attempts': String(routed.attempts || 0),
        'x-mp-route-mode': routed.mode || 'fallback',
        'cache-control': 'private, no-store',
      },
    });
  }

  const upstream = routed.res;
  const h = new Headers(upstream.headers);
  h.set('access-control-allow-origin', resolveCorsOrigin(request, env));
  h.set('access-control-allow-credentials', 'true');
  h.set('x-proxy-cache', 'BYPASS');
  h.set('x-mp-backend-id', routed.serverId || 'unknown');
  h.set('x-mp-route-attempts', String(routed.attempts || 1));
  h.set('x-mp-route-mode', routed.mode || 'fallback');
  h.delete('cf-cache-status');
  // Default-deny native Workers Cache on every passthrough path, including
  // requests carrying Cookie, auth, dynamic data, or unusual query parameters.
  h.set('cache-control', 'private, no-store');

  // Never cache or transform Server-Sent Events. Preserve streaming through the
  // Worker so notification frames/heartbeats reach mobile clients promptly.
  if (url.pathname.endsWith('/notifications/stream')) {
    h.set('cache-control', 'private, no-store, no-transform');
    h.set('x-accel-buffering', 'no');
    h.delete('content-length');
    h.delete('content-encoding');
  }

  return new Response(upstream.body, { status: upstream.status, headers: h });
}

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, '')}/`);
}

function rewriteGoServicePath(pathname: string, routePrefix: string, upstreamPrefix: string): string {
  const suffix = pathname.slice(routePrefix.length);
  return `${upstreamPrefix.replace(/\/$/, '')}${suffix}` || '/';
}

function goServiceForPath(servers: GoWorkerServer[], pathname: string): GoWorkerServer[] {
  // Resolve the most specific route independently of enabled state. Disabling a
  // specialized service must not accidentally leak its requests to a broader one.
  const matched = servers
    .filter((server) => pathMatchesPrefix(pathname, server.routePrefix))
    .sort((left, right) => right.routePrefix.length - left.routePrefix.length);
  const selected = matched[0];
  if (!selected) return [];
  return matched.filter((server) => server.serviceKey === selected.serviceKey && server.routePrefix === selected.routePrefix);
}

function resolveGoServiceToken(env: Env, serviceKey: string): string | null {
  const rawProfiles = String(env.GO_WORKER_TOKENS_JSON || '').trim();
  if (!rawProfiles) return String(env.GO_WORKER_TOKEN || '').trim() || null;
  try {
    const profiles: unknown = JSON.parse(rawProfiles);
    if (!isRecord(profiles)) return null;
    const token = profiles[serviceKey];
    if (typeof token !== 'string') return null;
    const normalized = token.trim();
    return normalized.length >= 32 && normalized.length <= 1024 && !/[\r\n]/.test(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function goProxyHeaders(request: Request, url: URL, token: string, serviceKey: string, targetId: string): Headers {
  const headers = new Headers(request.headers);
  for (const name of [
    'authorization', 'cookie', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
    'x-forwarded-proto', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'host',
    'x-mp-go-service', 'x-mp-go-target', 'x-mp-route-attempts', 'x-mp-route-mode',
    'x-mp-backend-id', 'x-mp-frontend-id', 'x-mp-frontend-build-id',
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
    'transfer-encoding', 'upgrade',
  ]) headers.delete(name);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp && isValidIpAddress(clientIp)) {
    headers.set('x-forwarded-for', clientIp);
    headers.set('x-real-ip', clientIp);
  }
  headers.set('authorization', `Bearer ${token}`);
  headers.set('x-mp-go-service', serviceKey);
  headers.set('x-mp-go-target', targetId);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.slice(0, -1));
  headers.set('cache-control', 'no-store');
  return headers;
}

/**
 * Authenticated reverse proxy for internal Go services. Express can set
 * GO_WORKER_URL to `<gateway-origin>/__go`; existing `/internal/...` calls then
 * resolve to the most-specific registered Go service. Only GET/HEAD may fail
 * over automatically. Mutating job calls are never replayed by the gateway.
 */
async function handleGoGateway(request: Request, url: URL, env: Env, ctx: ExecutionContextLike): Promise<Response> {
  const expectedToken = String(env.GO_WORKER_TOKEN || '').trim();
  if (!expectedToken) {
    return new Response(JSON.stringify({ ok: false, error: 'GO_GATEWAY_NOT_CONFIGURED' }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !timingSafeEqual(match[1] || null, expectedToken)) {
    return new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), {
      status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'www-authenticate': 'Bearer' },
    });
  }

  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    return new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), {
      status: 405, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', allow: 'GET, HEAD, POST' },
    });
  }

  let requestTarget: GatewayTarget;
  try {
    const rawPath = url.pathname.slice(GO_GATEWAY_PREFIX.length) || '/';
    requestTarget = normalizeGatewayRequestTarget(rawPath + url.search);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'INVALID_GO_SERVICE_PATH' }), {
      status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const { registry } = await loadGatewayRegistry(env);
  const serviceTargets = goServiceForPath(registry.go.servers, requestTarget.pathname);
  if (!serviceTargets.length) {
    return new Response(JSON.stringify({ ok: false, error: 'GO_SERVICE_ROUTE_NOT_FOUND' }), {
      status: 404, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  const selectedService = serviceTargets[0];
  if (!selectedService || !serviceTargets.some((server) => server.enabled)) {
    return new Response(JSON.stringify({ ok: false, error: 'GO_SERVICE_UNAVAILABLE', service: selectedService?.serviceKey || null }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const upstreamToken = resolveGoServiceToken(env, selectedService.serviceKey);
  if (!upstreamToken) {
    return new Response(JSON.stringify({ ok: false, error: 'GO_SERVICE_TOKEN_NOT_CONFIGURED', service: selectedService.serviceKey }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const upstreamPath = rewriteGoServicePath(requestTarget.pathname, selectedService.routePrefix, selectedService.upstreamPrefix);
  const upstreamTarget = `${upstreamPath}${requestTarget.search}`;
  const isSafeMethod = method === 'GET' || method === 'HEAD';
  const routed = await fetchBackend(upstreamTarget, (server) => {
    const headers = goProxyHeaders(request, url, upstreamToken, selectedService.serviceKey, server.id);
    const init: RequestInit = { method, headers, redirect: 'manual', signal: request.signal };
    if (method !== 'GET' && method !== 'HEAD') init.body = request.body;
    return init;
  }, env, isSafeMethod, ctx, 'go', null, serviceTargets);

  if (!routed.res) {
    return new Response(JSON.stringify({ ok: false, error: 'GO_SERVICE_UPSTREAM_UNAVAILABLE', service: selectedService.serviceKey }), {
      status: 502,
      headers: {
        'content-type': 'application/json', 'cache-control': 'no-store',
        'x-mp-go-service': selectedService.serviceKey,
        'x-mp-route-attempts': String(routed.attempts || 0),
        'x-mp-route-mode': 'go',
      },
    });
  }

  const headers = new Headers(routed.res.headers);
  headers.delete('x-mp-worker-active-requests');
  headers.set('cache-control', 'no-store');
  headers.set('x-mp-go-service', selectedService.serviceKey);
  headers.set('x-mp-go-target', routed.serverId || 'unknown');
  headers.set('x-mp-route-attempts', String(routed.attempts || 1));
  headers.set('x-mp-route-mode', 'go');
  headers.delete('cf-cache-status');
  return new Response(routed.res.body, { status: routed.res.status, statusText: routed.res.statusText, headers });
}

function isFrontendGatewayHost(url: URL, env: Env): boolean {
  const configured = String((env && env.FRONTEND_GATEWAY_HOSTS) || '').split(',')
    .map((value) => value.trim().toLowerCase()).filter(Boolean);
  const hostname = String(url.hostname || '').toLowerCase().replace(/\.$/, '');
  return configured.includes(hostname);
}

function getFrontendAffinity(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== FRONTEND_RELEASE_COOKIE) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function frontendProxyHeaders(request: Request, url: URL): Headers {
  const headers = new Headers(request.headers);
  for (const name of [
    'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto',
    'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'host', 'connection',
    'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
    'transfer-encoding', 'upgrade',
  ]) headers.delete(name);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp && isValidIpAddress(clientIp)) {
    headers.set('x-forwarded-for', clientIp);
    headers.set('x-real-ip', clientIp);
  }
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.slice(0, -1));
  return headers;
}

async function handleFrontendGateway(request: Request, url: URL, env: Env, ctx: ExecutionContextLike): Promise<Response> {
  const { registry } = await loadGatewayRegistry(env);
  const servers = registry.frontend && registry.frontend.servers ? registry.frontend.servers : [];
  if (!servers.some((server) => server.enabled)) {
    return new Response(JSON.stringify({ success: false, code: 'FRONTEND_POOL_NOT_CONFIGURED', message: 'Frontend routing is enabled for this hostname, but no frontend origins are active.' }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const affinityId = getFrontendAffinity(request);
  const routed = await fetchBackend(url.pathname + url.search, () => {
    const headers = frontendProxyHeaders(request, url);
    const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
    return init;
  }, env, request.method === 'GET' || request.method === 'HEAD', ctx, 'frontend', affinityId);

  if (!routed.res) {
    return new Response(JSON.stringify({ success: false, code: 'FRONTEND_UPSTREAM_UNAVAILABLE', message: 'No configured frontend origin could complete the request.' }), {
      status: 502,
      headers: {
        'content-type': 'application/json', 'cache-control': 'no-store',
        'x-mp-route-attempts': String(routed.attempts || 0), 'x-mp-route-mode': 'frontend',
      },
    });
  }

  const selected = servers.find((server) => server.id === routed.serverId);
  const headers = new Headers(routed.res.headers);
  headers.set('x-mp-frontend-id', routed.serverId || 'unknown');
  headers.set('x-mp-frontend-build-id', selected ? selected.buildId : 'unknown');
  headers.set('x-mp-route-attempts', String(routed.attempts || 1));
  headers.set('x-mp-route-mode', 'frontend');
  const frontendHasUserContext = request.headers.has('authorization') || request.headers.has('cookie');
  headers.set('cache-control', frontendHasUserContext || headers.has('set-cookie')
    ? 'private, no-store'
    : (routed.res.headers.get('cache-control') || 'private, no-store'));
  headers.delete('cf-cache-status');
  if (routed.serverId && affinityId !== routed.serverId) {
    headers.append('set-cookie', `${FRONTEND_RELEASE_COOKIE}=${encodeURIComponent(routed.serverId)}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax`);
  }

  // Keep same-origin redirects on the public frontend hostname. External redirects
  // (OAuth providers, payment gateways, etc.) are intentionally left unchanged.
  const location = headers.get('location');
  if (location && selected) {
    try {
      const redirectUrl = new URL(location, selected.url);
      if (redirectUrl.origin === selected.url) {
        headers.set('location', `${url.origin}${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
      }
    } catch { /* preserve malformed or non-URL Location values unchanged */ }
  }

  return new Response(routed.res.body, { status: routed.res.status, statusText: routed.res.statusText, headers });
}

function resolveCorsOrigin(req: Request, env: Env): string {
  const requestOrigin = req.headers.get('origin');
  const configured = String((env && env.FRONTEND_ORIGIN) || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!requestOrigin) return configured[0] || '*';
  // Never reflect an arbitrary Origin when credentials are allowed. A missing
  // allow-list is a deployment configuration error, so browser CORS fails closed.
  if (!configured.length || !configured.includes(requestOrigin)) return '';
  return requestOrigin;
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': resolveCorsOrigin(req, env),
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Offline-Op-Id, If-None-Match, X-CSRF-Token, X-Requested-With, Accept, Origin, last-event-id',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '86400',
  };
}

/**
 * Optional measurement (Workers Analytics Engine, binding CACHE_METRICS).
 * One data point per cacheable request: blobs=[cache status, route, colo],
 * doubles=[upstream ms, http status]. No binding => no-op. Never throws.
 * Query it with the SQL in EDGE_CACHE_ROUND3_REPORT.md to get the REAL hit ratio.
 */
function recordMetric(env: Env, canon: CanonicalUrl, response: Response, request: CloudflareRequest): void {
  try {
    if (!env || !env.CACHE_METRICS) return;
    const colo = (request.cf && request.cf.colo) || 'unknown';
    env.CACHE_METRICS.writeDataPoint({
      blobs: [response.headers.get('x-proxy-cache') || 'NONE', canon.route || 'root', String(colo)],
      doubles: [Number(response.headers.get('x-upstream-ms')) || 0, response.status],
      indexes: [canon.route || 'root'],
    });
  } catch {
    /* metrics must never affect a response */
  }
}

/**
 * Strongly consistent health-state coordinator shared by all API Worker isolates.
 * This object stores only operational health metadata, never user or request data.
 * It is intentionally request-driven: no alarm, Cron, or background polling is used.
 */
export class GatewayHealthCoordinator {
  private readonly ctx: DurableObjectStateLike;

  constructor(ctx: DurableObjectStateLike) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/registry' && request.method === 'GET') {
      const registry = await this.ctx.storage.get<GatewayRegistry | null>(GATEWAY_REGISTRY_KEY) || null;
      return Response.json({ ok: true, registry }, { headers: { 'cache-control': 'no-store' } });
    }

    if ((url.pathname === '/registry' && request.method === 'PUT') || (url.pathname === '/registry/seed' && request.method === 'POST')) {
      const text = await request.text();
      if (text.length > 65536) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });

      let payload: unknown;
      try { payload = JSON.parse(text || '{}'); } catch { return Response.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 }); }
      if (!isRecord(payload) || !isRecord(payload.registry) || !Number.isInteger(payload.registry.version) || Number(payload.registry.version) < 1) {
        return Response.json({ ok: false, error: 'INVALID_REGISTRY' }, { status: 400 });
      }
      const registryPayload = payload.registry;
      let conflictVersion: number | null = null;
      let seeded = false;

      await this.ctx.storage.transaction(async (txn) => {
        const currentValue = await txn.get<unknown>(GATEWAY_REGISTRY_KEY);
        const currentVersion = isRecord(currentValue) && Number.isInteger(currentValue.version) ? Number(currentValue.version) : 0;
        if (url.pathname === '/registry/seed') {
          if (!currentValue) {
            await txn.put(GATEWAY_REGISTRY_KEY, registryPayload);
            seeded = true;
          }
          return;
        }
        if (!Number.isInteger(payload.expectedVersion) || Number(payload.expectedVersion) !== currentVersion) {
          conflictVersion = currentVersion;
          return;
        }
        if (Number(registryPayload.version) !== currentVersion + 1) {
          conflictVersion = currentVersion;
          return;
        }
        await txn.put(GATEWAY_REGISTRY_KEY, registryPayload);
      });

      if (conflictVersion !== null) {
        return Response.json({ ok: false, error: 'REGISTRY_VERSION_CONFLICT', currentVersion: conflictVersion }, { status: 409 });
      }
      return Response.json({ ok: true, seeded }, { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const storedStates: unknown = await this.ctx.storage.get<unknown>(GATEWAY_HEALTH_STATE_KEY);
      const states = parseGatewayHealthStates(storedStates);
      const now = Date.now();
      const live: Record<string, GatewayHealthState> = {};
      for (const [key, state] of Object.entries(states)) {
        if (!state || !Number.isFinite(Number(state.updatedAt)) || now - Number(state.updatedAt) > GATEWAY_HEALTH_RETENTION_MS) continue;
        live[key] = state;
      }
      return Response.json({ ok: true, scope: 'central-durable-object' as const, states: live, updatedAt: new Date(now).toISOString() }, {
        headers: { 'cache-control': 'no-store' },
      });
    }

    if (request.method !== 'POST' || (url.pathname !== '/record' && url.pathname !== '/reconcile')) {
      return new Response('Not Found', { status: 404 });
    }

    const text = await request.text();
    const maxBodyLength = url.pathname === '/reconcile' ? 32768 : 4096;
    if (text.length > maxBodyLength) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });

    let payload: unknown;
    try { payload = JSON.parse(text || '{}'); } catch {
      return Response.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    if (!isRecord(payload)) return Response.json({ ok: false, error: 'INVALID_PAYLOAD' }, { status: 400 });

    if (url.pathname === '/reconcile') {
      if (!Array.isArray(payload.servers) || payload.servers.length > GATEWAY_MAX_SERVERS * 2 + GATEWAY_MAX_GO_TARGETS) {
        return Response.json({ ok: false, error: 'INVALID_SERVERS' }, { status: 400 });
      }
      const keep = new Set<string>();
      for (const server of payload.servers) {
        if (!isRecord(server) || typeof server.id !== 'string' || typeof server.url !== 'string' ||
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(server.id)) {
          return Response.json({ ok: false, error: 'INVALID_SERVER' }, { status: 400 });
        }
        keep.add(`${server.id}|${server.url}`);
      }
      await this.ctx.storage.transaction(async (txn) => {
        const states = parseGatewayHealthStates(await txn.get<unknown>(GATEWAY_HEALTH_STATE_KEY));
        let changed = false;
        for (const key of Object.keys(states)) {
          if (!keep.has(key)) { delete states[key]; changed = true; }
        }
        if (changed) await txn.put(GATEWAY_HEALTH_STATE_KEY, states);
      });
      return Response.json({ ok: true });
    }

    if (typeof payload.serverId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(payload.serverId) ||
        typeof payload.serverUrl !== 'string' || typeof payload.healthy !== 'boolean' ||
        (payload.source !== 'traffic' && payload.source !== 'probe')) {
      return Response.json({ ok: false, error: 'INVALID_HEALTH_EVENT' }, { status: 400 });
    }

    let serverUrl: URL;
    try {
      serverUrl = new URL(payload.serverUrl);
      if (serverUrl.protocol !== 'https:' || serverUrl.username || serverUrl.password || serverUrl.pathname !== '/' || serverUrl.search || serverUrl.hash) {
        throw new Error('invalid origin');
      }
    } catch {
      return Response.json({ ok: false, error: 'INVALID_SERVER_URL' }, { status: 400 });
    }

    const failureThreshold = Number.isInteger(payload.failureThreshold) ? Math.max(1, Math.min(10, Number(payload.failureThreshold))) : GATEWAY_FAILURE_THRESHOLD;
    const openMs = Number.isInteger(payload.openMs) ? Math.max(1000, Math.min(300000, Number(payload.openMs))) : GATEWAY_OPEN_MS;
    const status = Number.isInteger(payload.status) && Number(payload.status) >= 100 && Number(payload.status) <= 599 ? Number(payload.status) : null;
    const durationMs = Number.isFinite(payload.durationMs) ? Math.max(0, Math.min(GATEWAY_GO_MAX_TIMEOUT_MS, Number(payload.durationMs))) : null;
    const activeRequests = Number.isInteger(payload.activeRequests) && Number(payload.activeRequests) >= 0 && Number(payload.activeRequests) <= 100000 ? Number(payload.activeRequests) : null;
    const healthy = payload.healthy;
    const serverId = payload.serverId;
    const healthSource: HealthSource = payload.source;
    const quarantinedFlag = payload.quarantined === true;
    const clearQuarantineFlag = payload.clearQuarantine === true;
    const key = `${serverId}|${serverUrl.origin}`;
    const now = Date.now();
    let nextState: GatewayHealthState | undefined;

    await this.ctx.storage.transaction(async (txn) => {
      const states = parseGatewayHealthStates(await txn.get<unknown>(GATEWAY_HEALTH_STATE_KEY));
      const current = states[key] || { failures: 0, openUntil: 0 };
      const failures = healthy ? 0 : Math.min(100, (Number(current.failures) || 0) + 1);
      const openUntil = healthy ? 0 : failures >= failureThreshold ? now + openMs : Number(current.openUntil) || 0;
      let quarantined = current.quarantined === true;
      if (healthSource === 'probe' && quarantinedFlag) quarantined = true;
      if (healthSource === 'probe' && clearQuarantineFlag && healthy) quarantined = false;

      // Only real routed traffic contributes to adaptive balancing. Manual
      // probes update reachability but must not bias the workload algorithm.
      let sampleCount = Number(current.sampleCount) || 0;
      let ewmaDurationMs = Number.isFinite(current.ewmaDurationMs) ? Number(current.ewmaDurationMs) : null;
      let errorRate = Number.isFinite(current.errorRate) ? clampNumber(Number(current.errorRate), 0, 1) : 0;
      let ewmaActiveRequests = Number.isFinite(current.ewmaActiveRequests) ? Number(current.ewmaActiveRequests) : null;
      if (healthSource === 'traffic') {
        sampleCount = Math.min(1_000_000, sampleCount + 1);
        const alpha = sampleCount <= 5 ? 1 / sampleCount : 0.2;
        if (durationMs !== null && durationMs > 0) {
          ewmaDurationMs = ewmaDurationMs === null
            ? durationMs
            : (alpha * durationMs) + ((1 - alpha) * ewmaDurationMs);
        }
        errorRate = (alpha * (healthy ? 0 : 1)) + ((1 - alpha) * errorRate);
        if (activeRequests !== null) {
          ewmaActiveRequests = ewmaActiveRequests === null
            ? activeRequests
            : (alpha * activeRequests) + ((1 - alpha) * ewmaActiveRequests);
        }
      }

      const updatedState: GatewayHealthState = {
        failures,
        openUntil,
        quarantined,
        healthy,
        status,
        durationMs,
        ewmaDurationMs,
        errorRate,
        activeRequests: healthSource === 'traffic' ? activeRequests : (Number.isInteger(current.activeRequests) ? Number(current.activeRequests) : null),
        ewmaActiveRequests,
        sampleCount,
        checkedAt: new Date(now).toISOString(),
        source: healthSource,
        updatedAt: now,
      };
      nextState = updatedState;
      states[key] = updatedState;

      for (const [existingKey, value] of Object.entries(states)) {
        if (!value || now - Number(value.updatedAt || 0) > GATEWAY_HEALTH_RETENTION_MS) delete states[existingKey];
      }
      const entries = Object.entries(states);
      if (entries.length > 64) {
        entries.sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0));
        for (const [oldKey] of entries.slice(64)) delete states[oldKey];
      }
      await txn.put(GATEWAY_HEALTH_STATE_KEY, states);
    });

    if (!nextState) return Response.json({ ok: false, error: 'HEALTH_STATE_WRITE_FAILED' }, { status: 500 });
    return Response.json({ ok: true, state: nextState }, { headers: { 'cache-control': 'no-store' } });
  }
}

const SCHEDULED_WARM_CRON = '0 */6 * * *';
const SCHEDULED_PURGE_CRON = '30 3 * * *'; // UTC; removes expired cache and health-history rows.
const SCHEDULED_HEALTH_HISTORY_CRON = '*/15 * * * *'; // UTC; one batched snapshot per 15-minute bucket.
const GATEWAY_HEALTH_HISTORY_SCHEMA_INIT = new WeakMap<object, Promise<void>>();

async function ensureGatewayHealthHistorySchema(db: any): Promise<void> {
  const identity = db as object;
  const existing = GATEWAY_HEALTH_HISTORY_SCHEMA_INIT.get(identity);
  if (existing) return existing;
  const initialization = (async () => {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS gateway_health_history (
        server_id TEXT NOT NULL,
        server_url TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        healthy INTEGER,
        status INTEGER,
        duration_ms REAL,
        failures INTEGER NOT NULL,
        open_until INTEGER NOT NULL,
        quarantined INTEGER NOT NULL DEFAULT 0,
        error_rate REAL NOT NULL DEFAULT 0,
        ewma_duration_ms REAL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        checked_at TEXT,
        PRIMARY KEY (server_id, server_url, recorded_at)
      )`
    ).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_gateway_health_history_recorded_at ON gateway_health_history(recorded_at)').run();
  })().catch((error: unknown) => {
    GATEWAY_HEALTH_HISTORY_SCHEMA_INIT.delete(identity);
    throw error;
  });
  GATEWAY_HEALTH_HISTORY_SCHEMA_INIT.set(identity, initialization);
  return initialization;
}

/**
 * Persist one 15-minute snapshot from the Durable Object to D1.
 * The DO remains authoritative for real-time routing; D1 is an append-like,
 * bounded operational history and never participates in a request decision.
 */
async function exportGatewayHealthHistory(env: Env, nowMs = Date.now()): Promise<number> {
  const db = env && env.DB;
  const stub = gatewayHealthObject(env);
  if (!db || typeof db.batch !== 'function' || !stub) return 0;

  const response = await stub.fetch('https://gateway-health.internal/snapshot', { method: 'GET' });
  if (!response.ok) throw new Error(`health coordinator returned ${response.status}`);
  const payload: unknown = await response.json();
  const states = isRecord(payload) ? parseGatewayHealthStates(payload.states) : {};
  const recordedAt = Math.floor(nowMs / 1000 / GATEWAY_HEALTH_HISTORY_INTERVAL_SEC) * GATEWAY_HEALTH_HISTORY_INTERVAL_SEC;
  const statements = [];

  for (const [key, state] of Object.entries(states)) {
    const separator = key.indexOf('|');
    if (separator < 1) continue;
    const serverId = key.slice(0, separator);
    let serverUrl: URL;
    try {
      serverUrl = new URL(key.slice(separator + 1));
      if (serverUrl.protocol !== 'https:' || serverUrl.username || serverUrl.password || serverUrl.pathname !== '/' || serverUrl.search || serverUrl.hash) continue;
    } catch { continue; }

    statements.push(db.prepare(
      `INSERT INTO gateway_health_history (
        server_id, server_url, recorded_at, healthy, status, duration_ms,
        failures, open_until, quarantined, error_rate, ewma_duration_ms,
        sample_count, source, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id, server_url, recorded_at) DO UPDATE SET
        healthy = excluded.healthy, status = excluded.status, duration_ms = excluded.duration_ms,
        failures = excluded.failures, open_until = excluded.open_until,
        quarantined = excluded.quarantined, error_rate = excluded.error_rate,
        ewma_duration_ms = excluded.ewma_duration_ms, sample_count = excluded.sample_count,
        source = excluded.source, checked_at = excluded.checked_at`
    ).bind(
      serverId,
      serverUrl.origin,
      recordedAt,
      typeof state.healthy === 'boolean' ? (state.healthy ? 1 : 0) : null,
      Number.isInteger(state.status) ? state.status : null,
      Number.isFinite(state.durationMs) ? state.durationMs : null,
      Math.max(0, Math.floor(Number(state.failures) || 0)),
      Math.max(0, Math.floor(Number(state.openUntil) || 0)),
      state.quarantined === true ? 1 : 0,
      Math.max(0, Math.min(1, Number(state.errorRate) || 0)),
      Number.isFinite(state.ewmaDurationMs) ? state.ewmaDurationMs : null,
      Math.max(0, Math.floor(Number(state.sampleCount) || 0)),
      state.source === 'probe' ? 'probe' : state.source === 'traffic' ? 'traffic' : null,
      typeof state.checkedAt === 'string' ? state.checkedAt.slice(0, 40) : null,
    ));
  }

  if (!statements.length) return 0;
  await ensureGatewayHealthHistorySchema(db);
  await db.batch(statements);
  return statements.length;
}

async function pruneGatewayHealthHistory(db: any, now = Math.floor(Date.now() / 1000)): Promise<number> {
  if (!db) return 0;
  await ensureGatewayHealthHistorySchema(db);
  const cutoff = now - GATEWAY_HEALTH_HISTORY_RETENTION_SEC;
  const result = await db.prepare('DELETE FROM gateway_health_history WHERE recorded_at < ?').bind(cutoff).run();
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

const PREWARM_PATHS = [
  '/api/v1/home/static',
  '/api/v1/categories',
  '/api/v1/product-categories',
  '/api/v1/service-categories',
  '/api/v1/service-types',
  '/api/v1/store-types',
  '/api/v1/products?limit=10',
  '/api/v1/ads?limit=10',
  '/api/v1/stores?limit=10',
  '/api/v1/service-listings?limit=10',
  '/api/v1/service-providers?limit=10',
  '/api/v1/sellers/ranking?limit=20',
] as const;

async function runScheduledWarm(env: Env, ctx: ExecutionContextLike): Promise<void> {
  const origin = getRenderOrigin(env);
  const tasks = PREWARM_PATHS.map(async (path) => {
    const url = new URL(path, origin);
    const request = new Request(url, { method: 'GET', headers: { accept: 'application/json' } });
    await handleCacheable(request, canonicalize(url), ctx, env);
  });
  const results = await Promise.allSettled(tasks);
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed) console.warn(`[scheduled-cache-warm] ${failed}/${PREWARM_PATHS.length} warm requests failed`);
}

export default {
  async scheduled(event: { cron?: string }, env: Env, ctx: ExecutionContextLike): Promise<void> {
    if (event.cron === SCHEDULED_WARM_CRON) {
      ctx.waitUntil(runScheduledWarm(env, ctx));
      return;
    }
    if (event.cron === SCHEDULED_HEALTH_HISTORY_CRON) {
      ctx.waitUntil(exportGatewayHealthHistory(env).then((count) => {
        if (count) console.info(`[scheduled-health-history] stored ${count} server snapshots`);
      }).catch((error) => {
        console.error('[scheduled-health-history] export failed:', errorMessage(error));
      }));
      return;
    }
    if (event.cron === SCHEDULED_PURGE_CRON && (env as any).DB) {
      ctx.waitUntil(Promise.all([
        new D1KVAdapter((env as any).DB).deleteExpired(),
        pruneGatewayHealthHistory((env as any).DB),
      ]).then(([deletedCache, deletedHealth]) => {
        if (deletedCache) console.info(`[scheduled-d1-cleanup] removed ${deletedCache} expired cache rows`);
        if (deletedHealth) console.info(`[scheduled-d1-cleanup] removed ${deletedHealth} expired health-history rows`);
      }).catch((error) => {
        console.error('[scheduled-d1-cleanup] failed:', errorMessage(error));
      }));
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__warm__') return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });

    if (url.pathname === GO_GATEWAY_PREFIX || url.pathname.startsWith(`${GO_GATEWAY_PREFIX}/`)) {
      return handleGoGateway(request, url, env, ctx);
    }

    // The same gateway script can serve a separate public frontend hostname.
    // Match it before API-only maintenance endpoints so every app path is proxied.
    if (isFrontendGatewayHost(url, env)) {
      return handleFrontendGateway(request, url, env, ctx);
    }

    if (url.pathname === '/__gateway/feature-flags') {
      return handleFeatureFlagsAdmin(request, env);
    }

    if (url.pathname === '/__gateway/public-feature-flags') {
      return handleFeatureFlagsPublic(request, env);
    }

    if (url.pathname === '/__gateway/registry') {
      return handleGatewayAdmin(request, env);
    }

    // Backend invalidation endpoint. JSON {tags:[...]} purges native Workers
    // Cache entries; an empty body remains backward-compatible with the old KV
    // reference-tier flush used by purgeReferenceKv().
    if (url.pathname === '/__purge__') {
      const noStore = { 'content-type': 'application/json', 'cache-control': 'no-store' };
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
      const secret = env && env.PURGE_TOKEN;
      if (!secret || !timingSafeEqual(request.headers.get('x-purge-token'), secret)) {
        return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status: 403, headers: noStore });
      }
      let purgeMode: 'tags' | 'kv' = 'kv';
      try {
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (declaredLength > 16384) return new Response(JSON.stringify({ ok: false, error: 'PURGE_REQUEST_TOO_LARGE' }), { status: 413, headers: noStore });
        const body = await request.text();
        if (body.length > 16384) return new Response(JSON.stringify({ ok: false, error: 'PURGE_REQUEST_TOO_LARGE' }), { status: 413, headers: noStore });
        if (body.trim()) {
          let payload: unknown;
          try { payload = JSON.parse(body); } catch {
            return new Response(JSON.stringify({ ok: false, error: 'INVALID_JSON' }), { status: 400, headers: noStore });
          }
          if (!isRecord(payload) || !Array.isArray(payload.tags) || payload.tags.length < 1 || payload.tags.length > 30) {
            return new Response(JSON.stringify({ ok: false, error: 'INVALID_PURGE_TAGS', maxTags: 30 }), { status: 400, headers: noStore });
          }
          const tags = [...new Set(payload.tags)];
          if (tags.some((tag) => typeof tag !== 'string' || tag.length < 1 || tag.length > 256 || !/^[\x21-\x7E]+$/.test(tag))) {
            return new Response(JSON.stringify({ ok: false, error: 'INVALID_PURGE_TAG' }), { status: 400, headers: noStore });
          }
          purgeMode = 'tags';
          // Purge both tiers independently: a missing/failed native Cache API
          // must not leave stale D1 rows behind. Any partial failure returns 503
          // so the API's existing retry queue can retry the complete tag batch.
          const nativePurge = ctx.cache && typeof ctx.cache.purge === 'function'
            ? ctx.cache.purge({ tags })
            : Promise.reject(new Error('WORKERS_CACHE_PURGE_UNAVAILABLE'));
          const [nativeResult, referenceResult] = await Promise.allSettled([
            nativePurge,
            kvPurgeByTags(env, tags),
          ]);
          const purgedReferenceEntries = referenceResult.status === 'fulfilled'
            ? referenceResult.value
            : null;
          if (nativeResult.status === 'rejected' || referenceResult.status === 'rejected') {
            const error = nativeResult.status === 'rejected'
              ? (errorMessage(nativeResult.reason) === 'WORKERS_CACHE_PURGE_UNAVAILABLE'
                ? 'WORKERS_CACHE_PURGE_UNAVAILABLE'
                : 'WORKERS_CACHE_PURGE_FAILED')
              : 'REFERENCE_CACHE_PURGE_FAILED';
            console.error('[purge] partial tag purge failure', {
              error,
              nativeError: nativeResult.status === 'rejected' ? errorMessage(nativeResult.reason) : null,
              referenceError: referenceResult.status === 'rejected' ? errorMessage(referenceResult.reason) : null,
              purgedReferenceEntries,
            });
            return new Response(JSON.stringify({ ok: false, error, purgedReferenceEntries }), { status: 503, headers: noStore });
          }
          return new Response(JSON.stringify({
            ok: true,
            purgedTags: tags.length,
            purgedReferenceEntries,
          }), { headers: noStore });
        }
        const deleted = await kvPurgeAll(env);
        return new Response(JSON.stringify({ ok: true, deleted }), { headers: noStore });
      } catch (error) {
        console.error('[purge] cache/KV purge failed', errorMessage(error));
        return new Response(JSON.stringify({ ok: false, error: purgeMode === 'tags' ? 'WORKERS_CACHE_PURGE_FAILED' : 'KV_PURGE_FAILED' }), { status: 503, headers: noStore });
      }
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), 'cache-control': 'no-store' } });
    }

    const isGet = request.method === 'GET' || request.method === 'HEAD';
    const hasAuth = request.headers.has('authorization') || request.headers.has('cookie');
    const canon = canonicalize(url);
    const deliberatelyPrivatePath =
      canon.path === '/api/v1/home/feed' ||
      canon.path === '/api/v1/home/for-you' ||
      canon.path === '/api/v1/recommendations' ||
      canon.path.startsWith('/api/v1/recommendations/');
    const isCacheable =
      isGet &&
      !hasAuth &&
      !deliberatelyPrivatePath &&
      CACHEABLE_PREFIXES.some((p) => canon.path === p || canon.path.startsWith(`${p}/`));

    if (isCacheable) {
      if (canon.pairs.length > MAX_PARAMS || canon.key.length > MAX_KEY_LENGTH) {
        const res = await handlePassthrough(request, url, env, ctx);
        res.headers.set('x-proxy-cache', 'BYPASS-SHAPE');
        recordMetric(env, canon, res, request);
        return res;
      }
      const res = await handleCacheable(request, canon, ctx, env);
      recordMetric(env, canon, res, request);
      return res;
    }
    return handlePassthrough(request, url, env, ctx);
  },
};
