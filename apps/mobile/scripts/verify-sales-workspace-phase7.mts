import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const tabs = read('src/components/navigation/WorkspaceTabs.tsx');
const screen = read('app/sales-insights.tsx');
const api = read('src/features/sales/sales-extra.api.ts');
const layout = read('app/_layout.tsx');
const policy = read('src/lib/navigation-policy.ts');
const routes = readFileSync(resolve(root, '../../apps/api/src/modules/commerce/sales/sales.routes.ts'), 'utf8');
const checks = [
  ['workspace exposes overview, analytics, reports and smart insights', ['view: \'overview\'', 'view: \'analytics\'', 'view: \'reports\'', 'view: \'smart\''].every((x) => tabs.includes(x))],
  ['mobile screen implements all four sales views', ['overview', 'analytics', 'reports', 'smart'].every((x) => screen.includes(`'${x}'`))],
  ['mobile API calls existing dashboard/report/smart-insights endpoints', ['/api/v1/sales/dashboard', '/api/v1/sales/reports?', '/api/v1/sales/smart-insights'].every((x) => api.includes(x))],
  ['backend registers dashboard/report/smart-insights routes', ["'/dashboard'", "'/reports'", "'/smart-insights'"].every((x) => routes.includes(x))],
  ['workspace chrome recognizes sales insights route', layout.includes("'/sales-insights'")],
  ['sales insights route is protected', policy.includes("'/sales-insights'")],
  ['report filters are applied explicitly instead of fetching on each keystroke', screen.includes('appliedFilters') && screen.replace(/\s+/g, ' ').includes('setAppliedFilters({ from, to, status })')],
  ['report dates are validated as real calendar dates and ordered correctly', screen.includes('parsed.toISOString().slice(0, 10) === value') && screen.includes('from > to')],
  ['backend exposes CSV report endpoint', routes.includes("'/reports.csv'")],
  ['mobile shares CSV content through the native share sheet with a bounded export cap', screen.includes('Share.share') && screen.includes('\\uFEFF') && screen.includes('allRows.length >= 1000')],
  ['mobile reports paginate through API page and limit parameters', api.includes('page: String(Math.max(1, Math.trunc(filters.page ?? 1)))') && screen.includes('reportPage') && screen.includes('الصفحة التالية')],
];
let failed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed++; }
if (failed) process.exitCode = 1;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
