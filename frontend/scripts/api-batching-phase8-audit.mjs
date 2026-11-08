import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['backend overview route exists before the dynamic sale route', () => {
    const routes = read('apps/api/src/modules/sales/sales.routes.ts');
    return routes.indexOf("salesRouter.get('/debts/overview'") >= 0 && routes.indexOf("salesRouter.get('/debts/overview'") < routes.indexOf("salesRouter.get('/:id'");
  }],
  ['overview route remains authenticated by the router middleware', () => read('apps/api/src/modules/sales/sales.routes.ts').includes('salesRouter.use(authenticate)')],
  ['overview controller scopes both calls to the authenticated user', () => {
    const controller = read('apps/api/src/modules/sales/sales.controller.ts');
    const start = controller.indexOf('debtOverview: async');
    const end = controller.indexOf('debts: async', start);
    const block = controller.slice(start, end);
    return block.includes('requireUser(req)') && block.includes('salesService.debtOverview(user.userId');
  }],
  ['backend executes the existing summary and list logic concurrently', () => {
    const service = read('apps/api/src/modules/sales/sales.service.ts');
    const start = service.indexOf('debtOverview: async');
    const block = service.slice(start, service.indexOf('\n  },', start) + 5);
    return block.includes('Promise.allSettled') && block.includes('salesService.debtSummary(userId)') && block.includes('salesRepository.debts(userId, page, limit)');
  }],
  ['partial failures are represented independently', () => {
    const service = read('apps/api/src/modules/sales/sales.service.ts');
    const start = service.indexOf('debtOverview: async');
    const block = service.slice(start, service.indexOf('\n  },', start) + 5);
    return block.includes('failures:') && block.includes("summaryResult.status === 'rejected'") && block.includes("debtsResult.status === 'rejected'");
  }],
  ['frontend uses one typed overview API endpoint', () => read('frontend/api/sales.api.ts').includes("'/sales/debts/overview'")],
  ['both debt surfaces share the same query hook', () => {
    const page = read('frontend/components/sales/DebtsPageClient.tsx');
    const hub = read('frontend/components/sales/SalesDebtsSection.tsx');
    return page.includes('useDebts({ page, limit: 20 })') && hub.includes('useDebts({ page, limit: 20 })');
  }],
  ['query key includes pagination and user auth gating remains', () => {
    const hook = read('frontend/hooks/queries/useDebts.ts');
    const keys = read('frontend/lib/queryKeys.ts');
    return hook.includes('queryKeys.sales.debtOverview(page, limit)') && hook.includes('isAuthenticated && hasAccessToken && !isAuthResolving') && keys.includes('debtOverview: (page = 1, limit = 20)');
  }],
  ['legacy endpoints remain for backward compatibility', () => {
    const routes = read('apps/api/src/modules/sales/sales.routes.ts');
    return routes.includes("salesRouter.get('/debts/summary'") && routes.includes("salesRouter.get('/debts',");
  }],
  ['payment mutations invalidate the shared sales query root', () => read('frontend/hooks/mutations/useSaleMutations.ts').includes('invalidateQueries({ queryKey: queryKeys.sales.all() })')],
];

let failed = 0;
for (const [name, check] of checks) {
  const ok = Boolean(check());
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}\n`);
  if (!ok) failed += 1;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
