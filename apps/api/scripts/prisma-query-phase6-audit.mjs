#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, condition, detail = '') => checks.push({ name, passed: Boolean(condition), detail });

const salesService = read('apps/api/src/modules/sales/sales.service.ts');
const salesRepository = read('apps/api/src/modules/sales/sales.repository.ts');
const salesServiceTests = read('apps/api/tests/unit/sales.service.test.ts');
const salesRepositoryTests = read('apps/api/tests/unit/sales.repository.test.ts');
const profiler = read('apps/api/scripts/profile-prisma-metrics.mjs');
const apiPackage = JSON.parse(read('apps/api/package.json'));
const rootPackage = JSON.parse(read('package.json'));

const posStart = salesService.indexOf('const preparePosItems = async');
const posEnd = salesService.indexOf('// Public sales statistics', posStart);
const posBlock = posStart >= 0 && posEnd > posStart ? salesService.slice(posStart, posEnd) : '';
const dashboardStart = salesService.indexOf('dashboard: async (userId: string) =>');
const dashboardEnd = salesService.indexOf('report: async', dashboardStart);
const dashboardBlock = dashboardStart >= 0 && dashboardEnd > dashboardStart
  ? salesService.slice(dashboardStart, dashboardEnd)
  : '';
const summaryStart = salesRepository.indexOf('summary: async (sellerId: string, from: Date, to: Date) =>');
const summaryEnd = salesRepository.indexOf('\n  chart:', summaryStart);
const summaryBlock = summaryStart >= 0 && summaryEnd > summaryStart
  ? salesRepository.slice(summaryStart, summaryEnd)
  : '';

