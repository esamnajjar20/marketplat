import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import client from 'prom-client';
import { register } from './metricsRegistry';

const QUERY_SHAPE_LIMIT = 256;
const REPEATED_QUERY_THRESHOLD = 5;
const SHAPE_MAX_DEPTH = 5;
const SHAPE_MAX_KEYS = 40;
const SHAPE_MAX_NODES = 512;
const REPEATED_READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

interface QueryGroup {
  model: string;
  action: string;
  count: number;
}

interface DatabaseRequestContext {
  method: string;
  queryCount: number;
  queryDurationSeconds: number;
  queryShapes: Map<string, QueryGroup>;
}

export interface DatabaseRequestLabels {
  method: string;
  route: string;
  statusCode: number;
}

const requestContext = new AsyncLocalStorage<DatabaseRequestContext>();

const safeMetricLabel = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback;
  const normalized = value.slice(0, 80);
  return /^[a-zA-Z0-9_.$-]+$/.test(normalized) ? normalized : fallback;
};

/**
 * Build a shape-only representation of Prisma args. Values are never read
 * into the output: IDs, search terms, phone numbers, tokens and other bound
 * values cannot enter logs, metric labels or the in-memory signature.
 */
const getStructuralShape = (
  value: unknown,
  depth = 0,
  budget: { remaining: number } = { remaining: SHAPE_MAX_NODES }
): unknown => {
  if (budget.remaining <= 0) return 'node-limit';
  budget.remaining -= 1;

  if (depth >= SHAPE_MAX_DEPTH) return 'depth-limit';
  if (value === null) return 'null';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) {
    return [
      'array',
      value.length === 0 ? 'empty' : 'non-empty',
      value.length ? getStructuralShape(value[0], depth + 1, budget) : null,
    ];
  }
  if (typeof value !== 'object') return typeof value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return `instance:${prototype?.constructor?.name ?? 'unknown'}`;
  }

  const allKeys = Object.keys(value as Record<string, unknown>);
  const keys = allKeys.sort().slice(0, SHAPE_MAX_KEYS);
  const shape = keys.map(key => [
    key,
    getStructuralShape((value as Record<string, unknown>)[key], depth + 1, budget),
  ]);
  if (allKeys.length > SHAPE_MAX_KEYS) shape.push(['*', 'keys-truncated']);
  if (budget.remaining <= 0) shape.push(['*', 'nodes-truncated']);
  return shape;
};

const createQueryShapeKey = (model: string, action: string, args: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify([model, action, getStructuralShape(args)]))
    .digest('hex');

export const prismaQueriesTotal = new client.Counter({
  name: 'prisma_queries_total',
  help: 'Prisma operations executed, grouped by stable model and action labels',
  labelNames: ['model', 'action'] as const,
  registers: [register],
});

export const prismaQueryDurationSeconds = new client.Histogram({
  name: 'prisma_query_duration_seconds',
  help: 'Duration of individual Prisma operations in seconds, grouped by model and action',
  labelNames: ['model', 'action'] as const,
  buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const prismaQueriesPerHttpRequest = new client.Histogram({
  name: 'prisma_queries_per_http_request',
  help: 'Number of Prisma operations executed while handling one HTTP request',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0, 1, 2, 3, 5, 8, 13, 20, 35, 50, 100, 200],
  registers: [register],
});

export const prismaQueryTimePerHttpRequestSeconds = new client.Histogram({
  name: 'prisma_query_time_per_http_request_seconds',
  help: 'Sum of Prisma operation durations per HTTP request in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const prismaRepeatedQueryMaxPerHttpRequest = new client.Histogram({
  name: 'prisma_repeated_query_max_per_http_request',
  help: 'Maximum repetitions of one identical Prisma query shape within one HTTP request',
  labelNames: ['method', 'route'] as const,
  buckets: [0, 1, 2, 3, 5, 8, 13, 20, 50, 100],
  registers: [register],
});

export const prismaRepeatedQueryGroupsTotal = new client.Counter({
  name: 'prisma_repeated_query_groups_total',
  help: 'Read-query shapes repeated at least five times per request; heuristic N+1 candidates, not proof',
  labelNames: ['method', 'route', 'model', 'action'] as const,
  registers: [register],
});

export const prismaSlowQueriesTotal = new client.Counter({
  name: 'prisma_slow_queries_total',
  help: 'Prisma operations taking at least 250ms, grouped by model and action',
  labelNames: ['model', 'action'] as const,
  registers: [register],
});

/** Start request-scoped aggregation before any API route can call Prisma. */
export const databaseRequestContextMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  requestContext.run(
    {
      method: safeMetricLabel(req.method.toUpperCase(), 'OTHER'),
      queryCount: 0,
      queryDurationSeconds: 0,
      queryShapes: new Map(),
    },
    next
  );
};

