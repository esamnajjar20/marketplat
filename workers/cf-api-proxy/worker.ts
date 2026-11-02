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
  GatewayKind,
  GatewayRegistry,
  GatewayRegistryLoad,
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
 * MarketPlat Smart Cache & Gateway Worker v6
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
 * - #10 Optional Workers KV tier (binding REFERENCE_KV) for near-static reference
 *       data (categories & co.): KV -> background refresh, ~0 origin queries.
 * - #8  Cache-Tag header on every stored response + POST /__purge__ (KV flush).
 *       Tag-based purging itself is done by the backend through the Cloudflare API.
 * - Fix: single-flight shared a Response whose body was already consumed.
 *
 * Keeps v4 cache behavior and adds a KV-backed dynamic backend registry, weighted
 * routing, passive circuit breaking, and safe GET/HEAD failover. A SQLite-backed
 * Durable Object coordinates backend health across isolates; each isolate caches
 * that snapshot briefly and keeps a local fallback. Cache warm-up remains disabled.
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

// Workers KV tier (#10)
const REFERENCE_ROUTES = new Set([
  'categories',
  'product-categories',
  'service-categories',
  'service-types',
  'store-types',
]);
const KV_PREFIX = 'ref:v1:';
const KV_FRESH_SEC = 900; // serve from KV without touching the origin
const KV_STALE_SEC = 86400; // keep serving (and refresh in background) up to 24h
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
const GATEWAY_REGISTRY_CACHE_MS = 15000;
const GATEWAY_MAX_SERVERS = 16;
const GATEWAY_DEFAULT_TIMEOUT_MS = 20000;
const GATEWAY_FAILURE_THRESHOLD = 2;
const GATEWAY_OPEN_MS = 30000;
const GATEWAY_HEALTH_STATE_KEY = 'health:backend:v1';
const GATEWAY_HEALTH_OBJECT_NAME = 'backend-pool-v1';
const GATEWAY_REGISTRY_OBJECT_NAME = 'gateway-registry-v1';
const FRONTEND_RELEASE_COOKIE = '__Host-mp-frontend-release';
const GATEWAY_HEALTH_CACHE_MS = 5000;
const GATEWAY_HEALTH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const gatewayFailures = new Map<string, GatewayFailureState>(); // fast local mirror; central state is persisted in Durable Objects
let gatewayRegistryCache: RegistryCacheEntry | null = null;
let gatewayHealthSnapshotCache: HealthSnapshotCacheEntry | null = null;

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
function validateGatewayServer(server: unknown, env: Env, kind: GatewayKind, ids: Set<string>): GatewayServer {
  if (!isRecord(server)) throw new Error(`Each ${kind} server must be an object`);
  const id = String(server.id || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) throw new Error(`${kind} server id must be 1-64 safe characters`);
  if (ids.has(id)) throw new Error(`Duplicate ${kind} server id: ${id}`);
  ids.add(id);

  const weight = Number(server.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new Error(`Invalid weight for ${id}; expected integer 1-1000`);
  const priority = server.priority === undefined || server.priority === null ? 100 : Number(server.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 1000) throw new Error(`Invalid priority for ${id}; expected integer 1-1000 (lower number wins)`);
  const timeoutMs = server.timeoutMs === undefined || server.timeoutMs === null ? GATEWAY_DEFAULT_TIMEOUT_MS : Number(server.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error(`Invalid timeoutMs for ${id}; expected integer 1000-30000`);
  if (typeof server.enabled !== 'boolean') throw new Error(`Server ${id} must have an enabled boolean`);

  const url = validateBackendOrigin(server.url, env, kind === 'frontend' ? 'Frontend' : 'Backend');
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
    healthPath: validateGatewayPath(server.healthPath, kind === 'frontend' ? '/build-id.json' : '/health', `${kind} healthPath`),
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

  return {
    version: Number.isInteger(input.version) && Number(input.version) > 0 ? Number(input.version) : 1,
    strategy: 'weighted-random',
    backend: { strategy: 'weighted-random', servers: backendServers },
    frontend: { strategy: 'weighted-random', servers: frontendServers },
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
  const now = Date.now();
  const cacheBinding = `${Boolean(env && env.REFERENCE_KV)}:${Boolean(env && env.GATEWAY_HEALTH)}`;
  if (!force && gatewayRegistryCache && gatewayRegistryCache.binding === cacheBinding && now < gatewayRegistryCache.expiresAt) {
    return gatewayRegistryCache.value;
  }

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
      const stored = await env.REFERENCE_KV.get(GATEWAY_REGISTRY_KEY, 'json');
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
  gatewayRegistryCache = { binding: cacheBinding, expiresAt: now + GATEWAY_REGISTRY_CACHE_MS, value: result };
  return result;
}

function weightedOrder<T extends GatewayServer>(servers: T[]): T[] {
  return servers.map((server) => ({
    server,
    score: -Math.log(Math.max(Math.random(), 1e-12)) / server.weight,
  })).sort((a, b) => a.score - b.score).map((entry) => entry.server);
}

function backendStateKey(server: GatewayServer): string {
  const healthId = server.healthKind === 'frontend' ? `frontend-${server.id}` : server.id;
  return `${healthId}|${server.url}`;
}

function gatewayHealthId(server: GatewayServer): string {
  return server.healthKind === 'frontend' ? `frontend-${server.id}` : server.id;
}

function weightedPriorityOrder<T extends GatewayServer>(servers: T[]): T[] {
  const tiers = new Map();
  for (const server of servers) {
    const priority = Number.isInteger(server.priority) ? server.priority : 100;
    if (!tiers.has(priority)) tiers.set(priority, []);
    tiers.get(priority).push(server);
  }
  return [...tiers.keys()].sort((a, b) => a - b).flatMap((priority) => weightedOrder(tiers.get(priority)));
}

function backendCandidates<T extends GatewayServer>(servers: T[], now = Date.now()): T[] {
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
  if (healthy.length) return [...weightedPriorityOrder(healthy), ...open.sort((a, b) => {
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
  return status === 502 || status === 503 || status === 504;
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
        durationMs: Number.isFinite(details.durationMs) ? Math.max(0, Math.min(30000, Number(details.durationMs))) : null,
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
async function probeGatewayServers(env: Env): Promise<{ ok: boolean; source: RegistrySource; checkedAt: string; scope: string; stateScope: string; results: ProbeResult[] }> {
  const { registry, source } = await loadGatewayRegistry(env, true);
  const checkedAt = new Date().toISOString();
  const probeOne = async (server: GatewayServer, kind: GatewayKind): Promise<ProbeResult> => {
    if (!server.enabled) return { kind, id: server.id, enabled: false, healthy: null, status: null, durationMs: 0, detail: 'disabled' };
    const startedAt = Date.now();
    try {
      const healthResponse = await fetch(new URL(server.healthPath || '/health', server.url).toString(), {
        method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(4000),
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

  const results = await Promise.all([
    ...registry.backend.servers.map((server) => probeOne(server, 'backend')),
    ...registry.frontend.servers.map((server) => probeOne(server, 'frontend')),
  ]);
  return {
    ok: results.every((result) => result.healthy !== false),
    source,
    checkedAt,
    scope: 'single-request-location',
    stateScope: gatewayHealthObject(env) ? 'central-durable-object' : 'single-worker-isolate',
    results,
  };
}

/**
 * Route one request through the configured backend pool. Only GET/HEAD are retried
 * automatically; mutating requests are never replayed because the first upstream
 * may have committed the operation before the connection failed.
 */
async function fetchBackend(pathAndSearch: string, initFactory: RequestInit | ((server: GatewayServer) => RequestInit), env: Env, retrySafe = false, ctx: ExecutionContextLike | null = null, poolKind: GatewayKind = 'backend', preferredServerId: string | null = null): Promise<GatewayRouteResult> {
  const { registry, source } = await loadGatewayRegistry(env);
  await loadGatewayHealthSnapshot(env);
  let requestTarget;
  try { requestTarget = normalizeGatewayRequestTarget(pathAndSearch); } catch (error) {
    return { res: new Response(JSON.stringify({ success: false, code: 'INVALID_PROXY_PATH', message: 'The requested path is not a valid same-origin path.' }), { status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }), serverId: null, attempts: 0, ms: 0, mode: 'rejected', error: errorMessage(error) };
  }
  const poolServers: GatewayServer[] = poolKind === 'frontend' ? registry.frontend.servers : registry.backend.servers;
  const candidates = backendCandidates(poolServers);
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
  const maxAttempts = retryAllowed ? candidates.length : Math.min(1, candidates.length);
  let totalMs = 0;
  let last = null;

  for (const server of candidates.slice(0, maxAttempts)) {
    try {
      const init = typeof initFactory === 'function' ? initFactory(server) : initFactory;
      const targetUrl = buildGatewayTargetUrl(server.url, requestTarget);
      const timeoutSignal = AbortSignal.timeout(server.timeoutMs || GATEWAY_DEFAULT_TIMEOUT_MS);
      const requestSignal = init.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      const timedInit = { ...init, signal: requestSignal };
      const result = await fetchUpstream(targetUrl, timedInit);
      totalMs += result.ms;
      last = { ...result, serverId: server.id, attempts: (last ? last.attempts : 0) + 1, mode: source === 'env-fallback' ? 'fallback' : 'pool' };
      if (!result.res || isFailoverStatus(result.res.status)) {
        recordBackendResult(server, false);
        void scheduleGatewayHealthWrite(env, ctx, server, false, {
          status: result.res ? result.res.status : null,
          durationMs: result.ms,
        }, 'traffic');
        if (retryAllowed) {
          try { if (result.res && result.res.body) await result.res.body.cancel(); } catch { /* discard failed upstream body */ }
          continue;
        }
        return { ...last, ms: totalMs };
      }
      const hadFailure = gatewayFailures.has(backendStateKey(server));
      recordBackendResult(server, true);
      if (hadFailure) {
        void scheduleGatewayHealthWrite(env, ctx, server, true, { status: result.res.status, durationMs: result.ms }, 'traffic');
      }
      return { ...last, ms: totalMs };
    } catch (error) {
      recordBackendResult(server, false);
      void scheduleGatewayHealthWrite(env, ctx, server, false, { status: null, durationMs: 0 }, 'traffic');
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
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, PUT, POST' } });
  }
  if (!env || !env.REFERENCE_KV) {
    return new Response(JSON.stringify({ ok: false, error: 'GATEWAY_KV_NOT_CONFIGURED' }), {
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
    if (!payload || payload.action !== 'probe') {
      return new Response(JSON.stringify({ ok: false, error: 'UNSUPPORTED_GATEWAY_ACTION' }), {
        status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    const result = await probeGatewayServers(env);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  if (request.method === 'GET') {
    const current = await loadGatewayRegistry(env, true);
    const healthSnapshot = await loadGatewayHealthSnapshot(env, true);
    const health = [
      ...current.registry.backend.servers.map((server) => ({ ...server, kind: 'backend' })),
      ...current.registry.frontend.servers.map((server) => ({ ...server, kind: 'frontend' })),
    ].map((server) => {
      const state = healthSnapshot.states[backendStateKey(server)] || null;
      const openUntil = state ? Number(state.openUntil) || 0 : 0;
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
          await env.REFERENCE_KV.put(GATEWAY_REGISTRY_KEY, JSON.stringify(next));
          replicaStatus = 'synced';
        } catch (replicaError) {
          replicaStatus = 'write-failed';
          console.error('[gateway] registry KV replica write failed', errorMessage(replicaError));
        }
      }
    } else if (env.REFERENCE_KV) {
      // Compatibility path for local development only. Production should bind the
      // coordinator so registry writes have atomic compare-and-swap semantics.
      await env.REFERENCE_KV.put(GATEWAY_REGISTRY_KEY, JSON.stringify(next));
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
  gatewayRegistryCache = { binding: cacheBinding, expiresAt: Date.now() + GATEWAY_REGISTRY_CACHE_MS, value: { registry: next, source: registrySource } };
  await reconcileGatewayHealth(env, [...next.backend.servers, ...next.frontend.servers]);
  const propagation = registrySource === 'durable-object'
    ? 'السجل الأساسي مركزي ومتسق؛ قد تحتفظ بعض نسخ Worker بالنسخة المحلية لمدة تصل إلى 15 ثانية.'
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
  for (const [rawKey, rawValue] of searchParams) {
    const key = rawKey.normalize('NFC').trim();
    if (!key || IGNORED_PARAM.test(key)) continue;
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
  if (o.tags) h.set('cache-tag', o.tags);
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
      tags: stored.headers.get('cache-tag'),
      age: info.age,
      cacheStatus,
      ms,
      ttl: info.ttl,
    }),
  };
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
    h.set('access-control-allow-origin', origin || '*');
    h.set('access-control-allow-credentials', 'true');
    return new Response(null, { status: 304, headers: h });
  }
  const fh = new Headers(desc.headers);
  fh.set('access-control-allow-origin', origin || '*');
  fh.set('access-control-allow-credentials', 'true');
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

/* ───────────────────────── Workers KV tier (#10) ───────────────────────── */

function kvEnabled(env: Env, canon: CanonicalUrl): boolean {
  return Boolean(
    env && env.REFERENCE_KV && REFERENCE_ROUTES.has(canon.route) && canon.key.length <= KV_MAX_KEY,
  );
}

async function kvRead(env: Env, canon: CanonicalUrl): Promise<ReferenceCacheRead | null> {
  const kv = env.REFERENCE_KV;
  if (!kv || !kvEnabled(env, canon)) return null;
  try {
    const { value, metadata } = await kv.getWithMetadata(KV_PREFIX + canon.key, 'arrayBuffer');
    if (!value || !metadata || !metadata.storedAt) return null;
    return { body: value, meta: metadata, age: Math.max(0, (Date.now() - metadata.storedAt) / 1000) };
  } catch {
    return null;
  }
}

async function kvWrite(env: Env, canon: CanonicalUrl, body: ArrayBuffer, meta: ReferenceCacheMetadata): Promise<void> {
  const kv = env.REFERENCE_KV;
  if (!kv || !kvEnabled(env, canon) || body.byteLength > KV_MAX_BODY) return;
  try {
    await kv.put(KV_PREFIX + canon.key, body, {
      expirationTtl: KV_STALE_SEC + KV_FRESH_SEC,
      metadata: meta,
    });
  } catch {
    /* KV is an optimisation: never fail a request because of it */
  }
}

async function kvPurgeAll(env: Env): Promise<number> {
  if (!env || !env.REFERENCE_KV) return 0;
  let deleted = 0;
  let cursor;
  do {
    const page = await env.REFERENCE_KV.list({ prefix: KV_PREFIX, ...(cursor ? { cursor } : {}) });
    for (const k of page.keys) {
      await env.REFERENCE_KV.delete(k.name);
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
  // Network error / 5xx -> stale-on-error
  if (!upstream || upstream.status >= 500) {
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
      const kvTask = kvWrite(env, canon, body, { ct: contentType, etag, vary, ttl, swr, bcc: browserMaxAge, storedAt });
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
    await safeCachePut(cache,
      cacheKey,
      buildStored(body, {
        contentType: stale.headers.get('content-type') || 'application/json',
        etag,
        vary: stale.headers.get('vary'),
        tags: stale.headers.get('cache-tag'),
        ttl: info.ttl,
        swr: info.swr,
        clientCc: stale.headers.get('x-mp-client-cc') || clientCacheControl(0, info.ttl, info.swr),
        storedAt: Date.now(),
      }),
    );
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
        cacheStatus: kv.age <= KV_FRESH_SEC ? 'KV-HIT' : 'KV-STALE',
        ms: 0,
        ttl: m.ttl,
      }),
    };
    if (kv.age <= KV_STALE_SEC) {
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
      if (kv.age > KV_FRESH_SEC) {
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

    const init: RequestInit = { method, headers, redirect: 'manual' };
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

  // Never cache or transform Server-Sent Events. Preserve streaming through the
  // Worker so notification frames/heartbeats reach mobile clients promptly.
  if (url.pathname.endsWith('/notifications/stream')) {
    h.set('cache-control', 'no-cache, no-transform');
    h.set('x-accel-buffering', 'no');
    h.delete('content-length');
    h.delete('content-encoding');
  }

  return new Response(upstream.body, { status: upstream.status, headers: h });
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
  headers.set('cache-control', routed.res.headers.get('cache-control') || 'no-store');
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
    if (text.length > 4096) return Response.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });

    let payload: unknown;
    try { payload = JSON.parse(text || '{}'); } catch {
      return Response.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    if (!isRecord(payload)) return Response.json({ ok: false, error: 'INVALID_PAYLOAD' }, { status: 400 });

    if (url.pathname === '/reconcile') {
      if (!Array.isArray(payload.servers) || payload.servers.length > GATEWAY_MAX_SERVERS * 2) {
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
    const durationMs = Number.isFinite(payload.durationMs) ? Math.max(0, Math.min(30000, Number(payload.durationMs))) : null;
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

      const updatedState: GatewayHealthState = {
        failures,
        openUntil,
        quarantined,
        healthy,
        status,
        durationMs,
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__warm__') return new Response('Not Found', { status: 404 });

    // The same gateway script can serve a separate public frontend hostname.
    // Match it before API-only maintenance endpoints so every app path is proxied.
    if (isFrontendGatewayHost(url, env)) {
      return handleFrontendGateway(request, url, env, ctx);
    }

    if (url.pathname === '/__gateway/registry') {
      return handleGatewayAdmin(request, env);
    }

    // Backend-triggered flush of the KV reference tier (#10). Cache API entries of
    // reference routes expire on their own within minutes; KV would otherwise keep
    // serving a changed category list for up to KV_FRESH_SEC.
    if (url.pathname === '/__purge__') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      const secret = env && env.PURGE_TOKEN;
      if (!secret || !timingSafeEqual(request.headers.get('x-purge-token'), secret)) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        const deleted = await kvPurgeAll(env);
        return new Response(JSON.stringify({ ok: true, deleted }), {
          headers: { 'content-type': 'application/json' },
        });
      } catch (error) {
        console.error('[purge] KV purge failed', errorMessage(error));
        return new Response(JSON.stringify({ ok: false, error: 'KV_PURGE_FAILED' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
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
