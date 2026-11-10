import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const repo = path.resolve(mobile, '../..');
const read = (relative) => fs.readFileSync(path.join(mobile, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(mobile, relative));
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const tabs = read('src/components/navigation/WorkspaceTabs.tsx');
const layout = read('app/_layout.tsx');
const policy = read('src/lib/navigation-policy.ts');
const explore = read('app/explore.tsx');
const products = read('app/my-products.tsx');
const salesInsights = read('app/sales-insights.tsx');
const salesCosts = read('app/sales-costs.tsx');
const api = read('src/features/sales/sales-extra.api.ts');
const webBrowse = fs.readFileSync(path.join(repo, 'frontend/lib/navigation.ts'), 'utf8');
const webStore = fs.readFileSync(path.join(repo, 'frontend/lib/myStoreHubTabs.ts'), 'utf8');
const webServices = fs.readFileSync(path.join(repo, 'frontend/lib/myServicesHubTabs.ts'), 'utf8');
const webSales = fs.readFileSync(path.join(repo, 'frontend/lib/salesHubTabs.ts'), 'utf8');
const webActivity = fs.readFileSync(path.join(repo, 'frontend/lib/activityHubTabs.ts'), 'utf8');
const webSettings = fs.readFileSync(path.join(repo, 'frontend/lib/settingsHubTabs.ts'), 'utf8');

const routeFiles = [
  'app/search.tsx', 'app/ads.tsx', 'app/products.tsx', 'app/services.tsx',
  'app/requests.tsx', 'app/stores.tsx', 'app/service-providers.tsx', 'app/sellers-ranking.tsx',
  'app/my-services.tsx', 'app/service-requests.tsx', 'app/appointments.tsx', 'app/service-provider-analytics.tsx',
  'app/seller-dashboard.tsx', 'app/my-products.tsx', 'app/store-collections.tsx', 'app/store-promotions.tsx',
  'app/store-team.tsx', 'app/my-store-analytics.tsx', 'app/my-store.tsx', 'app/store-hours.tsx',
  'app/my-sales.tsx', 'app/customers.tsx', 'app/debts.tsx', 'app/installments.tsx', 'app/sales-insights.tsx',
  'app/sales-costs.tsx', 'app/activity.tsx', 'app/my-ads.tsx', 'app/my-requests.tsx', 'app/my-reports.tsx',
  'app/settings.tsx', 'app/security.tsx', 'app/sessions.tsx', 'app/notifications.tsx', 'app/blocked-users.tsx',
];

check('mobile discovery exposes the eight web browse destinations (home remains bottom tab)',
  ['البحث','الإعلانات','المنتجات','الخدمات','سوق الطلبات','المتاجر','مقدمو الخدمة','أفضل البائعين'].every((label) => explore.includes(label)) && webBrowse.includes('BROWSE_LINKS'));
check('mobile store workspace exposes eight tabs including inventory',
  ['نظرة عامة','المنتجات','المجموعات','المخزون','العروض','الفريق','الإحصائيات','بيانات المتجر'].every((label) => tabs.includes(label)) && webStore.includes("'inventory'"));
check('mobile services workspace matches the four web sections',
  ['نظرة عامة','الطلبات الواردة','المواعيد','الإحصائيات'].every((label) => tabs.includes(label)) && webServices.includes("'appointments'"));
check('mobile sales workspace exposes all nine web sections',
  ['نظرة عامة','المبيعات','العملاء','الديون','الأقساط','الإحصائيات','التقارير','التكلفة الحقيقية','التحليلات الذكية'].every((label) => tabs.includes(label)) && webSales.includes("'smart'"));
check('mobile activity workspace matches the four web sections',
  ['النشاط','إعلاناتي','طلباتي','بلاغاتي'].every((label) => tabs.includes(label)) && webActivity.includes("'reports'"));
check('mobile settings workspace matches the five web sections',
  ['الملف الشخصي','الأمان','الجلسات','الإشعارات','المحظورون'].every((label) => tabs.includes(label)) && webSettings.includes("'blocked-users'"));
check('all workspace destinations exist as real Expo Router files', routeFiles.every(exists));
check('workspace tabs are mounted in the shared app chrome', layout.includes('<WorkspaceTabs workspace={workspace} />'));
check('inventory view is query-driven and filters existing product data', /useLocalSearchParams/.test(products) && /view === 'inventory'/.test(products) && /visibleItems/.test(products));
check('sales overview, analytics, reports and smart views call existing API endpoints',
  ['overview','analytics','reports','smart'].every((view) => salesInsights.includes(`'${view}'`)) &&
  ['/api/v1/sales/dashboard','/api/v1/sales/reports?','/api/v1/sales/smart-insights'].every((endpoint) => api.includes(endpoint)));
check('sales cost screen uses existing authenticated cost endpoints',
  ['/api/v1/sales/cost-settings','/api/v1/sales/cost-products'].every((endpoint) => api.includes(endpoint)) && salesCosts.includes('updateSalesProductCost'));
check('sales costs are included in private-route policy and sales workspace classification',
  policy.includes("'/sales-costs'") && layout.includes("'/sales-costs'"));
check('sales insights route is included in private-route policy and sales workspace classification',
  policy.includes("'/sales-insights'") && layout.includes("'/sales-insights'"));

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
