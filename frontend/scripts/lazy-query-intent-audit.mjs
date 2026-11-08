#!/usr/bin/env node
/**
 * Guardrails for lazy-loading query families whose data is not needed on every tab.
 * This is a source-level audit; runtime request counts must still be checked in DevTools.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });

const tabsHub = read('components/shared/hub/TabsHub.tsx');
const salesHub = read('components/sales/SalesTabsHub.tsx');
const salesHooks = read('hooks/queries/useSales.ts');
const storeHub = read('components/stores/MyStoreTabsHub.tsx');
const dashboard = read('app/(protected)/dashboard/page.tsx');
const dashboardPanel = read('components/profile/DashboardUpdatesPanel.tsx');
const notifications = read('hooks/queries/useNotifications.ts');
const onboarding = read('components/profile/OnboardingChecklist.tsx');
const notificationBell = read('components/layout/NotificationBell.tsx');

check('shared TabsHub reports active-tab changes to parent query gates',
  /onActiveChange\?: \(tab: T\) => void/.test(tabsHub) &&
  /onActiveChange\?\.\(tab\)/.test(tabsHub) &&
  /onActiveChange\?\.\(nextTab\)/.test(tabsHub));
check('sales cost-settings query supports an enabled gate',
  /useSalesCostSettings\(enabled = true\)/.test(salesHooks) && /enabled,/.test(salesHooks));
check('sales hub loads cost settings only on overview/sales/costs tabs',
  /activeTab === 'overview' \|\| activeTab === 'sales' \|\| activeTab === 'costs'/.test(salesHub) &&
  /useSalesCostSettings\(needsCostSettings\)/.test(salesHub));
check('store identity query is limited to product/analytics tabs',
  /activeTab === 'products' \|\| activeTab === 'analytics'/.test(storeHub) &&
  /useMyStore\(\{ enabled: needsStoreLabels \}\)/.test(storeHub));
check('dashboard activity/task sections are mounted only inside the expanded panel',
  /\{expanded && \(/.test(dashboardPanel) &&
  /<SellerTodayTasks\s*\/>/.test(dashboardPanel) &&
  /<RecentActivityFeed\s*\/>/.test(dashboardPanel) &&
  !/RecentActivityFeed|SellerTodayTasks/.test(dashboard));
check('dashboard notification list is disabled until panel expansion',
  /useMyNotifications\([\s\S]*?\{ enabled: expanded \}/.test(dashboardPanel));
check('notification bell list is already lazy while unread count remains global',
  /useMyNotifications\(\{ limit: 10 \}, \{ enabled: open \}\)/.test(notificationBell) &&
  /useUnreadNotificationCount\(\)/.test(notificationBell) &&
  /enabled: isAuthenticated && \(hasToken \|\| !isOnline\)/.test(notifications));
check('onboarding reuses aggregate ad statistics instead of a separate ads page request',
  /useMyAdStats\(\)/.test(onboarding) && !/useMyAds\(/.test(onboarding));

for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
const passed = checks.filter((item) => item.passed).length;
console.log(`\nLazy query intent audit: ${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exitCode = 1;
