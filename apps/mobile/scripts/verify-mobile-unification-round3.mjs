#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFile(join(root, path), 'utf8');
const [orders, sellerOrders, notifications, sales, debts, customers, ordersApi, messagingApi, salesApi, salesExtraApi, pager] = await Promise.all([
  read('app/orders.tsx'),
  read('app/seller-orders.tsx'),
  read('app/notifications.tsx'),
  read('app/my-sales.tsx'),
  read('app/debts.tsx'),
  read('app/customers.tsx'),
  read('src/features/commerce/orders.api.ts'),
  read('src/features/messaging/messaging.api.ts'),
  read('src/features/sales/sales.api.ts'),
  read('src/features/sales/sales-extra.api.ts'),
  read('src/hooks/usePaginatedList.ts'),
]);
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

for (const [name, source] of [['orders', orders], ['seller orders', sellerOrders], ['notifications', notifications], ['sales', sales], ['debts', debts], ['customers', customers]]) {
  check(`${name} delegates numbered pagination to usePaginatedList`, /usePaginatedList/.test(source));
  check(`${name} exposes shared refresh and load-more states`, /list\.refresh\b/.test(source) && (/list\.loadMore\b/.test(source) || /PaginatedFooter/.test(source)));
  check(`${name} exposes retry for failed loads`, (/list\.retry\(/.test(source) || /<ListEmpty\b/.test(source) || /<ListStaleError\b/.test(source)));
  check(`${name} has no competing local page state`, !/useState\(1\).*page|const \[page, setPage\]|const loadMore\s*=/.test(source));
}
check('my orders forwards AbortSignal into authenticated API request', /fetchMyOrders\([^\n]+signal\)/.test(orders) && /signal\?: AbortSignal/.test(ordersApi) && /\{ token, signal, cacheOwnerId/.test(ordersApi));
check('seller orders forwards AbortSignal into authenticated API request', /fetchSellerOrders\([^\n]+signal\)/.test(sellerOrders) && /\{ token, signal, cacheOwnerId/.test(ordersApi));
check('notification page supports request cancellation', /fetchNotificationsPage\([^\n]+signal, user\?\.id\)/.test(notifications) && /unreadOnly = false, signal\?: AbortSignal/.test(messagingApi) && /\{ token, signal, cacheOwnerId: ownerId \?\? undefined, responseSchema: notificationListEnvelopeResponseSchema/.test(messagingApi));
check('notification optimistic read updates use the shared list state', /list\.updateItems/.test(notifications) && /markNotificationRead/.test(notifications) && /markAllNotificationsRead/.test(notifications));
check('sales filters partition list identity while summary period remains independent', /key: `sales:\$\{user\?\.id \?\? 'guest'\}:\$\{status\}`/.test(sales) && /loadSummary/.test(sales) && /setPeriod/.test(sales));
check('sales list and summary requests both support cancellation', /fetchSales\([^\n]+signal\)/.test(sales) && /fetchSalesSummary\([^\n]+signal\)/.test(sales) && /signal\?: AbortSignal/.test(salesApi));
check('shared pager preserves failed append page for retry', /lastFailedRequestRef\.current = \{ kind: 'more', page: requestedPage \}/.test(pager) && /if \(failed\.kind === 'page'\)/.test(pager));
check('both order screens prioritize failed-page retry over loading next page', /list\.loadMoreError \? \(?\s*<(?:Pressable|PrimaryButton)/.test(orders) && /list\.loadMoreError \? \(?\s*<(?:Pressable|PrimaryButton)/.test(sellerOrders));
check('debt and customer pages keep summary requests separate and cancellable', /fetchDebtSummary\(accessToken, controller\.signal, (?:user\.id|userId)\)/.test(debts) && /fetchCustomerSummary\(token, controller\.signal, (?:user\.id|userId)\)/.test(customers) && /signal\?: AbortSignal/.test(salesExtraApi));
check('customer search resets list identity and customer creation refreshes list plus summary', /customers:\$\{user\?\.id \?\? 'guest'\}:\$\{debouncedQ\}/.test(customers) && /Promise\.all\(\[list\.refresh\(\), loadSummary\(\)\]\)/.test(customers));
check('account summaries are owner-scoped to prevent cross-account display', /summaryOwnerId === user\?\.id/.test(sales) && /summaryOwnerId === user\?\.id/.test(debts) && /summaryOwnerId === user\?\.id/.test(customers));
check('debt and customer append errors expose a retry action', /<PaginatedFooter\b/.test(customers) && /<PaginatedFooter\b/.test(debts));

console.log(`✅ Mobile unification round 3 checks passed: ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`  • ${name}`);
