import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [
  ['authenticated overview route exists', read('../apps/api/src/modules/sales/installments.routes.ts').includes("get('/overview', installmentsController.overview)")],
  ['controller delegates to seller-scoped service', /requireUser\(req\)[\s\S]*installmentsService\.overview\(u\.userId\)/.test(read('../apps/api/src/modules/sales/installments.controller.ts'))],
  ['service runs both established list methods in parallel', /Promise\.all\(\[[\s\S]*installmentsService\.upcoming\(sellerId\)[\s\S]*installmentsService\.overdue\(sellerId\)/.test(read('../apps/api/src/modules/sales/installments.service.ts'))],
  ['API client exposes one overview request', read('api/installments.api.ts').includes("'/sales/installments/overview'")],
  ['overview query is auth-gated', /isAuthenticated && hasAccessToken && !isAuthResolving/.test(read('hooks/queries/useInstallments.ts'))],
  ['both installments screens use the overview hook', ['components/sales/InstallmentsPageClient.tsx','components/sales/SalesInstallmentsSection.tsx'].every((file) => read(file).includes('useInstallmentsOverview'))],
  ['payment invalidates the combined overview cache', /installments\.overview\(\)/.test(read('hooks/mutations/useInstallmentMutations.ts'))],
  ['legacy separate installment requests are not used by the screens', ['components/sales/InstallmentsPageClient.tsx','components/sales/SalesInstallmentsSection.tsx'].every((file) => !/installmentsApi\.(upcoming|overdue)|use(Upcoming|Overdue)Installments/.test(read(file)))],
];

for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
const failed = checks.filter(([, passed]) => !passed);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