check(
  'POS preparation fetches all distinct cart products in one Prisma findMany',
  /prisma\.product\.findMany\([\s\S]*?id: \{ in: Array\.from\(seen\) \}/.test(posBlock)
    && !/prisma\.product\.findUnique/.test(posBlock),
  'The up-to-200 item cart no longer performs one product lookup per line.'
);
check(
  'POS duplicate IDs are rejected before the database lookup',
  /for \(const item of input\.items\)[\s\S]*?seen\.has\(item\.productId\)[\s\S]*?seen\.add\(item\.productId\)[\s\S]*?const products = await prisma\.product\.findMany/.test(posBlock),
  'Duplicate cart rows fail before product retrieval or sale transaction.'
);
check(
  'POS store authorization is performed once for the supported single-store cart',
  /requireStoreAccess\(userId, storeId, 'manageProducts'\)/.test(posBlock)
    && /if \(storeId && storeId !== product\.storeId\)[\s\S]*?await requireStoreAccess\(userId, product\.storeId, 'manageProducts'\)/.test(posBlock),
  'Valid single-store carts authorize once; an invalid cross-store cart retains authorization of the second store before returning its validation error.'
);
check(
  'POS rejects deleted, missing and cross-store products',
  /!product \|\| product\.status === 'DELETED'/.test(posBlock)
    && /POS_MULTI_STORE_NOT_SUPPORTED/.test(posBlock),
  'Batch loading does not weaken product status or single-store validation.'
);
check(
  'POS regression tests verify one lookup, one authorization and the mixed-store guard',
  /loads a POS cart in one product query and authorizes its store once/.test(salesServiceTests)
    && /rejects a mixed-store POS cart before sale creation/.test(salesServiceTests)
    && /prisma\.product\.findMany\)\.toHaveBeenCalledTimes\(1\)/.test(salesServiceTests)
    && /loads a POS cart in one product query and authorizes its store once[\s\S]*?requireStoreAccess\)\.toHaveBeenCalledTimes\(1\)/.test(salesServiceTests)
    && /rejects a mixed-store POS cart before sale creation[\s\S]*?requireStoreAccess\)\.toHaveBeenCalledTimes\(2\)/.test(salesServiceTests),
  'Unit tests protect the request-count improvement and existing validation boundary.'
);
check(
  'Sales summary aggregates item costs in PostgreSQL instead of materializing item rows',
  /prisma\.\$queryRaw[\s\S]*?FROM "sale_items" si[\s\S]*?INNER JOIN "sale_records" sr/.test(summaryBlock)
    && !/prisma\.saleItem\.findMany/.test(summaryBlock),
  'Returned quantities and nullable costs are applied within the database aggregate.'
);
check(
  'Item cost aggregate is tenant- and date-scoped with parameterized values',
  /sr\."sellerId" = \$\{sellerId\}[\s\S]*?sr\."soldAt" >= \$\{from\}[\s\S]*?sr\."soldAt" < \$\{to\}/.test(summaryBlock)
    && /COALESCE\(si\."costPrice", 0\)/.test(summaryBlock)
    && /GREATEST\(si\."quantity" - si\."returnedQuantity", 0\)/.test(summaryBlock),
  'The SQL query uses bound seller/date parameters and preserves null/return cost semantics.'
);
check(
  'Repository regression tests cover aggregate values and absence of item materialization',
  /aggregates historical item cost in PostgreSQL instead of loading every sale item/.test(salesRepositoryTests)
    && /saleItem\.findMany\)\.not\.toHaveBeenCalled/.test(salesRepositoryTests)
    && /totalCost: 12\.35/.test(salesRepositoryTests),
  'Tests cover rounded numeric results and ensure historical item rows are not fetched.'
);
check(
  'Dashboard computes the current summary once and shares it with compare.current',
  (dashboardBlock.match(/salesRepository\.summary\(/g) || []).length === 2
    && !/salesService\.(?:summary|compare)\(/.test(dashboardBlock)
    && /buildComparison\('month', summary, previousSummary\)/.test(dashboardBlock),
  'The duplicate current-period summary aggregate is removed and both fields share the same object.'
);
check(
  'Comparison windows preserve equal-duration previous-period boundaries',
  /getPreviousPeriodStart = \(end: Date, currentStart: Date\)/.test(salesService)
    && /salesRepository\.summary\(userId, previousStart, currentStart\)/.test(salesService),
  'The previous range ends at the current-period start and keeps the original elapsed duration.'
);
check(
  'Dashboard regression test verifies the reused summary and two summary calls',
  /reuses the current-month summary for both dashboard summary and comparison/.test(salesServiceTests)
    && /salesRepository\.summary\)\.toHaveBeenCalledTimes\(2\)/.test(salesServiceTests)
    && /result\.compare\.current\)\.toBe\(current\)/.test(salesServiceTests),
  'The redundant current-month summary cannot silently return.'
);
check(
  'Profile CLI authenticates safely and uses a bounded request timeout',
  /process\.env\.METRICS_TOKEN/.test(profiler)
    && /headers\.Authorization/.test(profiler)
    && /AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/.test(profiler)
    && /REQUEST_TIMEOUT_MS = 10_000/.test(profiler)
    && /url\.search/.test(profiler)
    && /url\.protocol === 'http:' && !isLoopback/.test(profiler)
    && !/console\.(?:log|error).*METRICS_TOKEN/.test(profiler),
  'The profiler reads /metrics, never prints credentials, and does not send remote bearer tokens over plaintext HTTP.'
);
check(
  'Profile CLI reports request query count/time percentiles and N+1 candidates as heuristics',
  /prisma_queries_per_http_request_bucket/.test(profiler)
    && /prisma_query_time_per_http_request_seconds_bucket/.test(profiler)
    && /prisma_repeated_query_groups_total/.test(profiler)
    && /heuristics, not proven N\+1/.test(profiler)
    && /pg_stat_statements/.test(profiler),
  'The tool ranks routes using Prometheus histograms and explicitly states instrumentation limits.'
);
check(
  'Profile CLI merges histogram bucket counts across HTTP status labels',
  /getRoute\(labels\)\.queryCount \+= value/.test(profiler)
    && /countsByBound\.set\(bucket\.bound, \(countsByBound\.get\(bucket\.bound\) \|\| 0\) \+ bucket\.count\)/.test(profiler)
    && /127\.0\.0\.1:5000\/metrics/.test(profiler),
  'Request counts and cumulative buckets are combined correctly per method/route, using the API default port.'
);
check(
  'Phase-6 audit and database profiler commands are registered in both workspaces',
  apiPackage.scripts?.['audit:db-query-phase6'] === 'node scripts/prisma-query-phase6-audit.mjs'
    && apiPackage.scripts?.['profile:db-queries'] === 'node scripts/profile-prisma-metrics.mjs'
    && rootPackage.scripts?.['audit:db-query-phase6'] === 'pnpm --filter classifieds-platform-backend audit:db-query-phase6'
    && rootPackage.scripts?.['profile:db-queries'] === 'pnpm --filter classifieds-platform-backend profile:db-queries',
  'Both tasks are available from the monorepo root.'
);

const passed = checks.filter(item => item.passed).length;
for (const item of checks) {
  process.stdout.write(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}\n`);
}
process.stdout.write(`\nPrisma query phase 6: ${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exitCode = 1;
