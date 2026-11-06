/** Shared runtime contracts for the MarketPlat Cloudflare gateway. */
export type GatewayKind = 'backend' | 'frontend' | 'go';
export type RegistrySource = 'durable-object' | 'kv' | 'env-fallback' | 'kv-compatibility-fallback';
export type HealthSource = 'traffic' | 'probe';

export interface BackendServer {
  id: string;
  url: string;
  weight: number;
  priority: number;
  timeoutMs: number;
  enabled: boolean;
  provider: string;
  region: string;
  healthPath: string;
  healthKind: 'backend';
  buildId?: never;
  releasePath?: never;
}

export interface FrontendServer {
  id: string;
  url: string;
  weight: number;
  priority: number;
  timeoutMs: number;
  enabled: boolean;
  provider: string;
  region: string;
  healthPath: string;
  healthKind: 'frontend';
  buildId: string;
  releasePath: string;
}

export interface GoWorkerServer {
  /** Unique target id. Multiple targets may share serviceKey and routePrefix. */
  id: string;
  /** Logical Go service name, e.g. analytics, notifications, maintenance. */
  serviceKey: string;
  /** Gateway-visible internal path prefix selected by longest-prefix match. */
  routePrefix: string;
  /** Path prefix expected by the upstream Go service. */
  upstreamPrefix: string;
  url: string;
  weight: number;
  /** Manual share within this service/priority tier, normalized to 0-100. */
  manualSharePercent: number;
  priority: number;
  timeoutMs: number;
  enabled: boolean;
  provider: string;
  region: string;
  healthPath: string;
  healthKind: 'go';
  buildId?: never;
  releasePath?: never;
}

export type GatewayServer = BackendServer | FrontendServer | GoWorkerServer;

export interface GatewayAdaptivePolicy {
  enabled: boolean;
  /** 0 = manual weights only; 100 = maximum latency/error feedback. */
  sensitivity: number;
}

export interface GatewayPool<T extends GatewayServer = GatewayServer> {
  strategy: 'weighted-random';
  servers: T[];
  adaptive?: GatewayAdaptivePolicy;
}

export interface GatewayRegistry {
  version: number;
  strategy: 'weighted-random' | 'single-origin-fallback';
  backend: GatewayPool<BackendServer>;
  frontend: GatewayPool<FrontendServer>;
  go: GatewayPool<GoWorkerServer>;
  updatedAt: string | null;
}

export interface GatewayHealthState {
  failures: number;
  openUntil: number;
  quarantined?: boolean;
  healthy?: boolean;
  status?: number | null;
  durationMs?: number | null;
  checkedAt?: string | null;
  source?: HealthSource;
  updatedAt?: number;
  /** Traffic-only exponentially weighted moving average. */
  ewmaDurationMs?: number | null;
  /** Traffic-only EWMA failure ratio from 0 to 1. */
  errorRate?: number;
  /** Latest active internal requests reported by this Go process. */
  activeRequests?: number | null;
  /** Traffic-only EWMA of active internal requests. */
  ewmaActiveRequests?: number | null;
  sampleCount?: number;
}

export interface GatewayHealthSnapshot {
  states: Record<string, GatewayHealthState>;
  scope: 'central-durable-object' | 'single-worker-isolate';
  updatedAt: string | null;
}

export interface GatewayRegistryLoad {
  registry: GatewayRegistry;
  source: RegistrySource;
}

export interface RegistryCacheEntry {
  binding: string;
  expiresAt: number;
  value: GatewayRegistryLoad;
}

export interface HealthSnapshotCacheEntry {
  binding: DurableObjectNamespaceLike | undefined;
  expiresAt: number;
  value: GatewayHealthSnapshot;
}

export interface GatewayFailureState {
  failures: number;
  openUntil: number;
  quarantined: boolean;
}

export interface GatewayTarget {
  pathname: string;
  search: string;
}

export interface GatewayRouteResult {
  res: Response | null;
  serverId: string | null;
  attempts: number;
  ms: number;
  mode: string;
  error?: string;
}

export interface UpstreamResult {
  res: Response | null;
  ms: number;
  error?: string;
}

