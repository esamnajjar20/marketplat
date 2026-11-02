/**
 * Static integrity audit for App Router navigation and legacy redirects.
 * Runs without dependencies and catches missing route targets, stale admin
 * aliases, unsafe auth-return wiring, and the known authenticated PDF preview
 * regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(frontendRoot, 'app');
const read = (relative) => fs.readFileSync(path.join(frontendRoot, relative), 'utf8');
const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);

function walk(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, visitor);
    else visitor(absolute);
  }
}

function routePatternFromPageFile(file) {
  const relative = path.relative(appRoot, path.dirname(file));
  const segments = relative === '.' ? [] : relative.split(path.sep);
  const visible = segments.filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith('@') && segment !== '');
  const normalized = visible.map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment) || /^\[\.\.\..+\]$/.test(segment)) return '*';
    if (/^\[.+\]$/.test(segment)) return `:${segment.slice(1, -1)}`;
    return segment;
  });
  return `/${normalized.join('/')}`.replace(/\/$/, '') || '/';
}

const routeFiles = [];
walk(appRoot, (file) => {
  if (/^page\.(tsx?|jsx?)$/.test(path.basename(file))) routeFiles.push(file);
});
const routePatterns = [...new Set(routeFiles.map(routePatternFromPageFile))];

function isInternalRoute(pathname) {
  const candidate = pathname.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  return routePatterns.some((pattern) => {
    if (pattern === candidate) return true;
    const expression = pattern
      .split('/')
      .map((segment) => segment === '*' ? '.+' : segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('/');
    return new RegExp(`^${expression}$`).test(candidate);
  });
}

const sourceRoots = ['app', 'components', 'hooks', 'lib', 'providers', 'store'];
const sourceFiles = [];
for (const root of sourceRoots) {
  walk(path.join(frontendRoot, root), (file) => {
    if (!/\.(tsx?|jsx?)$/.test(file)) return;
    if (/(^|[\\/])(__tests__|e2e|node_modules|\.next)([\\/]|$)/.test(file)) return;
    if (/\.(test|spec)\.[^.]+$/.test(file)) return;
    sourceFiles.push(file);
  });
}

const navigationPatterns = [
  /\bhref\s*=\s*['"](\/[^'"?#]*)/g,
  /\b(?:router\.(?:push|replace)|redirect|permanentRedirect)\s*\(\s*['"](\/[^'"?#]*)/g,
  /\b(?:window\.)?location\.(?:href\s*=|assign\s*\(|replace\s*\()\s*['"](\/[^'"?#]*)/g,
];
const staticTargets = new Set();
const invalidTargets = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of navigationPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const target = match[1];
      if (target.startsWith('/api/') || target.startsWith('/_next/') || target.startsWith('/uploads/')) continue;
      staticTargets.add(target);
      if (!isInternalRoute(target)) {
        invalidTargets.push({ file: path.relative(frontendRoot, file), target });
      }
    }
  }
}
check(`route inventory contains App Router pages (${routePatterns.length} unique paths)`, routePatterns.length >= 60);
check(`all static internal navigation targets resolve (${staticTargets.size} targets)`, invalidTargets.length === 0);
if (invalidTargets.length) {
  for (const item of invalidTargets) console.error(`  MISSING ROUTE ${item.file}: ${item.target}`);
}

// Check literal destinations in next.config.ts against actual page routes.
const nextConfig = read('next.config.ts');
const redirectDestinations = [...nextConfig.matchAll(/destination:\s*['"]([^'"]+)['"]/g)]
  .map((match) => match[1])
  .filter((destination) => !/^https?:\/\//i.test(destination));
const invalidRedirectDestinations = redirectDestinations.filter((destination) => !isInternalRoute(destination));
check(`Next.js redirect destinations resolve (${redirectDestinations.length} literal destinations)`, invalidRedirectDestinations.length === 0);
if (invalidRedirectDestinations.length) {
  for (const destination of invalidRedirectDestinations) console.error(`  MISSING REDIRECT TARGET ${destination}`);
}

// ROUTES is the canonical path registry used by navigation buttons. Every
// literal or parameterized route builder must resolve to a page or a declared
// legacy alias. Template parameters are replaced with a representative ID.
const routeConstantsSource = read('lib/constants.ts');
const routeConstants = [
  ...[...routeConstantsSource.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*:\s*(['\"])(\/[^'\"\n]*)\2/g)]
    .map((match) => ({ name: match[1], path: match[3] })),
  ...[...routeConstantsSource.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*:\s*\([^)]*\)\s*=>\s*`([^`]*)`/g)]
    .map((match) => ({ name: match[1], path: match[2].replace(/\$\{[^}]+\}/g, 'navigation-audit-id') })),
];
const redirectSources = [...nextConfig.matchAll(/source:\s*['\"]([^'\"]+)['\"]/g)].map((match) => match[1]);
function isLegacyRedirectSource(pathname) {
  const candidate = pathname.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  return redirectSources.some((source) => {
    const expression = source.split('/')
      .map((segment) => segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('/');
    return new RegExp(`^${expression}$`).test(candidate);
  });
}
// Also inspect literal template-literal hrefs such as `/profile/${id}` and
// `/account/sales/${saleId}/receipt`. Replace interpolated path segments with
// representative IDs, strip query/hash, and verify the same route inventory.
const templateHrefTargets = new Set();
const invalidTemplateHrefTargets = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const expression = /\bhref\s*=\s*\{\s*`(\/[^`\n]*)`/g;
  let match;
  while ((match = expression.exec(source))) {
    const candidate = match[1]
      .replace(/\$\{[^}]*\}/g, 'navigation-audit-id')
      .split('$', 1)[0] // stop at nested conditional template expressions
      .split(/[?#]/, 1)[0];
    if (!candidate || candidate.startsWith('/api/') || candidate.startsWith('/_next/')) continue;
    templateHrefTargets.add(candidate);
    if (!isInternalRoute(candidate) && !isLegacyRedirectSource(candidate)) {
      invalidTemplateHrefTargets.push({ file: path.relative(frontendRoot, file), target: candidate });
    }
  }
}
check(`template-literal internal hrefs resolve (${templateHrefTargets.size} targets)`, invalidTemplateHrefTargets.length === 0);
if (invalidTemplateHrefTargets.length) {
  for (const item of invalidTemplateHrefTargets) console.error(`  MISSING TEMPLATE HREF ${item.file}: ${item.target}`);
}

const invalidRouteConstants = routeConstants.filter(({ path: route }) => !isInternalRoute(route) && !isLegacyRedirectSource(route));
check(`all ROUTES constants resolve to a page or declared redirect (${routeConstants.length} paths)`, invalidRouteConstants.length === 0);
if (invalidRouteConstants.length) {
  for (const item of invalidRouteConstants) console.error(`  UNRESOLVED ROUTES.${item.name}: ${item.path}`);
}

// Legacy admin URLs must exist for every non-dashboard tab. `system` stays as
// an explicit old alias for the canonical monitoring tab.
const adminTabsSource = read('lib/adminHubTabs.ts');
const adminTabsBlock = adminTabsSource.match(/export const ADMIN_TABS\s*=\s*\[([\s\S]*?)\]\s*as const/);
const adminTabs = [...(adminTabsBlock?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
const adminRedirectBlock = nextConfig.match(/const adminTabs\s*=\s*\[([\s\S]*?)\]\s*;/);
const redirectTabs = [...(adminRedirectBlock?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
const missingAdminAliases = adminTabs.filter((tab) => tab !== 'dashboard' && !redirectTabs.includes(tab));
check('every admin hub tab has a legacy URL redirect', missingAdminAliases.length === 0);
check('legacy system URL remains mapped to monitoring', redirectTabs.includes('system') && adminTabs.includes('monitoring') && /requested === 'system'[\s\S]*?return 'monitoring'/.test(adminTabsSource));

// PDF preview must use the same authenticated API client as the download
// button; iframe navigation does not inherit the Axios Bearer-token header.
const messageMedia = read('components/messages/MessageMedia.tsx');
check('PDF preview fetches media through authenticated conversationsApi', /conversationsApi\.downloadMedia\(conversationId, message\.id, 'file'\)/.test(messageMedia));
check('PDF preview renders an authenticated Blob URL, not a raw API iframe URL', /URL\.createObjectURL\(pdfBlob\)/.test(messageMedia) && /src=\{filePreviewUrl\}/.test(messageMedia) && !/src=\{`\/api\/v1\/conversations/.test(messageMedia));
check('PDF preview has loading, retry and Blob URL cleanup states', /filePreviewLoading/.test(messageMedia) && /إعادة المحاولة/.test(messageMedia) && /URL\.revokeObjectURL\(filePreviewUrl\)/.test(messageMedia));

// Auth pages consume `from`; the saved-filter action must preserve filters.
const savePreset = read('components/search/SaveFilterPresetButton.tsx');
check('saved-filter auth gate uses the supported `from` parameter', /\?from=\$\{encodeURIComponent\(returnTo\)\}/.test(savePreset) && !/\?next=/.test(savePreset));
check('saved-filter auth gate preserves current search parameters', savePreset.includes('const currentQuery = sp.toString()') && savePreset.includes('`${ROUTES.search}?${currentQuery}`'));

// Legacy identity URLs must resolve a role ID to a real user ID. A transient
// API failure must never forward the provider/seller row ID as /profile/[id].
const sellerRedirect = read('app/(public)/sellers/[id]/page.tsx');
const providerRedirect = read('app/(public)/service-providers/[id]/page.tsx');
check('legacy seller route forwards only a resolved userId and handles 404 separately', /if \(statusCode === 404\) notFound\(\)/.test(sellerRedirect) && /redirect\(ROUTES\.userProfile\(targetUserId\)\)/.test(sellerRedirect) && !/targetUserId \?\? id/.test(sellerRedirect));
check('legacy provider route uses sellerProfile.userId and never forwards provider ID as user ID', /sellerProfile\?\.userId/.test(providerRedirect) && /redirect\(ROUTES\.userProfile\(targetUserId\)\)/.test(providerRedirect) && !/targetUserId \?\? id/.test(providerRedirect));

const serviceProviderCard = read('components/services/ServiceProviderCard.tsx');
check('service provider profile button uses the canonical user profile when available',
  /provider\.sellerProfile\?\.userId[\s\S]*?ROUTES\.userProfile\(providerUserId\)/.test(serviceProviderCard));
check('service provider contact button starts a conversation instead of duplicating the profile link',
  /startConversation\.mutate\(\{ userId: providerUserId \}/.test(serviceProviderCard)
  && /ROUTES\.conversationDetail\(conversation\.id\)/.test(serviceProviderCard)
  && /`\$\{ROUTES\.login\}\?from=/.test(serviceProviderCard)
  && /isAuthResolving/.test(serviceProviderCard));

// Following feed service items are ServiceListing records; the public
// detail page is /services/[id], not the API resource /service-listings/[id].
const followingFeed = read('components/home/FollowingFeedSection.tsx');
check('following feed routes service cards to the public service detail page',
  /ROUTES\.serviceDetail\(item\.id\)/.test(followingFeed) && !/`\/service-listings\/\$\{item\.id\}`/.test(followingFeed));

// Own-profile entry uses the user ID and the canonical profile route exists.
const viewProfileLink = read('components/profile/ViewMyProfileLink.tsx');
check('view-my-profile button targets the canonical /profile/[userId] route', /ROUTES\.userProfile\(user\.id\)/.test(viewProfileLink) && routePatterns.includes('/profile/:id'));

const safeBackSource = read('lib/navigation.ts');
check('safe back requires a same-origin referrer and has a fallback', /new URL\(ref\)\.origin === window\.location\.origin/.test(safeBackSource) && /onFallback\?\.\(fallback\)/.test(safeBackSource));
for (const [relative, label] of [
  ['components/ads/AdForm.tsx', 'ad form'],
  ['components/services/ServiceListingForm.tsx', 'service form'],
  ['components/stores/ProductForm.tsx', 'product form'],
  ['components/messages/ChatWindow.tsx', 'conversation back button'],
  ['components/shared/Forbidden.tsx', 'forbidden-page back button'],
]) {
  const source = read(relative).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(`${label} cannot leave the app through an external history entry`, /safeBack\(/.test(source) && !/window\.history\.back\(\)|history\.back\(\)/.test(source));
}

// Authentication redirects are constrained to same-origin rooted paths.
const cookies = read('lib/cookies.ts');
check('post-auth redirect rejects protocol-relative and external URLs', cookies.includes("candidate.startsWith('//')") && /resolved\.origin !== base/.test(cookies));
check('login and registration both consume the `from` destination safely', /getSafeRedirectPath\(searchParams\.get\('from'\)/.test(read('components/auth/LoginForm.tsx')) && /getSafeRedirectPath\(from, ROUTES\.dashboard\)/.test(read('components/auth/RegisterForm.tsx')));

let failed = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failed += 1;
}
console.log(`\nNavigation integrity: ${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
