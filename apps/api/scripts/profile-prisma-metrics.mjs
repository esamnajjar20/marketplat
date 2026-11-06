#!/usr/bin/env node

/**
 * Read one Prometheus scrape and rank routes by Prisma work.
 *
 * Usage:
 *   METRICS_URL=https://api.example.com/metrics METRICS_TOKEN=... \
 *     node scripts/profile-prisma-metrics.mjs
 *
 * The script reads only the existing metrics endpoint. It does not query the
 * database, write files, print credentials, or expose raw SQL/parameter data.
 */

const DEFAULT_METRICS_URL = 'http://127.0.0.1:5000/metrics';
const REQUEST_TIMEOUT_MS = 10_000;
const TOP_ROUTES = 15;

const unescapeLabel = value => value
  .replace(/\\n/g, '\n')
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, '\\');

const parseLabels = source => {
  const labels = {};
  if (!source) return labels;
  const body = source.slice(1, -1);
  const labelPattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = labelPattern.exec(body))) labels[match[1]] = unescapeLabel(match[2]);
  return labels;
};

const parseMetrics = text => {
  const samples = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|NaN|[+-]?Inf)(?:\s+\d+)?$/);
    if (!match) continue;
    const rawValue = match[3];
    const value = rawValue === '+Inf' || rawValue === 'Inf'
      ? Number.POSITIVE_INFINITY
      : rawValue === '-Inf'
        ? Number.NEGATIVE_INFINITY
        : Number(rawValue);
    if (Number.isNaN(value)) continue;
    samples.push({ name: match[1], labels: parseLabels(match[2]), value });
  }
  return samples;
};

const percentileFromCumulativeBuckets = (buckets, count, percentile) => {
  if (!count || count <= 0) return null;
  const target = count * percentile;
  // Prometheus exports one cumulative bucket series per label set (for this
  // histogram, usually one per status_code). Merge equal bounds before
  // computing the percentile across a route's combined status codes.
  const countsByBound = new Map();
  for (const bucket of buckets) {
    countsByBound.set(bucket.bound, (countsByBound.get(bucket.bound) || 0) + bucket.count);
  }
  const ordered = [...countsByBound.entries()].sort((a, b) => a[0] - b[0]);
  for (const [bound, bucketCount] of ordered) {
    if (bucketCount >= target) return Number.isFinite(bound) ? bound : null;
  }
  return null;
};

const metricUrl = process.env.METRICS_URL || DEFAULT_METRICS_URL;
let url;
try {
  url = new URL(metricUrl);
} catch {
  process.stderr.write('Invalid METRICS_URL. Provide an absolute HTTP(S) URL.\n');
  process.exit(2);
}
const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  (url.protocol === 'http:' && !isLoopback)
) {
  process.stderr.write(
    'METRICS_URL must use HTTPS (or HTTP on loopback) and must not contain credentials, query strings or fragments.\n'
  );
  process.exit(2);
}

const headers = { Accept: 'text/plain; version=0.0.4, application/openmetrics-text' };
if (process.env.METRICS_TOKEN) headers.Authorization = `Bearer ${process.env.METRICS_TOKEN}`;

let response;
try {
  response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
} catch (error) {
  process.stderr.write(`Unable to reach the metrics endpoint: ${error?.name || 'network error'}\n`);
  process.exit(1);
}
if (!response.ok) {
  process.stderr.write(`Metrics endpoint returned HTTP ${response.status}. Check METRICS_URL and METRICS_TOKEN.\n`);
  process.exit(1);
}

const samples = parseMetrics(await response.text());
if (!samples.length) {
  process.stderr.write('No Prometheus samples were found in the response.\n');
  process.exit(1);
}

const routes = new Map();
const slowQueries = new Map();
const repeatedShapes = new Map();
const routeKey = labels => `${labels.method || 'OTHER'} ${labels.route || 'unmatched'}`;
const getRoute = labels => {
  const key = routeKey(labels);
  if (!routes.has(key)) {
    routes.set(key, {
      key,
      requests: 0,
      querySum: 0,
      queryBuckets: [],
      queryCount: 0,
      dbTimeSum: 0,
      dbTimeBuckets: [],
      dbTimeCount: 0,
    });
  }
  return routes.get(key);
};