export interface ResponseDescriptor {
  status: number;
  body: ArrayBuffer | string;
  cacheable: boolean;
  etag: string | null;
  headers: Headers;
}

export interface CanonicalUrl {
  path: string;
  key: string;
  pairs: Array<[string, string]>;
  route: string;
  search: string;
  rest: string[];
}

export interface StoredCacheMetadata {
  contentType?: string;
  ttl: number;
  swr: number;
  clientCc: string;
  storedAt: number;
  etag?: string | null;
  vary?: string | null;
  tags?: string | null;
  neg?: boolean;
}

export interface ReferenceCacheMetadata {
  ct: string;
  etag: string | null;
  vary: string | null;
  ttl: number;
  swr: number;
  bcc: number;
  storedAt: number;
  /** Cache-Tag vocabulary shared with edgePurge.ts for selective D1 invalidation. */
  tags?: string[];
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<T>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  /** Executes a group of prepared statements as one D1 batch. */
  batch?<T = unknown>(statements: D1PreparedStatementLike[]): Promise<T[]>;
}

export interface ReferenceCacheRead {
  body: ArrayBuffer;
  meta: ReferenceCacheMetadata;
  age: number;
}

export interface ProcessUpstreamArgs {
  canon: CanonicalUrl;
  cache: Cache;
  cacheKey: Request;
  ctx: ExecutionContextLike;
  env: Env;
  awaitStore?: boolean;
}

export interface RevalidateArgs extends ProcessUpstreamArgs {
  request: Request;
  stale: Response;
  renderOrigin: string;
}

export interface OriginLoadArgs extends ProcessUpstreamArgs {
  request: Request;
  renderOrigin: string;
}

export interface CacheStoreOptions extends StoredCacheMetadata {}

export interface HealthRecordDetails {
  status?: number | null;
  durationMs?: number | null;
  activeRequests?: number | null;
  failureThreshold?: number;
  quarantined?: boolean;
  clearQuarantine?: boolean;
}

export interface ProbeResult {
  kind: GatewayKind;
  id: string;
  enabled: boolean;
  healthy: boolean | null;
  status: number | null;
  durationMs: number;
  detail: string;
  buildId?: string;
}

export interface KVListResult {
  keys: Array<{ name: string }>;
  list_complete: boolean;
  cursor?: string;
}

export interface KVNamespaceLike {
  get(key: string, type: 'json'): Promise<unknown>;
  getWithMetadata<T = ReferenceCacheMetadata>(key: string, type: 'arrayBuffer'): Promise<{ value: ArrayBuffer | null; metadata: T | null }>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KVListResult>;
  delete(key: string): Promise<void>;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface DurableObjectTransactionLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  transaction<T>(callback: (transaction: DurableObjectTransactionLike) => Promise<T>): Promise<T>;
}

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  /** Native Workers Cache control plane (available when [cache].enabled = true). */
  cache?: { purge(options: { tags?: string[]; pathPrefixes?: string[] }): Promise<unknown> };
}

export interface AnalyticsDatasetLike {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface Env {
  RENDER_ORIGIN?: string;
  FRONTEND_ORIGIN?: string;
  FRONTEND_GATEWAY_HOSTS?: string;
  GATEWAY_ALLOWED_HOSTS?: string;
  GATEWAY_ADMIN_TOKEN?: string;
  /** Dedicated token for the private D1 feature-flag control plane. */
  FEATURE_FLAGS_ADMIN_TOKEN?: string;
  /** Shared secret used by Express to authenticate requests entering the Go gateway. */
  GO_WORKER_TOKEN?: string;
  GO_WORKER_TOKENS_JSON?: string;
  PURGE_TOKEN?: string;
  REFERENCE_KV?: KVNamespaceLike;
  DB?: D1DatabaseLike;
  SEARCH_CACHE_WHITELIST?: string;
  /** Set true only after Express-to-Worker tag invalidation is enabled and verified. */
  REFERENCE_CACHE_LONG_TTL_ENABLED?: string;
  GATEWAY_HEALTH?: DurableObjectNamespaceLike;
  CACHE_METRICS?: AnalyticsDatasetLike;
}

export interface CloudflareRequest extends Request {
  cf?: { colo?: string };
}

export interface FrontendReleasePayload {
  buildId?: string;
}
