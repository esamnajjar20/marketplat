#!/usr/bin/env node
/**
 * Build the HTTP operation inventory across Express, Go, Next.js, and Cloudflare Workers.
 * Route inventories are source-derived where possible; never hand-edit route-inventory.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const apiSource = path.join(repoRoot, 'apps/api/src');
const output = path.join(here, 'route-inventory.js');
const CHECK = process.argv.includes('--check');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function findCallEnd(source, openParen) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openParen; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function normalizePath(value) {
  const compact = `/${value}`.replace(/\/+/g, '/');
  if (compact === '/') return '/';
  return compact.replace(/\/$/, '');
}

function readLiteralCall(source, startIndex) {
  const open = source.indexOf('(', startIndex);
  if (open < 0) return null;
  const quote = source.slice(open + 1).match(/^\s*(['"`])/);
  if (!quote) return null;
  const quoteChar = quote[1];
  const valueStart = open + 1 + quote[0].length;
  let end = valueStart;
  let escaped = false;
  while (end < source.length) {
    const char = source[end];
    if (escaped) { escaped = false; end += 1; continue; }
    if (char === '\\') { escaped = true; end += 1; continue; }
    if (char === quoteChar) break;
    end += 1;
  }
  if (end >= source.length) return null;
  return {
    value: source.slice(valueStart, end),
    callEnd: findCallEnd(source, open),
    args: source.slice(open + 1, findCallEnd(source, open)),
  };
}

function hasAuthenticateMiddleware(text) {
  // Match the bare Express middleware reference, not calls such as
  // passport.authenticate(...) inside an OAuth route handler.
  return /(?<![\w.$])authenticate(?=\s*[,)]|$)/.test(text);
}

function hasRoleMiddleware(text) {
  return /\brequireAdmin\b|\brequireMinRole\s*\(/.test(text);
}

function roleFrom(text, inherited = 'user') {
  // requireAdmin is commonly passed as a middleware reference (not invoked).
  if (/\brequireAdmin\b/.test(text)) return 'admin';
  if (/\brequireMinRole\s*\(\s*ROLES\.ADMIN/.test(text)) return 'admin';
  if (/\brequireMinRole\s*\(/.test(text)) return 'moderator';
  return inherited;
}

function operationId(method, routePath) {
  return `${method} ${routePath}`;
}

const moduleFiles = walk(path.join(apiSource, 'modules')).filter(file => file.endsWith('.routes.ts'));
const routerDefinitions = new Map();
for (const file of moduleFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/export\s+const\s+(\w+Router)\s*=\s*Router\s*\(/g)) {
    routerDefinitions.set(match[1], { file, source });
  }
}

const mountPrefixes = new Map([...routerDefinitions.keys()].map(name => [name, []]));
for (const file of walk(path.join(apiSource, 'routes')).filter(file => file.endsWith('.ts'))) {
  const source = fs.readFileSync(file, 'utf8');
  const regex = /\b\w+\.use\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(\w+Router)\s*\)/g;
  for (const match of source.matchAll(regex)) {
    const [, , prefix, routerName] = match;
    if (mountPrefixes.has(routerName)) mountPrefixes.get(routerName).push(prefix);
  }
}

// Health endpoints are mounted directly on the Express app, not /api/v1.
const entries = [
  { method: 'GET', path: '/health', source: 'bootstrap/health.routes.ts', group: 'platform', scope: 'health', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: true },
  { method: 'GET', path: '/ready', source: 'bootstrap/health.routes.ts', group: 'platform', scope: 'health', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: true },
  { method: 'GET', path: '/live', source: 'bootstrap/health.routes.ts', group: 'platform', scope: 'health', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: true },
  { method: 'GET', path: '/health/outbox', source: 'bootstrap/health.routes.ts', group: 'platform', scope: 'health', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: false, note: 'Enable explicitly and provide x-health-token if configured.' },
  { method: 'GET', path: '/metrics', source: 'app.ts', group: 'platform', scope: 'ops', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: false, note: 'Prometheus scrape endpoint; excluded from normal user traffic.' },
  { method: 'GET', path: '/api/docs', source: 'bootstrap/docs.ts', group: 'platform', scope: 'docs', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: false, note: 'Development-only Swagger UI; not exposed in production.' },
  { method: 'GET', path: '/api/docs.json', source: 'bootstrap/docs.ts', group: 'platform', scope: 'docs', outsideApi: true, requiresAuth: false, role: 'public', internal: false, readOnly: true, defaultEnabled: false, note: 'Development-only OpenAPI document; not exposed in production.' },
  { method: 'POST', path: '/batch', source: 'routes/index.ts', group: 'platform', scope: 'discovery', outsideApi: false, requiresAuth: false, role: 'public', internal: false, defaultEnabled: false, readOnly: true, note: 'POST transport for safe GET subrequests; requires a valid requests[] body.' },
];

for (const [routerName, definition] of routerDefinitions) {
  const { file, source } = definition;
  const relative = path.relative(path.join(apiSource, 'modules'), file).split(path.sep).join('/');
  const domain = relative.split('/')[0] || 'other';
  const localRouterName = routerName;
  const globalUseCalls = [...source.matchAll(new RegExp(`\\b${localRouterName}\\.use\\s*\\(`, 'g'))];
  let inheritedAuth = false;
  let inheritedRole = 'public';
  for (const match of globalUseCalls) {
    const call = readLiteralCall(source, match.index);
    // A global middleware use starts with a middleware identifier, not a path literal.
    if (!call) {
      const open = source.indexOf('(', match.index);
      const close = findCallEnd(source, open);
      const args = source.slice(open + 1, close);
      if (hasAuthenticateMiddleware(args) || hasRoleMiddleware(args)) inheritedAuth = true;
      inheritedRole = roleFrom(args, inheritedRole);
    }
  }

  const prefixes = mountPrefixes.get(routerName) ?? [];
  const isInternalWorker = routerName === 'internalGoWorkerRouter';
  const resolvedPrefixes = prefixes.length ? prefixes : isInternalWorker ? ['/internal/go-worker'] : [];
  if (!resolvedPrefixes.length) continue;

  const methodRegex = new RegExp(`\\b${localRouterName}\\.(get|post|put|patch|delete)\\s*\\(`, 'g');
  for (const match of source.matchAll(methodRegex)) {
    const method = match[1].toUpperCase();
    const call = readLiteralCall(source, match.index);
    if (!call) continue;
    const routePath = call.value;
    const args = call.args;
    const requiresAuth = inheritedAuth || hasAuthenticateMiddleware(args) || hasRoleMiddleware(args);
    const role = roleFrom(args, inheritedRole === 'public' && requiresAuth ? 'user' : inheritedRole);
    for (const prefix of resolvedPrefixes) {
      const fullPath = normalizePath(`${prefix}/${routePath}`);
      const internal = isInternalWorker;
      entries.push({
        method,
        path: fullPath,
        source: relative,
        group: domain,
        scope: relative.replace(/\.routes\.ts$/, '').replaceAll('/', '.'),
        requiresAuth,
        role: requiresAuth ? role : 'public',
        internal,
        outsideApi: internal,
        readOnly: method === 'GET',
        defaultEnabled: method === 'GET' && !requiresAuth && !internal && !fullPath.startsWith('/admin/') && !fullPath.startsWith('/auth/'),
      });
    }
  }
}


// Go worker HTTP operations are declared from one ServeMux route table.
// They are reached through the Cloudflare gateway as /__go/<internal-path>,
// or directly when LOAD_TEST_GO_WORKER_TARGET is configured.
const goServerFile = path.join(repoRoot, 'apps/go-worker/cmd/server/server.go');
if (fs.existsSync(goServerFile)) {
  const goSource = fs.readFileSync(goServerFile, 'utf8');
  for (const match of goSource.matchAll(/mux\.HandleFunc\(\s*"([A-Z]+) ([^"]+)"/g)) {
    const [, method, routePath] = match;
    const readOnly = method === 'GET';
    entries.push({
      method,
      path: routePath,
      source: 'apps/go-worker/cmd/server/server.go',
      group: 'go-worker',
      scope: 'go-worker',
      targetKind: 'go-worker',
      outsideApi: true,
      requiresAuth: true,
      role: 'service',
      internal: true,
      readOnly,
      defaultEnabled: false,
      note: 'Internal Go worker endpoint. Uses the /__go gateway unless a direct Go worker target is configured.',
    });
  }
}

// Cloudflare API Worker control-plane endpoints are explicit operations too.
// Their methods are taken from the handlers mounted in worker.ts; all are
// opt-in because they inspect or mutate infrastructure state.
const edgeOperations = [
  { method: 'GET', path: '/__gateway/registry', readOnly: true },
  { method: 'POST', path: '/__gateway/registry', readOnly: true, note: 'Runs a gateway upstream health probe; request body must specify action=probe.' },
  { method: 'PUT', path: '/__gateway/registry', readOnly: false },
  { method: 'GET', path: '/__gateway/feature-flags', readOnly: true },
  { method: 'PUT', path: '/__gateway/feature-flags', readOnly: false },
  { method: 'GET', path: '/__gateway/public-feature-flags', readOnly: true },
  { method: 'POST', path: '/__purge__', readOnly: false, note: 'Destructive cache purge endpoint; keep disabled except in a dedicated test environment.' },
];
for (const operation of edgeOperations) {
  entries.push({
    ...operation,
    source: 'workers/cf-api-proxy/worker.ts',
    group: 'edge-ops',
    scope: 'edge-control-plane',
    targetKind: 'edge-worker',
    outsideApi: true,
    requiresAuth: false,
    role: 'public',
    internal: true,
    defaultEnabled: false,
  });
}

// Keepalive Worker exposes a tiny HTTP status endpoint; its scheduled
// outbound probes are not HTTP endpoints and are intentionally not load-tested.
const keepaliveFile = path.join(repoRoot, 'workers/keepalive-worker/index.ts');
if (fs.existsSync(keepaliveFile)) {
  entries.push({
    method: 'GET',
    path: '/',
    source: 'workers/keepalive-worker/index.ts',
    group: 'keepalive-worker',
    scope: 'keepalive-status',
    targetKind: 'keepalive-worker',
    outsideApi: true,
    requiresAuth: false,
    role: 'public',
    internal: true,
    readOnly: true,
    defaultEnabled: false,
    note: 'Public status endpoint; set LOAD_TEST_KEEPALIVE_TARGET to the dedicated non-production Worker origin.',
  });
}

// Next.js Route Handlers under frontend/app/api are a separate HTTP surface.
// The /api/v1/[...path] catch-all is intentionally excluded because it is a
// transport alias for the Express operations already catalogued above.
const frontendApiRoot = path.join(repoRoot, 'frontend/app/api');
for (const file of walk(frontendApiRoot).filter(file => file.endsWith('route.ts'))) {
  const relative = path.relative(frontendApiRoot, file).split(path.sep).join('/');
  if (relative === 'v1/[...path]/route.ts' || relative.includes('[...') || relative.includes('[[...')) continue;
  const source = fs.readFileSync(file, 'utf8');
  const routeSegments = relative.replace(/\/route\.ts$/, '').split('/');
  const routePath = normalizePath(`/api/${routeSegments.map(segment => segment.replace(/^\[([^\]]+)\]$/, ':$1')).join('/')}`);
  const methods = new Set([
    ...[...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|HEAD|POST|PUT|PATCH|DELETE)\s*\(/g)].map(match => match[1]),
    ...[...source.matchAll(/export\s+(?:const|let)\s+(GET|HEAD|POST|PUT|PATCH|DELETE)\s*=/g)].map(match => match[1]),
  ]);
  for (const method of methods) {
    const debugToggleRead = routePath === '/api/admin/debug-toggle' && method === 'GET';
    const cacheRevalidation = routePath === '/api/internal/cache/revalidate';
    const adminRoute = routePath.startsWith('/api/admin/');
    const readOnly = method === 'GET' || method === 'HEAD';
    entries.push({
      method,
      path: routePath,
      source: path.relative(repoRoot, file).split(path.sep).join('/'),
      group: 'frontend-api',
      scope: routePath.replace(/^\/api\//, '').replaceAll('/', '.'),
      targetKind: 'frontend-api',
      outsideApi: true,
      requiresAuth: adminRoute && !debugToggleRead,
      role: adminRoute && !debugToggleRead ? 'admin' : 'public',
      internal: true,
      readOnly: readOnly || (cacheRevalidation && method === 'GET'),
      defaultEnabled: false,
      ...(cacheRevalidation ? { note: 'POST requires a timestamped HMAC-SHA256 signature; configure signing in workload.config.js. GET deliberately returns 405.' } : {}),
      ...(adminRoute && !debugToggleRead ? { note: 'Requires a frontend admin session and the dedicated frontend origin.' } : {}),
    });
  }
}

const seen = new Set();
for (const entry of entries) {
  entry.id = operationId(entry.method, entry.path);
  const duplicateKey = `${entry.method} ${entry.path}`;
  if (seen.has(duplicateKey)) throw new Error(`Duplicate API operation discovered: ${duplicateKey}`);
  seen.add(duplicateKey);
  entry.pathParams = [...entry.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(match => match[1]);
  entry.writable = !entry.readOnly;
}

entries.sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const content = `/* AUTO-GENERATED by generate-route-inventory.mjs. DO NOT EDIT. */\nexport default ${JSON.stringify(entries, null, 2)};\n`;

if (CHECK) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
    console.error('Load-test route inventory is stale. Run: pnpm run loadtest:inventory');
    process.exitCode = 1;
  } else {
    console.log(`Load-test route inventory is current (${entries.length} operations).`);
  }
} else {
  fs.writeFileSync(output, content);
  console.log(`Generated ${entries.length} API operations: ${output}`);
}