for (const sample of samples) {
  const { name, labels, value } = sample;
  if (name === 'prisma_queries_per_http_request_count') {
    getRoute(labels).requests += value;
    getRoute(labels).queryCount += value;
  } else if (name === 'prisma_queries_per_http_request_sum') {
    getRoute(labels).querySum += value;
  } else if (name === 'prisma_queries_per_http_request_bucket') {
    const bound = labels.le === '+Inf' || labels.le === 'Inf'
      ? Number.POSITIVE_INFINITY
      : Number(labels.le);
    if (Number.isFinite(bound) || bound === Number.POSITIVE_INFINITY) {
      getRoute(labels).queryBuckets.push({ bound, count: value });
    }
  } else if (name === 'prisma_query_time_per_http_request_seconds_count') {
    getRoute(labels).dbTimeCount += value;
  } else if (name === 'prisma_query_time_per_http_request_seconds_sum') {
    getRoute(labels).dbTimeSum += value;
  } else if (name === 'prisma_query_time_per_http_request_seconds_bucket') {
    const bound = labels.le === '+Inf' || labels.le === 'Inf'
      ? Number.POSITIVE_INFINITY
      : Number(labels.le);
    if (Number.isFinite(bound) || bound === Number.POSITIVE_INFINITY) {
      getRoute(labels).dbTimeBuckets.push({ bound, count: value });
    }
  } else if (name === 'prisma_slow_queries_total') {
    const key = `${labels.model || '$raw'}.${labels.action || 'unknown'}`;
    slowQueries.set(key, (slowQueries.get(key) || 0) + value);
  } else if (name === 'prisma_repeated_query_groups_total') {
    const key = `${labels.method || 'OTHER'} ${labels.route || 'unmatched'} | ${labels.model || '$raw'}.${labels.action || 'unknown'}`;
    repeatedShapes.set(key, (repeatedShapes.get(key) || 0) + value);
  }
}

const rankedRoutes = [...routes.values()]
  .filter(route => route.requests > 0)
  .map(route => ({
    ...route,
    averageQueries: route.queryCount > 0 ? route.querySum / route.queryCount : null,
    p95Queries: percentileFromCumulativeBuckets(route.queryBuckets, route.queryCount, 0.95),
    averageDbMs: route.dbTimeCount > 0 ? (route.dbTimeSum / route.dbTimeCount) * 1000 : null,
    p95DbMs: percentileFromCumulativeBuckets(route.dbTimeBuckets, route.dbTimeCount, 0.95) === null
      ? null
      : percentileFromCumulativeBuckets(route.dbTimeBuckets, route.dbTimeCount, 0.95) * 1000,
  }))
  .sort((a, b) => (b.averageDbMs ?? 0) - (a.averageDbMs ?? 0))
  .slice(0, TOP_ROUTES);

const format = value => value === null || value === undefined ? 'n/a' : value.toFixed(2);
process.stdout.write(`Prisma route profile (${url.origin}${url.pathname})\n`);
process.stdout.write('Ranked by average cumulative Prisma-operation time per HTTP request.\n\n');
if (!rankedRoutes.length) {
  process.stdout.write('No completed HTTP routes with Prisma telemetry were found yet.\n');
} else {
  process.stdout.write('Route | Requests | Avg ops | P95 ops | Avg DB ms | P95 DB ms\n');
  process.stdout.write('--- | ---: | ---: | ---: | ---: | ---:\n');
  rankedRoutes.forEach((route, index) => {
    process.stdout.write(`${index + 1}. ${route.key} | ${route.requests} | ${format(route.averageQueries)} | ${format(route.p95Queries)} | ${format(route.averageDbMs)} | ${format(route.p95DbMs)}\n`);
  });
}

const topRepeated = [...repeatedShapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
if (topRepeated.length) {
  process.stdout.write('\nRepeated query-shape candidates (heuristics, not proven N+1):\n');
  for (const [key, count] of topRepeated) process.stdout.write(`- ${key}: ${count}\n`);
}

const topSlow = [...slowQueries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
if (topSlow.length) {
  process.stdout.write('\nSlow Prisma operations (>= configured threshold):\n');
  for (const [key, count] of topSlow) process.stdout.write(`- ${key}: ${count}\n`);
}

process.stdout.write('\nNote: Prisma operation timing is application-side and is not a substitute for PostgreSQL EXPLAIN (ANALYZE, BUFFERS) or pg_stat_statements.\n');
