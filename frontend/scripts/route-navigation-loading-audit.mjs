/** Static audit for navigation-level loading coverage. No dependencies required. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(frontendRoot, 'app');
const read = (relative) => fs.readFileSync(path.join(frontendRoot, relative), 'utf8');
const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

const rootLoadingPath = path.join(appRoot, 'loading.tsx');
const rootLoading = fs.existsSync(rootLoadingPath) ? fs.readFileSync(rootLoadingPath, 'utf8') : '';
check('root app loading.tsx exists as a global fallback', rootLoading.length > 0);
check('global fallback uses shared PageLoadingState', /PageLoadingState/.test(rootLoading) && /variant="minimal"/.test(rootLoading));
check('global fallback exposes accessible loading status via shared component', /title="جارٍ الانتقال بين الصفحات"/.test(rootLoading));

const navigationProgressPath = path.join(frontendRoot, 'components/shared/NavigationProgress.tsx');
const navigationProgress = fs.existsSync(navigationProgressPath) ? fs.readFileSync(navigationProgressPath, 'utf8') : '';
const appProviders = read('providers/AppProviders.tsx');
const rootLayout = read('app/layout.tsx');
check('navigation progress component watches same-origin internal link clicks', /document\.addEventListener\('click'/.test(navigationProgress) && /target\.origin !== window\.location\.origin/.test(navigationProgress));
check('modified clicks and non-primary clicks do not start page navigation feedback', /event\.button !== 0/.test(navigationProgress) && /event\.metaKey/.test(navigationProgress) && /event\.ctrlKey/.test(navigationProgress));
check('external, download, disabled, and new-context links are excluded', /target\.origin !== window\.location\.origin/.test(navigationProgress) && /anchor\.hasAttribute\('download'\)/.test(navigationProgress) && /anchor\.target && anchor\.target !== '_self'/.test(navigationProgress) && /aria-disabled/.test(navigationProgress));
check('programmatic navigation signal rejects cross-origin destinations', /target\.origin !== window\.location\.origin/.test(navigationProgress) && /function signalNavigationStart\(href: string\)/.test(navigationProgress));
check('navigation progress is mounted globally in AppProviders', /<NavigationProgress \/>/.test(appProviders) && /NavigationProgress/.test(appProviders));
check('navigation progress stylesheet is imported by root layout', /navigation-progress\.css/.test(rootLayout));
const navigationProgressCss = read('app/navigation-progress.css');
check('navigation progress stays fixed and does not block page interactions', /position: fixed/.test(navigationProgressCss) && /pointer-events: none/.test(navigationProgressCss));
check('reduced-motion preference disables continuous navigation-bar animation', /prefers-reduced-motion:\s*reduce/.test(navigationProgressCss) && /animation:\s*none/.test(navigationProgressCss));
check('reduced-motion navigation cue remains visible without transform motion', /prefers-reduced-motion:[\s\S]*?width:\s*100%[\s\S]*?transform:\s*none/.test(navigationProgressCss));
check('navigation progress has an accessible progressbar label', /role="progressbar"/.test(navigationProgress) && /aria-label="جارٍ الانتقال بين الصفحات"/.test(navigationProgress));
check('navigation progress has a failsafe to avoid remaining stuck', /FAILSAFE_MS/.test(navigationProgress) && /12_000/.test(navigationProgress));
check('query-only and hash-only changes do not start a page navigation indicator', /target\.pathname === window\.location\.pathname\) return/.test(navigationProgress));
check('programmatic navigation start event is supported', /window\.addEventListener\(START_EVENT, onProgrammaticStart\)/.test(navigationProgress) && /function signalNavigationStart\(href: string\)/.test(navigationProgress));
check('browser Back/Forward navigation is observed through popstate', /window\.addEventListener\('popstate', onPopState\)/.test(navigationProgress) && /window\.removeEventListener\('popstate', onPopState\)/.test(navigationProgress));
check('Back/Forward navigation uses the last committed pathname', /const previousPath = lastPathname\.current/.test(navigationProgress) && /start\(previousPath, previousPath\)/.test(navigationProgress));
check('last committed pathname is refreshed after route changes', /lastPathname\.current = pathname/.test(navigationProgress));
check('repeated clicks on the same destination do not reset the failsafe', /startedHref = useRef<string \| null>\(null\)/.test(navigationProgress) && /if \(startedHref\.current === target\.href\) return/.test(navigationProgress));
check('a new destination replaces old timers instead of inheriting the old failsafe', /if \(startedHref\.current === target\.href\) return;\s*clearTimers\(\);\s*startedPath\.current = sourcePath;\s*startedHref\.current = target\.href;/.test(navigationProgress));
check('navigation listeners and timers are cleaned up on unmount', /return \(\) => \{[\s\S]*?document\.removeEventListener\('click', onClick, true\);[\s\S]*?clearTimers\(\);[\s\S]*?\};/.test(navigationProgress));
check('navigation destination state is cleared when navigation finishes', /startedHref\.current = null/.test(navigationProgress));
check('pathname changes cancel both pending show and failsafe timers', /if \(showTimer\.current\) clearTimeout\(showTimer\.current\);[\s\S]*?if \(hideTimer\.current\) clearTimeout\(hideTimer\.current\);[\s\S]*?startedPath\.current = null/.test(navigationProgress));
check('pathname change resets visible progress state', /pathname !== startedPath\.current[\s\S]*?setVisible\(false\)/.test(navigationProgress));
check('delayed progress indicator is bounded by both show delay and failsafe', /SHOW_DELAY_MS = 120/.test(navigationProgress) && /FAILSAFE_MS = 12_000/.test(navigationProgress));
check('intercepted Next.js internal links still start navigation loading', /start\(anchor\.href\)/.test(navigationProgress) && /defaultPrevented after event/.test(navigationProgress));

const programmaticNavigationFiles = [
  ['components/auth/ProfileCompletionGate.tsx', 'profile-completion redirect signals navigation'],
  ['components/auth/CompleteProfileForm.tsx', 'profile completion success signals navigation'],
  ['components/auth/ResetPasswordForm.tsx', 'password reset success signals navigation'],
  ['components/stores/ProductForm.tsx', 'product creation success signals navigation'],
  ['components/stores/BecomeStoreOwnerCard.tsx', 'store-owner redirect signals navigation'],
  ['components/profile/MessageUserButtonGate.tsx', 'profile messaging redirects and conversation navigation signal start'],
  ['components/ads/AdDetail.tsx', 'ad messaging redirects and conversation navigation signal start'],
  ['components/ads/SellerCard.tsx', 'seller messaging redirects and conversation navigation signal start'],
  ['components/shared/ReportButton.tsx', 'report sign-in redirect signals navigation'],
];
for (const [relative, label] of programmaticNavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.(push|replace)\(/.test(source));
}

const phase20MutationFiles = [
  ['hooks/mutations/useAuthMutations.ts', 'auth mutation redirects signal navigation before router push'],
  ['hooks/mutations/useAdMutations.ts', 'ad mutation destination changes signal navigation before router push'],
  ['hooks/mutations/useProductMutations.ts', 'product mutation destination changes signal navigation before router push'],
  ['hooks/mutations/useRequestMutations.ts', 'request and conversation mutation navigation signals start'],
];
for (const [relative, label] of phase20MutationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.push\(/.test(source));
}

const phase21NavigationFiles = [
  ['hooks/mutations/useServiceListingMutations.ts', 'service-listing success redirects signal navigation'],
  ['hooks/mutations/useUpdateProfile.ts', 'account deletion redirect signals navigation'],
  ['hooks/useOwnershipGuard.ts', 'ownership rejection redirect signals navigation'],
  ['providers/AuthHydrationProvider.tsx', 'session-ended redirect signals navigation'],
];
for (const [relative, label] of phase21NavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.(push|replace)\(/.test(source));
}


const phase22NavigationFiles = [
  ['components/shared/GlobalSearchShortcut.tsx', 'keyboard shortcut search navigation signals page loading'],
  ['components/pwa/CapacitorBootstrap.tsx', 'native push notification navigation signals page loading'],
  ['components/ads/AdCard.tsx', 'unauthenticated ad-card action signals login navigation'],
];
for (const [relative, label] of phase22NavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.push\(/.test(source));
}

const phase23NavigationFiles = [
  ['components/services/ServiceRequestButton.tsx', 'service request login and success-toast destination signal navigation'],
  ['components/services/ProviderContactCard.tsx', 'provider contact login and conversation destinations signal navigation'],
  ['components/notifications/NotificationToasts.tsx', 'notification deep-link action signals navigation'],
  ['components/sellers/BecomeSellerCard.tsx', 'seller profile completion redirect signals navigation'],
  ['components/services/BecomeServiceProviderCard.tsx', 'service provider completion redirect signals navigation'],
  ['components/ads/AdForm.tsx', 'ad form fallback route signals navigation'],
  ['components/services/ServiceListingForm.tsx', 'service listing fallback route signals navigation'],
];
for (const [relative, label] of phase23NavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.(push|replace)\(/.test(source));
}


const phase24GuardFiles = [
  ['app/(admin)/layout.tsx', 'admin guard login and role redirects signal navigation'],
  ['app/(protected)/layout.tsx', 'protected layout session-expiry redirect signals navigation'],
  ['components/ads/SaveSearchButton.tsx', 'save-search unauthenticated login redirect signals navigation'],
];
for (const [relative, label] of phase24GuardFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.(push|replace)\(/.test(source));
}

const phase25NavigationFiles = [
  ['components/stores/StoreReviewButton.tsx', 'store review login redirect signals navigation'],
  ['components/stores/PublicSalesStats.tsx', 'public store stats conversation redirect signals navigation'],
];
for (const [relative, label] of phase25NavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /signalNavigationStart/.test(source) && /router\.push\(/.test(source));
}

const phase26NavigationFiles = [
  ['components/ads/SearchFilters.tsx', 'category selection signals loading only when changing page destinations'],
];
for (const [relative, label] of phase26NavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(label, /function updateCategory/.test(source) && /signalNavigationStart\(destination\)/.test(source) && /signalNavigationStart\(ROUTES\.search\)/.test(source) && /else update\('categoryId', categoryId\)/.test(source));
}

const queryNavigationFiles = [
  'components/stores/StoreProducts.tsx',
  'components/shared/SearchSortBar.tsx',
];
for (const relative of queryNavigationFiles) {
  const file = path.join(frontendRoot, relative);
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check(`${relative} keeps query/filter navigation free of explicit page-loading signals`, /router\.(push|replace)\(/.test(source) && !/signalNavigationStart/.test(source));
}

const pageFiles = [];
const routeLoadingFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'page.tsx') pageFiles.push(full);
    else if (entry.name === 'loading.tsx') routeLoadingFiles.push(full);
  }
}
walk(appRoot);
check('at least one App Router page is present for coverage analysis', pageFiles.length > 0);
check('global fallback is inherited by routes without a nearer loading.tsx boundary', fs.existsSync(rootLoadingPath));

const routeGroups = ['(public)', '(protected)', '(auth)', '(admin)'];
const groupSummary = routeGroups.map((group) => {
  const groupPath = path.join(appRoot, group);
  const pages = pageFiles.filter((file) => file.startsWith(groupPath + path.sep));
  const nestedLoading = routeLoadingFiles.filter((file) => file.startsWith(groupPath + path.sep));
  return { group, pages: pages.length, nestedLoading: nestedLoading.length };
});
check('route group analysis includes public, protected, auth and admin groups', groupSummary.every((item) => fs.existsSync(path.join(appRoot, item.group))));

for (const [name, ok] of checks) console.log(`[route-navigation-loading] ${ok ? 'PASS' : 'FAIL'} ${name}`);
for (const item of groupSummary) console.log(`[route-navigation-loading] INFO ${item.group}: ${item.pages} pages, ${item.nestedLoading} route-specific loading.tsx files`);
console.log(`[route-navigation-loading] INFO pages scanned: ${pageFiles.length}`);
console.log(`[route-navigation-loading] INFO loading.tsx boundaries including root: ${routeLoadingFiles.length}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`[route-navigation-loading] PASS ${checks.length} checks`);
