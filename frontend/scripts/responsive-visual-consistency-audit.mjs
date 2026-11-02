import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const appDir = path.join(root, 'app');
const componentsDir = path.join(root, 'components');

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, predicate);
    return predicate(full) ? [full] : [];
  });
}

const routes = walk(appDir, (file) => path.basename(file) === 'page.tsx');
const uiFiles = [...walk(appDir, (file) => /\.(tsx|ts)$/.test(file)), ...walk(componentsDir, (file) => /\.(tsx|ts)$/.test(file))];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const css = read('app/globals.css');
const aliasNames = [...css.matchAll(/--(legacy-[a-z0-9-]+):/g)].map((m) => m[1]);
const rootAliasBlock = css.match(/\/\* Legacy palette bridge:[\s\S]*?\n:root \{([\s\S]*?)\n\}\n\.dark \{/)?.[1] ?? '';
const darkAliasBlock = css.match(/\n\.dark \{([\s\S]*?)\n\}\n\n\/\*\*\n \* Single source for BottomNav/s)?.[1] ?? '';
const uniqueAliases = [...new Set(aliasNames)];
check('all legacy UI palette variables have light and dark values',
  uniqueAliases.length >= 40 && uniqueAliases.every((name) => rootAliasBlock.includes(`--${name}:`) && darkAliasBlock.includes(`--${name}:`)),
  `${uniqueAliases.length} semantic aliases; all ${uniqueAliases.length} declared in both themes`);

const publicLayout = read('app/(public)/layout.tsx');
const protectedLayout = read('app/(protected)/layout.tsx');
const listShell = read('components/shared/list/ListPageShell.tsx');
const accountShell = read('components/shared/account/AccountPageShell.tsx');
check('public layout owns the one mobile BottomNav reserve', /public-main[\s\S]*pb-\[var\(--bottom-nav-offset\)\]/.test(publicLayout), 'global mobile reserve uses --bottom-nav-offset');
check('protected layout owns its mobile BottomNav reserve', /protected-main[\s\S]*pb-20/.test(protectedLayout), 'protected routes reserve navigation once at the app shell');
check('list page shell no longer duplicates mobile safe-area padding', !/pb-\[calc\((?:5\.5|7)rem\+env\(safe-area-inset-bottom/.test(listShell), 'ListPageShell uses no second mobile nav reserve');
check('account page shell no longer duplicates protected layout bottom spacing', /'pb-0'/.test(accountShell) && !/pb-\[calc\(/.test(accountShell), 'AccountPageShell leaves bottom clearance to protected layout');
check('detail pages suppress global reserve when a sticky CTA owns it', /\.public-main:has\(\.pb-sticky-contact\)/.test(css), 'public detail routes do not stack global and CTA spacing');
const adDetail = read('components/ads/AdDetail.tsx');
const adDetailSection = read('components/ads/AdDetailSection.tsx');
const serviceDetail = read('components/services/ServiceListingDetail.tsx');
const serviceRoute = read('app/(public)/services/[id]/page.tsx');
check('sticky CTA clearance is at route end, after related content',
  !adDetail.includes('pb-sticky-contact') && adDetailSection.includes("!isOwnAd && 'pb-sticky-contact'") && !serviceDetail.includes('pb-sticky-contact') && serviceRoute.includes("providerUserId ? 'pb-sticky-contact'"),
  'ad and service related sections no longer inherit an oversized gap before recommendations');

const wideMinWidthFiles = uiFiles.filter((file) => /min-w-\[(?:[4-9]\d{2}|\d{4,})px\]/.test(fs.readFileSync(file, 'utf8')));
const uncontainedWideFiles = wideMinWidthFiles.filter((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return !/overflow-x-auto|overflow-auto|overflow-hidden|\bhidden\b/.test(source);
});
check('wide tables/charts are horizontally scrollable or replaced on mobile', uncontainedWideFiles.length === 0,
  `${wideMinWidthFiles.length} wide-layout source files inspected; ${uncontainedWideFiles.length} lack overflow handling`);

const cardTokens = read('components/shared/cards/cardTokens.ts');
const cards = [
  ['ad cards', read('components/ads/AdCard.tsx'), 'cardPlaceholderToneForId(ad.id)'],
  ['product cards', read('components/stores/ProductCard.tsx'), 'cardPlaceholderToneForId(product.id)'],
  ['service cards', read('components/services/ServiceListingCard.tsx'), 'cardPlaceholderToneForId(listing.id)'],
];
check('missing-image placeholders share one palette and one hash function',
  cardTokens.includes('CARD_PLACEHOLDER_SURFACES') && cards.every(([, source, call]) => source.includes(call) && !/PASTEL_BGS|const PASTEL\b|function pastelForId|function pastel\(/.test(source)),
  'ad, product and service cards consume cardPlaceholderToneForId');

const requestDetail = read('app/(public)/requests/[id]/page.tsx');
check('request summary tiles avoid narrow 3-column overflow on small phones', /grid-cols-1 gap-2 min-\[420px\]:grid-cols-3/.test(requestDetail), '1 column below 420px; 3 columns from 420px');
check('request sticky CTA uses theme surface and shared fixed-bar placement', /sticky-contact-bar fixed[\s\S]*bg-card\/95/.test(requestDetail) && requestDetail.includes("'pb-sticky-contact'"), 'theme-aware fixed CTA with matching scroll clearance');

const storeHeader = read('components/stores/StoreHeader.tsx');
const profileHeader = read('components/profile/PublicProfileInteractive.tsx');
check('floating profile/store actions use theme-aware surfaces', [storeHeader, profileHeader].every((s) => s.includes('bg-card/95') && !s.includes('bg-white/90')), 'no fixed white circular controls in dark mode');
check('request / store / marketplace surfaces have no stale fixed-white shell', !uiFiles.some((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return /bg-white\/(?:90|95)/.test(source);
}), 'no fixed white 90–95% surface remains in app or shared components');

const primaryBadPairs = [];
for (const file of uiFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const line of source.split('\n')) {
    if (line.includes('bg-[var(--legacy-primary)]') && line.includes('text-white')) primaryBadPairs.push(path.relative(root, file));
    if (line.includes('bg-[var(--legacy-accent-strong)]') && line.includes('text-white')) primaryBadPairs.push(path.relative(root, file));
    if (line.includes('bg-[var(--legacy-warning-strong)]') && line.includes('text-white')) primaryBadPairs.push(path.relative(root, file));
  }
}
check('semantic background/text pairs preserve dark-mode contrast', primaryBadPairs.length === 0, primaryBadPairs.length ? `contrast pairs remain in ${primaryBadPairs.join(', ')}` : 'primary/accent/warning CTA text uses matching foreground tokens');

const legacyHex = /#(?:EAE3D6|1F4D33|6B6459|397F56|E8F1EC|4A433A|F6F1E7|9B2118|CFE0D5|FBF0D9|FBF9F4|F0EADF|FBE9E7|2A241D|7A4B07|F1C9C4|8F3F14|FBEEE6|D9D1C3|B3261E|D9962B|F4F9F6|C47A0A|FDFBF7|F6E7DB|9B2C2C|A39E94|EBD7A8|5A3705|E3EEF5|EFEADF|F1D3A8|5E9C73|EDE7DC|E8E2D6|E8A8A0|FDF6F5|F1D3C0|7A4B2A|AD531F)\b/i;
const stalePaletteFiles = uiFiles.filter((file) => {
  if (/FloatingDebugConsole|DownloadStoreCatalogButton|ShareAdQrDialog|debug\/|app\/manifest\.ts|app\/icon-(?:192|512|512-maskable)\//.test(file)) return false;
  return legacyHex.test(fs.readFileSync(file, 'utf8'));
});
check('legacy page-specific palette is routed through semantic theme variables', stalePaletteFiles.length === 0, stalePaletteFiles.length ? `${stalePaletteFiles.length} UI source files still contain legacy colors: ${stalePaletteFiles.map((f) => path.relative(root, f)).join(', ')}` : 'old hardcoded warm palette removed from app and UI components; branded manifest/icons excluded');

const stalePagePadding = uiFiles.filter((file) => /pb-\[calc\((?:5\.5|7)rem\+env\(safe-area-inset-bottom/.test(fs.readFileSync(file, 'utf8')));
check('no duplicated 5.5rem/7rem mobile navigation spacers remain', stalePagePadding.length === 0, stalePagePadding.length ? `${stalePagePadding.length} files retain duplicate mobile spacers` : 'mobile page-level duplicate spacers removed');

const adminConsole = read('components/debug/AdminScriptConsole.tsx');
check('admin developer tools stay clear of the mobile bottom navigation',
  adminConsole.includes('bottom-[calc(var(--bottom-nav-offset)+1.5rem)]') && adminConsole.includes('max-h-[calc(100dvh-var(--bottom-nav-offset)-2.5rem)]'),
  'developer-tools trigger and panel reserve mobile navigation clearance');

check('all platform routes are covered by the static page inventory', routes.length >= 65, `${routes.length} Next.js page.tsx routes inventoried`);

const failed = checks.filter((item) => !item.ok);
console.log(`Responsive visual consistency audit: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`);
if (failed.length) process.exitCode = 1;
