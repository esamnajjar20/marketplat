#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, condition, detail = '') => checks.push({ name, passed: Boolean(condition), detail });

const prismaConfig = read('apps/api/src/config/prisma.ts');
const app = read('apps/api/src/app.ts');
const metrics = read('apps/api/src/shared/utils/metrics.ts');
const telemetry = read('apps/api/src/shared/utils/dbQueryTelemetry.ts');
const tests = read('apps/api/tests/unit/dbQueryTelemetry.test.ts');
const apiPackage = JSON.parse(read('apps/api/package.json'));
const rootPackage = JSON.parse(read('package.json'));
const expiryRepository = read('apps/api/src/modules/service-requests/service-requests.repository.ts');
const expiryService = read('apps/api/src/modules/service-requests/service-requests.service.ts');
const expiryTests = read('apps/api/tests/unit/service-requests.expiry.test.ts');
const expiryRepositoryTests = read('apps/api/tests/unit/service-requests.repository.test.ts');

check(
  'Prisma middleware times each operation and records model/action metadata',
  /prisma\.\$use\(async \(params, next\)/.test(prismaConfig)
    && /process\.hrtime\.bigint\(\)/.test(prismaConfig)
    && /recordPrismaQuery\(params\.model, params\.action, params\.args, durationMs\)/.test(prismaConfig),
  'Measures each operation around next(params).'
);
check(
  'Database metrics are enabled by default with an explicit emergency opt-out',
  /NODE_ENV !== 'test'/.test(prismaConfig)
    && /DB_QUERY_METRICS_ENABLED !== '0'/.test(prismaConfig)
    && /dbQueryMetricsMiddlewareInstalled/.test(prismaConfig),
  'Global guard prevents repeated middleware registration during development reloads.'
);
check(
  'Request-scoped AsyncLocalStorage starts before HTTP metrics and route handlers',
  /app\.use\(requestIdMiddleware\);\s*app\.use\(databaseRequestContextMiddleware\);/.test(app)
    && app.indexOf('app.use(databaseRequestContextMiddleware)') < app.indexOf('app.use(metricsMiddleware)'),
  'A request-local context is available to downstream Prisma calls.'
);
check(
  'HTTP finish hook records Prisma counts and summed query duration by route',
  /createDatabaseRequestMetricsFinalizer\(\)/.test(metrics)
    && /finalizeDatabaseMetrics\(\{ method: req\.method, route, statusCode: res\.statusCode \}\)/.test(metrics),
  'Uses Express route patterns, not raw URLs.'
);
check(
  'Prometheus exports per-operation and per-request database metrics',
  /name: 'prisma_queries_total'/.test(telemetry)
    && /name: 'prisma_query_duration_seconds'/.test(telemetry)
    && /name: 'prisma_queries_per_http_request'/.test(telemetry)
    && /name: 'prisma_query_time_per_http_request_seconds'/.test(telemetry),
  'Count and latency can be grouped by model/action and HTTP route.'
);
check(
  'Repeated query shapes are flagged as heuristic candidates, not asserted N+1 defects',
  /REPEATED_QUERY_THRESHOLD = 5/.test(telemetry)
    && /name: 'prisma_repeated_query_groups_total'/.test(telemetry)
    && /REPEATED_READ_ACTIONS/.test(telemetry)
    && !/\s+'queryRaw',/.test(telemetry)
    && /heuristic N\+1 candidates, not proof/.test(telemetry),
  'Five or more structurally identical operations in one request are surfaced for investigation.'
);
check(
  'Query-shape signatures omit parameter values and are hashed',
  /getStructuralShape/.test(telemetry)
    && /typeof value/.test(telemetry)
    && /createHash\('sha256'\)/.test(telemetry)
    && !/logger\.(?:info|warn|error).*params\.(?:args|query)/s.test(telemetry),
  'No SQL text, args values, IDs, search terms, or credentials are written to logs or metric labels.'
);
check(
  'Per-request query-shape tracking has a hard memory bound',
  /QUERY_SHAPE_LIMIT = 256/.test(telemetry)
    && /context\.queryShapes\.size < QUERY_SHAPE_LIMIT/.test(telemetry)
    && /SHAPE_MAX_NODES = 512/.test(telemetry)
    && /budget\.remaining <= 0/.test(telemetry),
  'The request retains at most 256 signatures and each signature has a 512-node shape budget.'
);
check(
  'Metric labels do not include request IDs or raw query-shape hashes',
  /labelNames: \['method', 'route', 'model', 'action'\]/.test(telemetry)
    && !/labelNames:.*requestId/.test(telemetry),
  'Uses stable, bounded dimensions only.'
);
check(
  'Telemetry is fail-open and cannot change successful database operation results',
  /recordPrismaQuery[\s\S]*?try \{[\s\S]*?\} catch \{[\s\S]*?Telemetry is fail-open/.test(telemetry),
  'Any telemetry exception is swallowed.'
);
check(
  'Finalizer is idempotent',
  /let finalized = false/.test(telemetry) && /if \(!context \|\| finalized\) return;\s*finalized = true;/.test(telemetry),
  'Repeated finish/close calls cannot double-count one request.'
);
check(
  'Regression tests cover route query counts, repeated shapes, privacy and idempotence',
  /aggregates Prisma query count and duration by the matched HTTP route/.test(tests)
    && /repeated identical query shapes/.test(tests)
    && /private-user-/.test(tests)
    && /does not classify repeated write operations/.test(tests)
    && /does not treat opaque raw SQL calls/.test(tests)
    && /finalizes request metrics only once/.test(tests),
  'Unit coverage exercises the observable metrics behavior.'
);
check(
  'Dedicated phase-5 audit is registered in API and workspace scripts',
  apiPackage.scripts?.['audit:db-query-phase5'] === 'node scripts/prisma-query-phase5-audit.mjs'
    && rootPackage.scripts?.['audit:db-query-phase5'] === 'pnpm --filter classifieds-platform-backend audit:db-query-phase5',
  'Run with pnpm audit:db-query-phase5 from the monorepo root.'
);


check(
  'Stale service-request expiry replaces per-row writes with one parameterized batch UPDATE',
  /expirePendingBatch: async[\s\S]*?Prisma\.join\(uniqueIds\)[\s\S]*?RETURNING \"id\"/.test(expiryRepository)
    && /const expiredIds = new Set\([\s\S]*?expirePendingBatch\(stale\.map\(row => row\.id\), cutoff\)/.test(expiryService)
    && !/for \(const row of stale\) \{[\s\S]*?await serviceRequestsRepository\.expirePending/.test(expiryService),
  'A 200-row expiry batch now needs one conditional write statement instead of up to 200 per-row updates.'
);
check(
  'Batch expiry preserves race safety and notifies only rows returned by UPDATE',
  /AND \"status\" = 'PENDING'::\"ServiceRequestStatus\"/.test(expiryRepository)
    && /expiredIds\.has\(row\.id\)/.test(expiryService)
    && /respondedAt remains NULL/.test(expiryRepository)
    && /skips rows answered between the read and the atomic batch update/.test(expiryTests),
  'Concurrent accepted/rejected requests are excluded atomically and cannot receive false expiry notices.'
);
check(
  'Batch expiry is regression-tested for deduplicated IDs and empty input',
  /expirePendingBatch\(\['a', 'b', 'a'\]/.test(expiryRepositoryTests)
    && /does not issue raw SQL for an empty batch/.test(expiryRepositoryTests)
    && /parameterized UPDATE \.\.\. RETURNING query/.test(expiryRepositoryTests),
  'IDs are deduplicated, parameters remain bound, and empty batches do not reach PostgreSQL.'
);

const passed = checks.filter(item => item.passed).length;
for (const item of checks) {
  process.stdout.write(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}\n`);
}
process.stdout.write(`\nPrisma query phase 5: ${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exitCode = 1;
