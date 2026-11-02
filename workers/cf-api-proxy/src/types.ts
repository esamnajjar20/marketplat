/** Shared runtime contracts for the MarketPlat Cloudflare gateway. */
export type GatewayKind = 'backend' | 'frontend';
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

export type GatewayServer = BackendServer | FrontendServer;

export interface GatewayPool<T extends GatewayServer = GatewayServer> {
  strategy: 'weighted-random';
  servers: T[];
}

export interface GatewayRegistry {
  version: number;
  strategy: 'weighted-random' | 'single-origin-fallback';
  backend: GatewayPool<BackendServer>;
  frontend: GatewayPool<FrontendServer>;
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
  PURGE_TOKEN?: string;
  REFERENCE_KV?: KVNamespaceLike;
  GATEWAY_HEALTH?: DurableObjectNamespaceLike;
  CACHE_METRICS?: AnalyticsDatasetLike;
}

export interface CloudflareRequest extends Request {
  cf?: { colo?: string };
}

export interface FrontendReleasePayload {
  buildId?: string;
}