/**
 * Called by Prisma middleware. It intentionally receives metadata only and
 * never logs SQL text or parameter values. Outside HTTP requests (cron/jobs),
 * global query metrics still record count and duration.
 */
export const recordPrismaQuery = (
  modelName: string | undefined,
  actionName: string,
  args: unknown,
  durationMs: number
): void => {
  try {
    const model = safeMetricLabel(modelName, '$raw');
    const action = safeMetricLabel(actionName, 'unknown');
    const safeDurationMs = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    const durationSeconds = safeDurationMs / 1_000;

    prismaQueriesTotal.inc({ model, action });
    prismaQueryDurationSeconds.observe({ model, action }, durationSeconds);
    if (safeDurationMs >= 250) prismaSlowQueriesTotal.inc({ model, action });

    const context = requestContext.getStore();
    if (!context) return;

    context.queryCount += 1;
    context.queryDurationSeconds += durationSeconds;

    // Only repeated reads are N+1 candidates; repeated writes remain visible
    // in the total and latency metrics but are not mislabeled as N+1 reads.
    if (!REPEATED_READ_ACTIONS.has(action)) return;

    // Keep the per-request signature map bounded. A request with an unusual
    // number of distinct query shapes still contributes to count/time metrics.
    const signature = createQueryShapeKey(model, action, args);
    const existing = context.queryShapes.get(signature);
    if (existing) {
      existing.count += 1;
    } else if (context.queryShapes.size < QUERY_SHAPE_LIMIT) {
      context.queryShapes.set(signature, { model, action, count: 1 });
    }
  } catch {
    // Telemetry is fail-open: metrics must never change a DB operation result.
  }
};

/**
 * Capture the current request context when the HTTP metrics middleware is
 * registered. The returned finalizer is idempotent and safe to call on finish
 * or close paths without double-counting a request.
 */
export const createDatabaseRequestMetricsFinalizer = (): ((labels: DatabaseRequestLabels) => void) => {
  const context = requestContext.getStore();
  let finalized = false;

  return labels => {
    if (!context || finalized) return;
    finalized = true;

    const metricLabels = {
      method: safeMetricLabel(labels.method.toUpperCase(), 'OTHER'),
      route: labels.route.slice(0, 200) || 'unmatched',
      status_code: String(labels.statusCode),
    };

    prismaQueriesPerHttpRequest.observe(metricLabels, context.queryCount);
    prismaQueryTimePerHttpRequestSeconds.observe(metricLabels, context.queryDurationSeconds);

    let maximumRepetitions = 0;
    for (const group of context.queryShapes.values()) {
      maximumRepetitions = Math.max(maximumRepetitions, group.count);
      if (group.count >= REPEATED_QUERY_THRESHOLD) {
        prismaRepeatedQueryGroupsTotal.inc({
          method: metricLabels.method,
          route: metricLabels.route,
          model: group.model,
          action: group.action,
        });
      }
    }

    prismaRepeatedQueryMaxPerHttpRequest.observe(
      { method: metricLabels.method, route: metricLabels.route },
      maximumRepetitions
    );
  };
};
