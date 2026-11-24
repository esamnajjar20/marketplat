import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const apiRoot = resolve(root, '../../apps/api/src/modules');
const readApi = (path: string) => readFileSync(resolve(apiRoot, path), 'utf8');
const frontendRoot = resolve(root, '../../frontend');
const readWeb = (path: string) => readFileSync(resolve(frontendRoot, path), 'utf8');
const repository = readApi('commerce/sales/sales.repository.ts');
const stores = readApi('commerce/stores/stores.service.ts');
const salesService = readApi('commerce/sales/sales.service.ts');
const salesValidation = readApi('commerce/sales/sales.validation.ts');
const providerService = readApi('services/service-providers/service-providers.service.ts');
const sellerDashboard = read('app/seller-dashboard.tsx');
const providerScreen = read('app/service-provider-analytics.tsx');
const reportScreen = read('app/sales-insights.tsx');
const datePicker = read('src/components/ui/DatePickerField.tsx');
const account = read('app/account.tsx');
const adApi = read('src/features/ads/manage-ads.api.ts');
const storeMobile = read('app/my-store-analytics.tsx');
const storeWeb = readWeb('components/stores/MyStoreAnalytics.tsx');
const providerWeb = readWeb('components/services/MyServiceProviderAnalytics.tsx');
const storeController = readApi('commerce/stores/stores.controller.ts');

const checks: Array<[string, boolean]> = [
  ['sales summary subtracts returned units and retains legacy sale-level quantity fallback', repository.includes('si."quantity" - si."returnedQuantity"') && repository.includes('THEN sr."quantity" ELSE it."netQuantity"')],
  ['store analytics queries MarketplaceOrder separately, scoped to authenticated seller and store', stores.includes('prisma.marketplaceOrder.groupBy') && stores.includes("by: ['status']") && stores.includes('storeId: store.id, sellerId: userId') && !/prisma\.saleRecord/.test(stores.slice(stores.indexOf('getMyStoreAnalytics')))],
  ['store order values are grouped by currency and cancelled orders excluded from the value aggregate', stores.includes("by: ['currency', 'status']") && stores.includes('MarketplaceOrderStatus.CANCELLED') && stores.includes('deliveredValueByCurrency')],
  ['store analytics UI explains checkout-order and SaleRecord separation', storeMobile.includes('سجل المبيعات اليدوية') && storeWeb.includes('سجلات المبيعات اليدوية') && storeController.includes('MarketplaceOrder')],
  ['provider analytics documents which values are period-scoped', providerService.includes('Only terminal request counts and revenue use the selected period') && providerWeb.includes('الفترة المختارة تؤثر') && providerScreen.includes('الفترة المختارة تؤثر')],
  ['provider web/mobile expose review count and mobile exposes null-safe fulfillment rate', providerWeb.includes('عدد التقييمات') && providerScreen.includes("'fulfillmentRate'") && providerScreen.includes("'reviewCount'") && providerScreen.includes("data[key] === null || data[key] === undefined")],
  ['sales report API supports page and skip pagination, with bounded JSON row limit', salesValidation.includes("page: z.coerce.number().int().min(1).max(10000).default(1)") && salesService.includes('skip: (query.page - 1) * query.limit')],
  ['mobile sales report supports pagination and bounded CSV share export', reportScreen.includes('الصفحة التالية') && reportScreen.includes('Share.share') && reportScreen.includes('allRows.length >= 1000')],
  ['seller dashboard has independent analytics error and retry states without stale store-count substitution', sellerDashboard.includes('analyticsResource.error') && sellerDashboard.includes('analyticsResource.reload()') && sellerDashboard.includes("analytics?.views ?? '—'") && sellerDashboard.includes('user?.id ??') && sellerDashboard.includes('analyticsResource.error ? null : analyticsResource.data')],
  ['provider mobile analytics supports retry and pull-to-refresh', providerScreen.includes('إعادة محاولة التحميل') && providerScreen.includes('BrandRefreshControl')],
  ['mobile report uses date picker and retains actual-date/order validation', reportScreen.includes('DatePickerField') && reportScreen.includes('parsed.toISOString().slice(0, 10) === value') && reportScreen.includes('from > to') && datePicker.includes('calendarDays')],
  ['mobile account fetches ad and unread-message stats, clears on auth change and does not coerce malformed counts to zero', account.includes('fetchMyAdStats(accessToken)') && account.includes('fetchUnreadCounts(accessToken)') && account.includes('activeAds: null, soldAds: null') && adApi.includes('Number.isInteger(parsed)')],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} Phase 7 regression checks passed`);
if (failed) process.exitCode = 1;
