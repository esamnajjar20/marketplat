import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repo = path.resolve(root, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readRepo = (relativePath) => fs.readFileSync(path.join(repo, relativePath), 'utf8');
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });

const pageHeader = read('components/shared/layout/PageHeader.tsx');
const listShell = read('components/shared/list/ListPageShell.tsx');
const accountShell = read('components/shared/account/AccountPageShell.tsx');
const adminShell = read('components/admin/AdminPageShell.tsx');
const editHeader = read('components/shared/EditPageHeader.tsx');
const globalCss = read('app/globals.css');

check('PageHeader is the canonical semantic Web heading component',
  pageHeader.includes('data-page-header') && pageHeader.includes('PageHeaderVariant') && pageHeader.includes('<h1'),
  'single shared header structure with named layout variants');
check('Browse shell delegates heading rendering to PageHeader',
  /<PageHeader[\s\S]*?variant="browse"/.test(listShell), 'browse pages use the browse variant');
check('Account shell delegates heading rendering to PageHeader',
  /<PageHeader[\s\S]*?variant="account"/.test(accountShell), 'protected account pages use the account variant');
check('Admin shell delegates heading rendering to PageHeader',
  /<PageHeader[\s\S]*?variant="admin"/.test(adminShell), 'admin pages use the compact admin variant');
check('Edit-page heading reuses PageHeader and retains a visible return link',
  editHeader.includes('<PageHeader') && editHeader.includes('IntentPrefetchLink') && editHeader.includes('variant="detail"'),
  'edit screens share heading semantics and the return affordance');
check('All five header variants have shared CSS definitions',
  ['standard', 'browse', 'account', 'admin', 'detail'].every((variant) => globalCss.includes(`.page-header--${variant}`)),
  'standard, browse, account, admin and detail variants exist');
check('Page layout semantic tokens exist',
  ['--page-container-max', '--page-gutter', '--page-section-gap', '--page-title-size', '--page-title-line-height'].every((token) => globalCss.includes(`${token}:`)),
  'container width, gutters, vertical rhythm and title hierarchy are tokenized');

const migratedPages = [
  'app/(protected)/my-services/page.tsx',
  'app/(protected)/account/sales/page.tsx',
  'app/(protected)/my-store/page.tsx',
];
check('Standalone account dashboards use the same AccountPageShell',
  migratedPages.every((file) => read(file).includes('AccountPageShell') && !read(file).includes('desktop-page-header')),
  'services, sales and store dashboards no longer define private page headers');

const productCard = read('components/stores/ProductCard.tsx');
const cardTokens = read('components/shared/cards/cardTokens.ts');
check('Product grid and list cards share the themed missing-image palette',
  productCard.includes('cardPlaceholderToneForId(product.id)') && productCard.includes('CARD_IMAGE_LIST') && cardTokens.includes('CARD_PLACEHOLDER_SURFACES'),
  'list layout uses the same deterministic semantic placeholder as MarketCard');

