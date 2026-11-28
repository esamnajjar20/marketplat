/**
 * Unified, configuration-driven MarketPlat API load test.
 * Run with: k6 run -e TARGET=https://staging.example.test apps/api/load-tests/unified.js
 */
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import routeInventory from './catalog/route-inventory.js';
import workload from './config/workload.config.js';

const RUN_ID = __ENV.LOAD_TEST_RUN_ID || `marketplat-${Date.now()}`;
const TARGET = (__ENV.TARGET || __ENV.LOAD_TEST_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_PREFIX = String(workload.apiPrefix || '/api/v1').replace(/\/+$/, '');
const ROOT_TARGET = TARGET.endsWith(API_PREFIX) ? TARGET.slice(0, -API_PREFIX.length) : TARGET;
const API_ROOT = TARGET.endsWith(API_PREFIX) ? TARGET : `${TARGET}${API_PREFIX}`;
const PROFILE = String(__ENV.PROFILE || 'smoke').toLowerCase();
const LOAD_MODEL = String(__ENV.LOAD_MODEL || 'vus').toLowerCase();
const SELECTION_STRATEGY = String(__ENV.SELECTION_STRATEGY || 'round-robin').toLowerCase();
if (!['smoke', 'standard', 'stress', 'spike', 'soak'].includes(PROFILE)) throw new Error(`Unsupported PROFILE: ${PROFILE}`);
if (!['vus', 'arrival-rate'].includes(LOAD_MODEL)) throw new Error(`Unsupported LOAD_MODEL: ${LOAD_MODEL}`);
if (!['round-robin', 'weighted'].includes(SELECTION_STRATEGY)) throw new Error(`Unsupported SELECTION_STRATEGY: ${SELECTION_STRATEGY}`);
function positiveNumber(name, fallback, integer = false) {
  const raw = __ENV[name];
  const value = raw === undefined || raw === '' ? Number(fallback) : Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be a ${integer ? 'positive integer' : 'positive number'}; received ${raw}`);
  }
  return value;
}
function ratio(name, fallback) {
  const value = positiveNumber(name, fallback);
  if (value > 1) throw new Error(`${name} must be between 0 and 1; received ${value}`);
  return value;
}
const PEAK_VUS = positiveNumber('PEAK_VUS', __ENV.MAX_VUS || 10, true);
const PRE_ALLOCATED_VUS = positiveNumber('PRE_ALLOCATED_VUS', Math.min(PEAK_VUS, 50), true);
const MAX_VUS = Math.max(PRE_ALLOCATED_VUS, positiveNumber('MAX_VUS', Math.max(PEAK_VUS * 2, 50), true));
const DURATION_SECONDS = positiveNumber('DURATION_SECONDS', 60);
const RAMP_SECONDS = positiveNumber('RAMP_SECONDS', 15);
const REQUEST_RATE = positiveNumber('REQUEST_RATE', 100, true);
const ERROR_RATE_LIMIT = ratio('ERROR_RATE_LIMIT', workload.thresholds.errorRate);
const P95_LIMIT_MS = positiveNumber('P95_LIMIT_MS', workload.thresholds.p95Ms);
const P99_LIMIT_MS = positiveNumber('P99_LIMIT_MS', workload.thresholds.p99Ms);
const CHECKS_RATE_LIMIT = ratio('CHECKS_RATE_LIMIT', workload.thresholds.checksRate);
const INCLUDE_MUTATIONS = String(__ENV.INCLUDE_MUTATIONS || 'false') === 'true';
const INCLUDE_ADMIN = String(__ENV.INCLUDE_ADMIN || 'false') === 'true';
const INCLUDE_INTERNAL = String(__ENV.INCLUDE_INTERNAL || 'false') === 'true';
const CONFIRMED_NON_PRODUCTION = String(__ENV.CONFIRM_NON_PRODUCTION || 'false') === 'true';
const SELECTED_GROUPS = parseList(__ENV.OPERATION_GROUPS || 'all');
const USER_TOKEN = __ENV.LOAD_TEST_USER_TOKEN || __ENV.LOAD_TEST_BEARER_TOKEN || '';
const MODERATOR_TOKEN = __ENV.LOAD_TEST_MODERATOR_TOKEN || '';
const ADMIN_TOKEN = __ENV.LOAD_TEST_ADMIN_TOKEN || '';
const GO_WORKER_TOKEN = __ENV.LOAD_TEST_GO_WORKER_TOKEN || '';
const GO_WORKER_TARGET = String(__ENV.LOAD_TEST_GO_WORKER_TARGET || '').replace(/\/+$/, '');
const FRONTEND_TARGET = String(__ENV.LOAD_TEST_FRONTEND_TARGET || '').replace(/\/+$/, '');
const KEEPALIVE_TARGET = String(__ENV.LOAD_TEST_KEEPALIVE_TARGET || '').replace(/\/+$/, '');
const RUN_STARTED_AT = new Date().toISOString();

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function parseList(value) { return String(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean); }
function parseJson(value, fallback, label) {
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch (error) { throw new Error(`${label} must be valid JSON: ${error.message}`); }
}
function findMissingEnvironmentValues(value, missing = new Set()) {
  if (typeof value === 'string') {
    const match = value.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)$/);
    if (match && !__ENV[match[1]]) missing.add(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach(item => findMissingEnvironmentValues(item, missing));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => findMissingEnvironmentValues(item, missing));
  }
  return [...missing];
}
function loadMultipartFiles(body) {
  return (body.files || []).map(file => {
    if (!file.field || !file.path) throw new Error('Multipart file requires field and path.');
    return {
      ...file,
      contents: open(file.path, 'b'),
      filename: file.filename || file.path.split('/').pop(),
      contentType: file.contentType || 'application/octet-stream',
    };
  });
}
function buildMultipartPayload(operation) {
  const form = runtimeValue(operation.body.fields || {});
  for (const file of operation.multipartFiles || []) {
    const item = http.file(file.contents, file.filename, file.contentType);
    if (form[file.field] === undefined) form[file.field] = item;
    else if (Array.isArray(form[file.field])) form[file.field].push(item);
    else form[file.field] = [form[file.field], item];
  }
  return form;
}
function resolveValue(value) {
  if (typeof value === 'string') {
    if (value.startsWith('$env:')) return __ENV[value.slice(5)] || '';
    if (value === '{{RUN_ID}}') return RUN_ID;
    return value.replaceAll('{{RUN_ID}}', RUN_ID);
  }
  if (Array.isArray(value)) return value.map(resolveValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolveValue(nested)]));
  }
  return value;
}
function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}
function authToken(route) {
  if (!route.requiresAuth) return '';
  if (route.role === 'service') return GO_WORKER_TOKEN;
  if (route.role === 'admin') return ADMIN_TOKEN;
  if (route.role === 'moderator') return MODERATOR_TOKEN || ADMIN_TOKEN;
  return USER_TOKEN;
}
function resolvePath(route, operationConfig, sharedParams) {
  const params = { ...resolveValue(workload.globalParams || {}), ...resolveValue(sharedParams || {}), ...resolveValue(operationConfig.params || {}) };
  let unresolved = [];
  const pathValue = route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
    const value = params[name];
    if (value === undefined || value === null || String(value).length === 0) {
      unresolved.push(name);
      return `:${name}`;
    }
    return encodeURIComponent(String(value));
  });
  return { path: pathValue, unresolved };
}
function queryString(route, operationConfig) {
  const query = {
    ...(workload.globalQuery || {}),
    ...(operationConfig.query || {}),
  };
  const parts = [];
  for (const [key, rawValue] of Object.entries(resolveValue(query))) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(rawValue))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
function buildStages() {
  const ramp = `${RAMP_SECONDS}s`;
  const duration = `${DURATION_SECONDS}s`;
  const down = `${Math.min(RAMP_SECONDS, 30)}s`;
  if (PROFILE === 'soak') return [{ duration, target: PEAK_VUS }];
  if (PROFILE === 'spike') {
    return [
      { duration: ramp, target: Math.max(1, Math.floor(PEAK_VUS * 0.1)) },
      { duration: '1s', target: PEAK_VUS },
      { duration, target: PEAK_VUS },
      { duration: down, target: 0 },
    ];
  }
  if (PROFILE === 'smoke') {
    return [
      { duration: ramp, target: PEAK_VUS },
      { duration, target: PEAK_VUS },
      { duration: down, target: 0 },
    ];
  }
  const stages = [
    { duration: ramp, target: Math.max(1, Math.floor(PEAK_VUS * 0.25)) },
    { duration: ramp, target: Math.max(1, Math.floor(PEAK_VUS * 0.5)) },
    { duration: ramp, target: Math.max(1, Math.floor(PEAK_VUS * 0.75)) },
    { duration: ramp, target: PEAK_VUS },
    { duration: PROFILE === 'stress' ? `${DURATION_SECONDS * 2}s` : duration, target: PEAK_VUS },
    { duration: down, target: 0 },
  ];
  return stages;
}
function buildArrivalStages() {
  const ramp = `${RAMP_SECONDS}s`;
  const down = `${Math.min(RAMP_SECONDS, 30)}s`;
  if (PROFILE === 'soak') return [{ duration: `${DURATION_SECONDS}s`, target: REQUEST_RATE }];
  if (PROFILE === 'spike') return [
    { duration: ramp, target: Math.max(1, Math.floor(REQUEST_RATE * 0.1)) },
    { duration: '1s', target: REQUEST_RATE },
    { duration: `${DURATION_SECONDS}s`, target: REQUEST_RATE },
    { duration: down, target: 0 },
  ];
  if (PROFILE === 'smoke') return [
    { duration: ramp, target: REQUEST_RATE },
    { duration: `${DURATION_SECONDS}s`, target: REQUEST_RATE },
    { duration: down, target: 0 },
  ];
  const rates = [0.25, 0.5, 0.75, 1].map(factor => Math.max(1, Math.floor(REQUEST_RATE * factor)));
  const stages = rates.map(target => ({ duration: ramp, target }));
  stages.push({ duration: `${DURATION_SECONDS * (PROFILE === 'stress' ? 2 : 1)}s`, target: REQUEST_RATE });
  stages.push({ duration: down, target: 0 });
  return stages;
}

const sharedParams = parseJson(__ENV.LOAD_TEST_ROUTE_PARAMS_JSON, {}, 'LOAD_TEST_ROUTE_PARAMS_JSON');
const envGlobalHeaders = parseJson(__ENV.LOAD_TEST_GLOBAL_HEADERS_JSON, {}, 'LOAD_TEST_GLOBAL_HEADERS_JSON');
if (!envGlobalHeaders || typeof envGlobalHeaders !== 'object' || Array.isArray(envGlobalHeaders)) {
  throw new Error('LOAD_TEST_GLOBAL_HEADERS_JSON must be a JSON object of HTTP header names and values.');
}
const globalHeaders = { ...(workload.globalHeaders || {}), ...envGlobalHeaders };
const requestedOperations = [];
const skippedOperations = [];
const operationMetrics = {};

for (const route of routeInventory) {
  const override = workload.operations?.[route.id] || {};
  const groupConfig = workload.groups?.[route.group] || { enabled: true, weight: 1 };
  const groupSelected = SELECTED_GROUPS.includes('all') || SELECTED_GROUPS.includes(route.group);
  const enabled = override.enabled === undefined
    ? (!route.internal && route.method === 'GET' && (route.requiresAuth ? workload.defaults.authenticatedReads : (route.defaultEnabled && workload.defaults.publicReads)))
    : Boolean(override.enabled);
  const candidate = { ...route, ...override, group: route.group, operationKey: route.id };
  let skipReason = '';

  if (!enabled) skipReason = 'disabled_in_workload_config';
  else if (!groupSelected) skipReason = 'group_not_selected';
  else if (groupConfig.enabled === false) skipReason = 'group_disabled_in_workload_config';
  else if (route.internal && !INCLUDE_INTERNAL) skipReason = 'internal_operations_not_enabled';
  else if (route.targetKind === 'go-worker' && route.path === '/healthz' && !GO_WORKER_TARGET) skipReason = 'go_healthz_requires_LOAD_TEST_GO_WORKER_TARGET';
  else if (route.targetKind === 'frontend-api' && !FRONTEND_TARGET) skipReason = 'frontend_api_requires_LOAD_TEST_FRONTEND_TARGET';
  else if (route.targetKind === 'keepalive-worker' && !KEEPALIVE_TARGET) skipReason = 'keepalive_requires_LOAD_TEST_KEEPALIVE_TARGET';
  else if ((route.role === 'admin' || route.role === 'moderator') && !INCLUDE_ADMIN) skipReason = 'admin_operations_not_enabled';
  else if (route.writable && !route.readOnly && !INCLUDE_MUTATIONS) skipReason = 'mutations_not_enabled';
  else if (route.requiresAuth && !authToken(route)) skipReason = `missing_${route.role}_bearer_token`;

  const resolved = resolvePath(route, override, sharedParams);
  if (!skipReason && resolved.unresolved.length) skipReason = `missing_path_parameters:${resolved.unresolved.join(',')}`;

  const body = resolveValue(override.body);
  const missingBodyEnvs = findMissingEnvironmentValues(override.body);
  const missingConfigEnvs = [...findMissingEnvironmentValues(globalHeaders), ...findMissingEnvironmentValues(override.headers), ...findMissingEnvironmentValues(override.query), ...findMissingEnvironmentValues(override.signing)];
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(route.method);
  if (!skipReason && route.writable && !route.readOnly && needsBody && body === undefined && !override.allowEmptyBody) {
    skipReason = 'request_body_not_configured';
  }
  if (!skipReason && [...missingBodyEnvs, ...missingConfigEnvs].length) skipReason = `missing_environment_values:${[...new Set([...missingBodyEnvs, ...missingConfigEnvs])].join(',')}`;
  if (!skipReason && override.signing?.type === 'hmac-sha256' && String(resolveValue(override.signing.secret) || '').length < 32) {
    skipReason = 'hmac_secret_must_be_at_least_32_characters';
  }
  if (!skipReason && override.bodyType === 'multipart' && (!body || !Array.isArray(body.files) || body.files.length === 0)) {
    skipReason = 'multipart_requires_files_array';
  }
  if (route.path === '/metrics' && override.enabled !== true) skipReason = 'operational_endpoint_requires_explicit_enablement';
  if (route.path === '/health/outbox' && override.enabled !== true) skipReason = 'outbox_probe_requires_explicit_enablement';

  if (skipReason) {
    skippedOperations.push({ id: route.id, group: route.group, reason: skipReason });
    continue;
  }

  const targetBase = route.targetKind === 'go-worker'
    ? (GO_WORKER_TARGET || ROOT_TARGET)
    : route.targetKind === 'frontend-api'
      ? FRONTEND_TARGET
      : route.targetKind === 'keepalive-worker'
        ? KEEPALIVE_TARGET
        : (route.outsideApi || route.internal ? ROOT_TARGET : API_ROOT);
  const requestPath = route.targetKind === 'go-worker' && !GO_WORKER_TARGET
    ? `/__go${resolved.path}`
    : resolved.path;
  const operation = {
    ...candidate,
    path: resolved.path,
    url: `${targetBase}${requestPath}${queryString(route, override)}`,
    expectedStatuses: override.expectedStatuses || (route.method === 'GET' ? [200, 304, 302, 307] : route.method === 'POST' ? [200, 201, 202, 204] : [200, 204]),
    weight: Math.max(0.01, Number(override.weight || workload.defaults.operationWeight || 1) * Number(groupConfig.weight || 1)),
    headers: resolveValue({ ...globalHeaders, ...(override.headers || {}) }),
    body,
    bodyType: override.bodyType || 'json',
    signing: resolveValue(override.signing),
  };
  operation.multipartFiles = operation.bodyType === 'multipart' ? loadMultipartFiles(operation.body) : [];
  operation.payload = operation.bodyType === 'multipart' ? null : operation.body;
  operation.slug = slug(`${route.method}_${route.path}`);
  if (requestedOperations.some(existing => existing.slug === operation.slug)) {
    throw new Error(`Metric name collision for ${route.id}; adjust the slug function before running.`);
  }
  requestedOperations.push(operation);
  operationMetrics[route.id] = {
    requests: new Counter(`op_${operation.slug}_requests`),
    errors: new Counter(`op_${operation.slug}_errors`),
    duration: new Trend(`op_${operation.slug}_duration_ms`, true),
  };
}

const totalWeight = requestedOperations.reduce((sum, operation) => sum + operation.weight, 0);
if (requestedOperations.length === 0) {
  throw new Error(`No eligible API operations. Review workload.config.js, operation groups, IDs, and bearer-token secrets. ${skippedOperations.length} operations were skipped.`);
}
let parsedTarget;
try { parsedTarget = new URL(TARGET); }
catch (_error) { throw new Error(`TARGET must be a valid absolute http(s) URL: ${TARGET}`); }
if (!['http:', 'https:'].includes(parsedTarget.protocol) || parsedTarget.username || parsedTarget.password || parsedTarget.search || parsedTarget.hash) {
  throw new Error('TARGET must be an http(s) origin, optionally ending in the configured API prefix; credentials, query strings, and fragments are not allowed.');
}
if (parsedTarget.pathname !== '' && parsedTarget.pathname !== '/' && parsedTarget.pathname !== API_PREFIX) {
  throw new Error(`TARGET path must be empty, /, or ${API_PREFIX}; received ${parsedTarget.pathname}`);
}
const isLoopbackTarget = ['localhost', '127.0.0.1', '::1'].includes(parsedTarget.hostname);
if (!isLoopbackTarget && !CONFIRMED_NON_PRODUCTION) {
  throw new Error('Remote load tests require CONFIRM_NON_PRODUCTION=true after verifying that the target is a dedicated non-production environment.');
}
if (/prod(uction)?[.-]|marketplat-api\.esamnajjar6\.workers\.dev|api\.classifieds-platform\.com/i.test(TARGET)) {
  throw new Error('Refusing a known production-like target. Use a dedicated non-production load-test environment.');
}
if (KEEPALIVE_TARGET) {
  let parsedKeepaliveTarget;
  try { parsedKeepaliveTarget = new URL(KEEPALIVE_TARGET); }
  catch (_error) { throw new Error(`LOAD_TEST_KEEPALIVE_TARGET must be a valid absolute http(s) origin: ${KEEPALIVE_TARGET}`); }
  if (!['http:', 'https:'].includes(parsedKeepaliveTarget.protocol) || parsedKeepaliveTarget.username || parsedKeepaliveTarget.password || parsedKeepaliveTarget.search || parsedKeepaliveTarget.hash || !['', '/'].includes(parsedKeepaliveTarget.pathname)) {
    throw new Error('LOAD_TEST_KEEPALIVE_TARGET must be an http(s) origin without credentials, path, query, or fragment.');
  }
  const isKeepaliveLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedKeepaliveTarget.hostname);
  if (!isKeepaliveLoopback && !CONFIRMED_NON_PRODUCTION) {
    throw new Error('A remote LOAD_TEST_KEEPALIVE_TARGET requires CONFIRM_NON_PRODUCTION=true.');
  }
  if (/prod(uction)?[.-]|marketplat\.esamnajjar6\.workers\.dev|classifieds-platform\.com/i.test(KEEPALIVE_TARGET)) {
    throw new Error('Refusing a known production-like keepalive target.');
  }
}
if (FRONTEND_TARGET) {
  let parsedFrontendTarget;
  try { parsedFrontendTarget = new URL(FRONTEND_TARGET); }
  catch (_error) { throw new Error(`LOAD_TEST_FRONTEND_TARGET must be a valid absolute http(s) origin: ${FRONTEND_TARGET}`); }
  if (!['http:', 'https:'].includes(parsedFrontendTarget.protocol) || parsedFrontendTarget.username || parsedFrontendTarget.password || parsedFrontendTarget.search || parsedFrontendTarget.hash || !['', '/'].includes(parsedFrontendTarget.pathname)) {
    throw new Error('LOAD_TEST_FRONTEND_TARGET must be an http(s) origin without credentials, path, query, or fragment.');
  }
  const isFrontendLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedFrontendTarget.hostname);
  if (!isFrontendLoopback && !CONFIRMED_NON_PRODUCTION) {
    throw new Error('A remote LOAD_TEST_FRONTEND_TARGET requires CONFIRM_NON_PRODUCTION=true.');
  }
  if (/prod(uction)?[.-]|marketplat\.esamnajjar6\.workers\.dev|classifieds-platform\.com/i.test(FRONTEND_TARGET)) {
    throw new Error('Refusing a known production-like frontend target.');
  }
}
if (GO_WORKER_TARGET) {
  let parsedGoTarget;
  try { parsedGoTarget = new URL(GO_WORKER_TARGET); }
  catch (_error) { throw new Error(`LOAD_TEST_GO_WORKER_TARGET must be a valid absolute http(s) origin: ${GO_WORKER_TARGET}`); }
  if (!['http:', 'https:'].includes(parsedGoTarget.protocol) || parsedGoTarget.username || parsedGoTarget.password || parsedGoTarget.search || parsedGoTarget.hash || !['', '/'].includes(parsedGoTarget.pathname)) {
    throw new Error('LOAD_TEST_GO_WORKER_TARGET must be an http(s) origin without credentials, path, query, or fragment.');
  }
  const isGoLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedGoTarget.hostname);
  if (!isGoLoopback && !CONFIRMED_NON_PRODUCTION) {
    throw new Error('A remote LOAD_TEST_GO_WORKER_TARGET requires CONFIRM_NON_PRODUCTION=true.');
  }
  if (/prod(uction)?[.-]|marketplat-api\.esamnajjar6\.workers\.dev|api\.classifieds-platform\.com/i.test(GO_WORKER_TARGET)) {
    throw new Error('Refusing a known production-like Go worker target.');
  }
}

const requestErrors = new Counter('load_test_request_errors_total');
const statusCounts = new Counter('load_test_status_total');
const responseDimensions = new Counter('load_test_response_dimensions_total');
const operationChecks = new Rate('load_test_operation_checks_rate');
let loggedErrorSamples = 0;
const maxErrorSamplesPerVu = Math.max(0, Number(workload.defaults.maxErrorSamplesPerVu || 2));

export const options = {
  scenarios: {
    unified_marketplat_load: LOAD_MODEL === 'arrival-rate'
      ? {
          executor: 'ramping-arrival-rate',
          startRate: 0,
          timeUnit: '1s',
          preAllocatedVUs: PRE_ALLOCATED_VUS,
          maxVUs: MAX_VUS,
          stages: buildArrivalStages(),
          gracefulStop: '15s',
        }
      : PROFILE === 'soak'
        ? { executor: 'constant-vus', vus: PEAK_VUS, duration: `${DURATION_SECONDS}s`, gracefulStop: '30s' }
        : {
            executor: 'ramping-vus',
            startVUs: PROFILE === 'spike' ? Math.max(1, Math.floor(PEAK_VUS * 0.1)) : 0,
            stages: buildStages(),
            gracefulRampDown: '15s',
          },
  },
  thresholds: {
    http_req_failed: [`rate<${ERROR_RATE_LIMIT}`],
    http_req_duration: [`p(95)<${P95_LIMIT_MS}`, `p(99)<${P99_LIMIT_MS}`],
    load_test_operation_checks_rate: [`rate>${CHECKS_RATE_LIMIT}`],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'MarketPlat-k6-load-test/1.0',
  discardResponseBodies: Boolean(workload.defaults.discardResponseBodies),
};

function pickOperation() {
  if (SELECTION_STRATEGY === 'round-robin') {
    const index = ((__VU - 1) + __ITER) % requestedOperations.length;
    return requestedOperations[index];
  }
  let cursor = Math.random() * totalWeight;
  for (const operation of requestedOperations) {
    cursor -= operation.weight;
    if (cursor <= 0) return operation;
  }
  return requestedOperations[requestedOperations.length - 1];
}
function classifyError(status, errorText) {
  if (status === 0) return /timeout|deadline/i.test(errorText) ? 'timeout' : 'network_or_tls';
  if (status === 401) return 'unauthorized_401';
  if (status === 403) return 'forbidden_403';
  if (status === 429) return 'rate_limited_429';
  if (status >= 500) return 'server_5xx';
  if (status >= 400) return 'client_4xx';
  return 'unexpected_response';
}
function responseHeader(response, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  for (const [name, value] of Object.entries(response.headers || {})) {
    if (wanted.has(name.toLowerCase())) return value;
  }
  return null;
}
function safeErrorDetails(response) {
  let parsed = null;
  let message = response.error || '';
  if (response.body) {
    try { parsed = response.json(); } catch (_error) { /* non-JSON body is handled below */ }
  }
  if (!message) {
    message = parsed?.message || parsed?.error?.message || parsed?.error || parsed?.code || response.body || '';
  }
  const sanitize = value => String(value || '')
    .replace(/([\"']?(?:authorization|access[_-]?token|refresh[_-]?token|token|password|email|cookie)[\"']?\s*[:=]\s*[\"']?)(?:bearer\s+)?[^,\"'\s}]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
  return {
    message: sanitize(message),
    code: parsed?.code || parsed?.error?.code || response.error_code || null,
    requestId: parsed?.requestId || parsed?.request_id || null,
  };
}
function runtimeValue(value) {
  if (typeof value === 'string') {
    const frontendOrigin = FRONTEND_TARGET ? new URL(FRONTEND_TARGET).origin : '';
    return value.replaceAll('{{RUN_ID}}', RUN_ID).replaceAll('{{VU}}', String(__VU)).replaceAll('{{ITER}}', String(__ITER)).replaceAll('{{FRONTEND_ORIGIN}}', frontendOrigin);
  }
  if (Array.isArray(value)) return value.map(runtimeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, runtimeValue(nested)]));
  return value;
}
function runOperation(operation) {
  const metric = operationMetrics[operation.operationKey];
  const headers = {
    Accept: 'application/json',
    'X-Load-Test-Run-Id': RUN_ID,
    ...runtimeValue(operation.headers),
  };
  const token = authToken(operation);
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (operation.body !== undefined) {
    payload = operation.bodyType === 'json' ? JSON.stringify(runtimeValue(operation.body)) : buildMultipartPayload(operation);
    if (operation.bodyType === 'json') headers['Content-Type'] = 'application/json';
  }
  if (operation.signing?.type === 'hmac-sha256') {
    const secret = operation.signing.secret;
    if (!secret || typeof payload !== 'string') throw new Error(`${operation.operationKey}: HMAC signing requires a secret and a JSON body.`);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.hmac('sha256', secret, `${timestamp}.${payload}`, 'hex');
    headers[operation.signing.timestampHeader || 'x-marketplat-timestamp'] = timestamp;
    headers[operation.signing.signatureHeader || 'x-marketplat-signature'] = `sha256=${signature}`;
  }
  const requestOptions = {
    headers,
    timeout: workload.defaults.timeout || '15s',
    redirects: Math.max(0, Number(workload.defaults.maxRedirects ?? 2)),
    responseCallback: http.expectedStatuses(...operation.expectedStatuses),
    tags: {
      operation: operation.slug,
      operation_group: operation.group,
      method: operation.method,
      route: operation.path,
    },
  };
  const started = Date.now();
  const response = http.request(operation.method, operation.url, payload, requestOptions);
  const elapsed = response.timings?.duration ?? (Date.now() - started);
  const accepted = operation.expectedStatuses.includes(response.status);
  const requestTag = { operation: operation.slug };
  metric.requests.add(1);
  metric.duration.add(elapsed);
  statusCounts.add(1, { operation: operation.slug, status: String(response.status) });
  for (const [dimension, headerNames] of [
    ['cf_cache_status', ['cf-cache-status']],
    ['proxy_cache', ['x-proxy-cache']],
    ['route_mode', ['x-mp-route-mode']],
    ['go_service', ['x-mp-go-service']],
    ['route_attempts', ['x-mp-route-attempts']],
  ]) {
    const value = responseHeader(response, headerNames);
    if (value) responseDimensions.add(1, { dimension, value: String(value).slice(0, 80) });
  }
  operationChecks.add(accepted, requestTag);

  check(response, {
    [`${operation.method} ${operation.path} expected status`]: () => accepted,
  });

  if (!accepted) {
    const errorDetails = safeErrorDetails(response);
    const errorKind = classifyError(response.status, errorDetails.message);
    metric.errors.add(1);
    requestErrors.add(1, { operation: operation.slug, group: operation.group, kind: errorKind, status: String(response.status) });
    if (loggedErrorSamples < maxErrorSamplesPerVu) {
      const diagnostic = {
        runId: RUN_ID,
        operation: operation.operationKey,
        group: operation.group,
        url: `${new URL(operation.url).origin}${operation.path}`,
        status: response.status,
        kind: errorKind,
        errorCode: errorDetails.code,
        requestId: responseHeader(response, ['x-request-id', 'x-correlation-id', 'trace-id']) || errorDetails.requestId,
        cfRay: responseHeader(response, ['cf-ray']),
        cfCacheStatus: responseHeader(response, ['cf-cache-status']),
        proxyCache: responseHeader(response, ['x-proxy-cache']),
        routeMode: responseHeader(response, ['x-mp-route-mode']),
        goService: responseHeader(response, ['x-mp-go-service']),
        routeAttempts: responseHeader(response, ['x-mp-route-attempts']),
        durationMs: Math.round(elapsed),
        message: errorDetails.message,
      };
      console.error(`[LOAD_TEST_ERROR] ${JSON.stringify(diagnostic)}`);
      loggedErrorSamples += 1;
    }
  }
  return response;
}

export default function () {
  const operation = pickOperation();
  runOperation(operation);
  const thinkTime = Math.max(0, Number(workload.defaults.thinkTimeSeconds || 0));
  if (thinkTime > 0) sleep(thinkTime);
}

function metricValues(metrics, name) {
  return metrics?.[name]?.values || {};
}
function numberOrZero(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function percent(value) { return `${(numberOrZero(value) * 100).toFixed(2)}%`; }
function formatMs(value) { return `${numberOrZero(value).toFixed(1)} ms`; }
function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function metricCount(metrics, name) { return numberOrZero(metricValues(metrics, name).count); }
function renderReport(data) {
  const metrics = data.metrics || {};
  const requestMetric = metricValues(metrics, 'http_reqs');
  const durationMetric = metricValues(metrics, 'http_req_duration');
  const errorMetric = metricValues(metrics, 'http_req_failed');
  const checksMetric = metricValues(metrics, 'checks');
  const testDurationSeconds = numberOrZero(data.state?.testRunDurationMs) / 1000;
  const totalRequests = numberOrZero(requestMetric.count);
  const errorRate = numberOrZero(errorMetric.rate);
  const requestsPerSecond = testDurationSeconds > 0 ? totalRequests / testDurationSeconds : 0;
  const opRows = requestedOperations.map(operation => {
    const prefix = `op_${operation.slug}`;
    const requests = metricValues(metrics, `${prefix}_requests`).count || 0;
    const errors = metricValues(metrics, `${prefix}_errors`).count || 0;
    const timing = metricValues(metrics, `${prefix}_duration_ms`);
    return { operation, requests: numberOrZero(requests), errors: numberOrZero(errors), timing };
  }).filter(row => row.requests > 0).sort((a, b) => b.errors - a.errors || b.requests - a.requests);

  const notExecutedEligible = requestedOperations.filter(operation => !opRows.some(row => row.operation.operationKey === operation.operationKey)).map(operation => operation.operationKey);
  const errorBreakdown = Object.entries(metrics)
    .filter(([name]) => name.startsWith('load_test_request_errors_total{'))
    .map(([name, metric]) => ({ name, count: numberOrZero(metric.values?.count) }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const statusBreakdown = Object.entries(metrics)
    .filter(([name]) => name.startsWith('load_test_status_total{'))
    .map(([name, metric]) => ({ name, count: numberOrZero(metric.values?.count) }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const classifiedFailedRequests = errorBreakdown.reduce((sum, item) => sum + item.count, 0);
  const coverageByGroup = [...new Set(routeInventory.map(route => route.group))].sort().map(group => {
    const groupOperations = requestedOperations.filter(operation => operation.group === group);
    const groupRows = opRows.filter(row => row.operation.group === group);
    return {
      group,
      inventory: routeInventory.filter(route => route.group === group).length,
      eligible: groupOperations.length,
      executed: groupRows.length,
      skipped: skippedOperations.filter(operation => operation.group === group).length,
      requests: groupRows.reduce((sum, row) => sum + row.requests, 0),
      errors: groupRows.reduce((sum, row) => sum + row.errors, 0),
    };
  });
  const responseBreakdown = Object.entries(metrics)
    .filter(([name]) => name.startsWith('load_test_response_dimensions_total{'))
    .map(([name, metric]) => ({ name, count: numberOrZero(metric.values?.count) }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const summary = {
    schemaVersion: 1,
    run: {
      id: RUN_ID,
      startedAt: RUN_STARTED_AT,
      target: TARGET,
      apiRoot: API_ROOT,
      goWorkerTarget: GO_WORKER_TARGET || null,
      frontendTarget: FRONTEND_TARGET || null,
      keepaliveTarget: KEEPALIVE_TARGET || null,
      profile: PROFILE,
      loadModel: LOAD_MODEL,
      selectionStrategy: SELECTION_STRATEGY,
      peakVus: PEAK_VUS,
      preAllocatedVus: PRE_ALLOCATED_VUS,
      maxVus: MAX_VUS,
      durationSeconds: DURATION_SECONDS,
      rampSeconds: RAMP_SECONDS,
      requestRate: LOAD_MODEL === 'arrival-rate' ? REQUEST_RATE : null,
      includeMutations: INCLUDE_MUTATIONS,
      includeAdmin: INCLUDE_ADMIN,
      includeInternal: INCLUDE_INTERNAL,
      groups: SELECTED_GROUPS,
      generatedAt: new Date().toISOString(),
      commit: __ENV.LOAD_TEST_COMMIT || null,
      workflowRunId: __ENV.GITHUB_RUN_ID || null,
    },
    coverage: {
      inventoryOperations: routeInventory.length,
      eligibleOperations: requestedOperations.length,
      executedOperations: opRows.length,
      skippedOperations: skippedOperations.length,
      skipped: skippedOperations,
      executed: opRows.map(row => row.operation.operationKey),
      eligibleButNotExecuted: notExecutedEligible,
      byGroup: coverageByGroup,
    },
    totals: {
      requests: totalRequests,
      requestsPerSecond,
      durationSeconds: testDurationSeconds,
      failedRequestRate: errorRate,
      checkPassRate: numberOrZero(checksMetric.rate),
      failedRequests: classifiedFailedRequests,
      vusMax: numberOrZero(metricValues(metrics, 'vus_max').max),
      iterations: metricCount(metrics, 'iterations'),
      droppedIterations: metricCount(metrics, 'dropped_iterations'),
      dataSentBytes: numberOrZero(metricValues(metrics, 'data_sent').count),
      dataReceivedBytes: numberOrZero(metricValues(metrics, 'data_received').count),
    },
    latencyMs: {
      avg: numberOrZero(durationMetric.avg),
      min: numberOrZero(durationMetric.min),
      median: numberOrZero(durationMetric.med),
      p90: numberOrZero(durationMetric['p(90)']),
      p95: numberOrZero(durationMetric['p(95)']),
      p99: numberOrZero(durationMetric['p(99)']),
      max: numberOrZero(durationMetric.max),
      waitingP95: numberOrZero(metricValues(metrics, 'http_req_waiting')['p(95)']),
      connectingAvg: numberOrZero(metricValues(metrics, 'http_req_connecting').avg),
      tlsHandshakingAvg: numberOrZero(metricValues(metrics, 'http_req_tls_handshaking').avg),
      sendingAvg: numberOrZero(metricValues(metrics, 'http_req_sending').avg),
      receivingAvg: numberOrZero(metricValues(metrics, 'http_req_receiving').avg),
      blockedAvg: numberOrZero(metricValues(metrics, 'http_req_blocked').avg),
    },
    thresholds: {
      p95Ms: P95_LIMIT_MS,
      p99Ms: P99_LIMIT_MS,
      errorRate: ERROR_RATE_LIMIT,
      checksRate: CHECKS_RATE_LIMIT,
      observed: {
        p95Pass: numberOrZero(durationMetric['p(95)']) <= P95_LIMIT_MS,
        p99Pass: numberOrZero(durationMetric['p(99)']) <= P99_LIMIT_MS,
        errorRatePass: errorRate <= ERROR_RATE_LIMIT,
        checksRatePass: numberOrZero(checksMetric.rate) >= CHECKS_RATE_LIMIT,
      },
    },
    byOperation: opRows.map(row => ({
      id: row.operation.operationKey,
      group: row.operation.group,
      method: row.operation.method,
      path: row.operation.path,
      requests: row.requests,
      errors: row.errors,
      errorRate: row.requests ? row.errors / row.requests : 0,
      latencyMs: {
        avg: numberOrZero(row.timing.avg),
        p50: numberOrZero(row.timing.med),
        p90: numberOrZero(row.timing['p(90)']),
        p95: numberOrZero(row.timing['p(95)']),
        p99: numberOrZero(row.timing['p(99)']),
        max: numberOrZero(row.timing.max),
      },
    })),
    errors: { total: classifiedFailedRequests, byKindAndOperation: errorBreakdown, byStatusAndOperation: statusBreakdown },
    responseBreakdown,
    k6Metrics: metrics,
  };

  const csvHeader = ['operation', 'group', 'method', 'path', 'requests', 'errors', 'error_rate', 'avg_ms', 'p50_ms', 'p90_ms', 'p95_ms', 'p99_ms', 'max_ms'];
  const csvRows = opRows.map(row => [
    row.operation.operationKey, row.operation.group, row.operation.method, row.operation.path,
    row.requests, row.errors, row.requests ? row.errors / row.requests : 0,
    numberOrZero(row.timing.avg), numberOrZero(row.timing.med), numberOrZero(row.timing['p(90)']),
    numberOrZero(row.timing['p(95)']), numberOrZero(row.timing['p(99)']), numberOrZero(row.timing.max),
  ]);
  const csv = [csvHeader, ...csvRows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n';

  const md = [
    '# MarketPlat — Unified Load Test Report',
    '',
    `- **Run:** \`${RUN_ID}\``,
    `- **Target:** \`${TARGET}\``,
    `- **Go worker target:** \`${GO_WORKER_TARGET || `${ROOT_TARGET}/__go`}\``,
    `- **Frontend API target:** \`${FRONTEND_TARGET || 'not configured'}\``,
    `- **Keepalive Worker target:** \`${KEEPALIVE_TARGET || 'not configured'}\``,
    `- **Profile / model / selection:** ${PROFILE} / ${LOAD_MODEL} / ${SELECTION_STRATEGY}`,
    `- **Load:** ${PEAK_VUS} peak VUs${LOAD_MODEL === 'arrival-rate' ? ` / ${REQUEST_RATE} req/s target` : ''}`,
    `- **Duration:** ${testDurationSeconds.toFixed(1)}s`,
    `- **Mutation / admin / internal:** ${INCLUDE_MUTATIONS} / ${INCLUDE_ADMIN} / ${INCLUDE_INTERNAL}`,
    '',
    '## Executive metrics',
    '',
    '| Metric | Result |',
    '|---|---:|',
    `| Requests | ${totalRequests} |`,
    `| Throughput | ${requestsPerSecond.toFixed(2)} req/s |`,
    `| Error rate | ${percent(errorRate)} |`,
    `| Checks passed | ${percent(checksMetric.rate)} |`,
    `| p50 | ${formatMs(durationMetric.med)} |`,
    `| p90 | ${formatMs(durationMetric['p(90)'])} |`,
    `| p95 | ${formatMs(durationMetric['p(95)'])} |`,
    `| p99 | ${formatMs(durationMetric['p(99)'])} |`,
    `| Max latency | ${formatMs(durationMetric.max)} |`,
    `| TTFB p95 (waiting) | ${formatMs(metricValues(metrics, 'http_req_waiting')['p(95)'])} |`,
    `| Dropped iterations | ${summary.totals.droppedIterations} |`,
    `| Data sent / received | ${(summary.totals.dataSentBytes / 1024 / 1024).toFixed(2)} / ${(summary.totals.dataReceivedBytes / 1024 / 1024).toFixed(2)} MiB |`,
    '',
    '## Route coverage',
    '',
    `- Inventory: **${routeInventory.length}** operations`,
    `- Eligible: **${requestedOperations.length}**`,
    `- Executed: **${opRows.length}**`,
    `- Skipped: **${skippedOperations.length}**`,
    '',
    '## Coverage by group',
    '',
    '| Group | Inventory | Eligible | Executed | Skipped | Requests | Errors |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...coverageByGroup.map(item => `| ${item.group} | ${item.inventory} | ${item.eligible} | ${item.executed} | ${item.skipped} | ${item.requests} | ${item.errors} |`),
    '',
    '## Per-operation diagnostics',
    '',
    '| Operation | Requests | Errors | Error rate | Avg | p95 | p99 |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...opRows.map(row => `| \`${row.operation.method} ${row.operation.path}\` | ${row.requests} | ${row.errors} | ${percent(row.requests ? row.errors / row.requests : 0)} | ${formatMs(row.timing.avg)} | ${formatMs(row.timing['p(95)'])} | ${formatMs(row.timing['p(99)'])} |`),
    '',
    '## Eligible but not exercised',
    '',
    ...(notExecutedEligible.length ? notExecutedEligible.map(id => `- \`${id}\``) : ['- All eligible operations received at least one request.']),
    '',
    '## Error classification',
    '',
    ...(errorBreakdown.length ? errorBreakdown.map(item => `- ${item.name}: **${item.count}**`) : ['- No unexpected responses recorded.']),
    '',
    '## HTTP status breakdown',
    '',
    ...(statusBreakdown.length ? statusBreakdown.map(item => `- ${item.name}: **${item.count}**`) : ['- No HTTP status samples recorded.']),
    '',
    '## Edge / gateway response headers',
    '',
    ...(responseBreakdown.length ? responseBreakdown.map(item => `- ${item.name}: **${item.count}**`) : ['- No Cloudflare / gateway diagnostic headers were returned.']),
    '',
    '## Skipped operations',
    '',
    ...(skippedOperations.length ? skippedOperations.map(item => `- \`${item.id}\` — ${item.reason}`) : ['- None']),
    '',
    '## Threshold evaluation',
    '',
    `- p95: ${summary.thresholds.observed.p95Pass ? 'PASS' : 'FAIL'} (limit ${P95_LIMIT_MS} ms)`,
    `- p99: ${summary.thresholds.observed.p99Pass ? 'PASS' : 'FAIL'} (limit ${P99_LIMIT_MS} ms)`,
    `- error rate: ${summary.thresholds.observed.errorRatePass ? 'PASS' : 'FAIL'} (limit ${percent(ERROR_RATE_LIMIT)})`,
    `- checks: ${summary.thresholds.observed.checksRatePass ? 'PASS' : 'FAIL'} (minimum ${percent(CHECKS_RATE_LIMIT)})`,
    '',
    '> Diagnostics are sampled and sanitized. Use requestId / CF-Ray to correlate with API and Worker logs. A skipped operation is not a passing test.',
    '',
  ];

  return { summary, markdown: md.join('\n'), csv };
}

export function handleSummary(data) {
  const report = renderReport(data);
  return {
    'apps/api/load-tests/reports/latest-summary.json': JSON.stringify(report.summary, null, 2),
    'apps/api/load-tests/reports/latest-report.md': report.markdown,
    'apps/api/load-tests/reports/latest-by-operation.csv': report.csv,
    stdout: report.markdown,
  };
}