const mobileTokens = readRepo('apps/mobile/src/theme/tokens.ts');
const mobileStyles = readRepo('apps/mobile/src/components/ui/styles.ts');
const mobileHeader = readRepo('apps/mobile/src/components/ui/AppHeader.tsx');
const mobilePageShell = readRepo('apps/mobile/src/components/ui/PageShell.tsx');
const mobileDetail = readRepo('apps/mobile/src/components/ui/DetailScaffold.tsx');
check('Native page layout roles are defined centrally',
  /export const layout = \{[\s\S]*?pageHorizontal:[\s\S]*?pageSectionGap:[\s\S]*?pageHeaderMinHeight:/.test(mobileTokens),
  'mobile page geometry is represented by semantic layout tokens');
check('Native shared UI styles consume semantic page layout tokens',
  mobileStyles.includes('layout.pageHeaderMinHeight') && mobileStyles.includes('layout.pageHorizontal') && mobileStyles.includes('layout.pageSectionGap'),
  'PageShell and shared component styles do not re-declare page geometry');
check('Native page and detail shells share AppHeader',
  mobilePageShell.includes('<AppHeader') && mobileDetail.includes('<AppHeader'),
  'list/form and detail routes use the same native heading component');
check('Native header actions use the layout token',
  mobileHeader.includes('layout.pageHeaderActionGap'), 'header action spacing is semantic');

const pageHeaderTest = read('__tests__/components/shared/PageHeader.test.tsx');
const productCardTest = read('__tests__/components/ProductCard.test.tsx');
check('shared header variants and themed list-card fallback have regression tests',
  ['standard', 'browse', 'account', 'admin', 'detail'].every((variant) => pageHeaderTest.includes(`'${variant}'`)) &&
  productCardTest.includes('same themed placeholder palette in list layout'),
  'the shared layout variants and list-card fallback are covered by tests');

const tabsBar = read('components/shared/ui/TabsBar.tsx');
const tabConsumers = [
  'components/shared/hub/TabsHub.tsx',
  'components/search/SearchTabs.tsx',
  'components/profile/ProfileTabs.tsx',
  'components/profile/FavoritesTabs.tsx',
  'components/stores/StoreStorefront.tsx',
  'components/settings/UnifiedProfileSettings.tsx',
  'components/offline/OfflineHub.tsx',
  'components/payments/SavedPaymentsPageClient.tsx',
];
check('TabsBar is the canonical accessible Web content-tab primitive',
  tabsBar.includes("export type TabsBarVariant = 'underline' | 'pills' | 'segmented'") &&
  tabsBar.includes('aria-selected={selected}') && tabsBar.includes('handleKeyDown'),
  'visual variants, roving focus and keyboard navigation live in one implementation');
check('Primary content-tab surfaces reuse TabsBar',
  tabConsumers.every((file) => read(file).includes('<TabsBar')),
  'hub, search, profile, favorites and store tabs use the shared tab primitive');

const chipGroup = read('components/shared/filters/FilterChipGroup.tsx');
const categoryChips = read('components/shared/filters/CategoryFilterChips.tsx');
const timeline = read('components/profile/Timeline.tsx');
check('FilterChipGroup is the canonical Web selection-chip implementation',
  chipGroup.includes('min-h-[var(--touch-target)]') && chipGroup.includes('aria-pressed={active}'),
  'filter chips share selected-state semantics and the minimum touch target');
check('Category shortcuts delegate to FilterChipGroup',
  categoryChips.includes('<FilterChipGroup') && !categoryChips.includes('categories.map((category) => {'),
  'ads, products and services share the same category-chip presentation');
check('Activity filters use selection chips rather than tab semantics',
  timeline.includes('<FilterChipGroup') && !timeline.includes('role="tablist"'),
  'activity category filtering uses the shared pressed-state pattern');

const filterChipConsumers = [
  'components/messages/ConversationList.tsx',
  'components/messages/MessageMediaGallery.tsx',
  'components/orders/MarketplaceOrdersPage.tsx',
  'components/requests/RequestsPageClient.tsx',
  'components/requests/MyRequestsPageClient.tsx',
  'components/requests/MyRequestOffersPageClient.tsx',
];
check('Message, order and request filters use FilterChipGroup',
  filterChipConsumers.every((file) => read(file).includes('<FilterChipGroup')),
  'repeated list-filter controls share the same visual and selected-state contract');
check('The shared filter-chip primitive supports both pill and underline density',
  chipGroup.includes("variant?: 'pills' | 'underline'") &&
  chipGroup.includes("data-filter-chip-variant={variant}") && chipGroup.includes('min-h-[var(--touch-target)]'),
  'one implementation covers chip and underline filter treatments with 44px touch targets');
check('Route navigation is not misrepresented as a content tablist',
  read('components/admin/AdminCategoryTypeTabs.tsx').includes('<nav') &&
  read('components/admin/AdminCategoryTypeTabs.tsx').includes('aria-current=') &&
  !read('components/admin/AdminCategoryTypeTabs.tsx').includes('role="tablist"'),
  'admin category routes use navigation semantics while content switches use TabsBar');

const tabsBarTest = read('__tests__/components/shared/TabsBar.test.tsx');
const categoryChipTest = read('__tests__/components/shared/CategoryFilterChips.test.tsx');
const filterChipTest = read('__tests__/components/shared/FilterChipGroup.test.tsx');
check('Shared tabs and category chips have regression coverage',
  tabsBarTest.includes('RTL arrow navigation') && tabsBarTest.includes('skips disabled options') &&
  categoryChipTest.includes('reuses FilterChipGroup') && filterChipTest.includes('minimum touch target'),
  'tests cover variants, keyboard focus, disabled options, shared chip behavior and touch targets');

const frontendPackage = JSON.parse(read('package.json'));
check('UI/UX unification audit is registered as a frontend command',
  frontendPackage.scripts?.['uiux:unification-audit'] === 'node scripts/uiux-unification-audit.mjs',
  'the audit is runnable from the frontend workspace');

let failed = 0;
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`);
  if (!item.pass) failed += 1;
}
console.log(`\nUI/UX unification audit: ${checks.length - failed}/${checks.length} passed`);
if (failed) process.exitCode = 1;
