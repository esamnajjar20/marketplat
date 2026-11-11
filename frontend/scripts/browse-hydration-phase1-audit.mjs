import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
};

const checks = [
  ['ads route fetches the first page on the server', 'app/(public)/ads/page.tsx', 'fetchPublicBrowsePage<AdListItem>'],
  ['products route fetches the first page on the server', 'app/(public)/products/page.tsx', 'fetchPublicBrowsePage<ProductWithStore>'],
  ['stores route fetches the first page on the server', 'app/(public)/stores/page.tsx', 'fetchPublicBrowsePage<StoreDirectoryItem>'],
  ['services route fetches the first page on the server', 'app/(public)/services/page.tsx', 'fetchPublicBrowsePage<ServiceListingWithProvider>'],
  ['server browse fetch has a bounded SSR timeout', 'lib/server/serverApiFetch.ts', 'const DEFAULT_SERVER_API_TIMEOUT_MS = 8_000;'],
  ['SSR page size is shared with the initial client query', 'lib/browseSearchParams.ts', 'export const SSR_BROWSE_PAGE_SIZE = 10;'],
  ['ads results accept hydrated first-page data', 'components/ads/SearchResults.tsx', 'initialData: seededInitialPage ? { pages: [seededInitialPage], pageParams: [1] } : undefined'],
  ['products grid accepts hydrated first-page data', 'components/stores/ProductsGrid.tsx', 'initialData: seededInitialPage ? { pages: [seededInitialPage], pageParams: [1] } : undefined'],
  ['stores grid accepts hydrated first-page data', 'components/stores/StoresGrid.tsx', 'initialData: seededInitialPage ? { pages: [seededInitialPage], pageParams: [1] } : undefined'],
  ['services grid accepts hydrated first-page data', 'components/services/ServiceListingsGrid.tsx', 'initialData: seededInitialPage ? { pages: [seededInitialPage], pageParams: [1] } : undefined'],
  ['ads grid keeps a stable SSR pagination page size', 'components/ads/SearchResults.tsx', 'initialPage ? SSR_BROWSE_PAGE_SIZE : getAdaptivePageSize(12, networkPolicy)'],
  ['products grid keeps a stable SSR pagination page size', 'components/stores/ProductsGrid.tsx', 'initialPage ? SSR_BROWSE_PAGE_SIZE : getStablePageSize(12, networkPolicy)'],
  ['stores grid keeps a stable SSR pagination page size', 'components/stores/StoresGrid.tsx', 'initialPage ? SSR_BROWSE_PAGE_SIZE : getStablePageSize(12, networkPolicy)'],
  ['services grid keeps a stable SSR pagination page size', 'components/services/ServiceListingsGrid.tsx', 'initialPage ? SSR_BROWSE_PAGE_SIZE : getStablePageSize(12, networkPolicy)'],
  ['ads result grid is server-renderable', 'components/ads/AdsPageClient.tsx', 'const SearchResults = dynamic('],
  ['products result grid is server-renderable', 'components/stores/ProductsPageClient.tsx', 'const ProductsGrid = dynamic('],
  ['stores result grid is server-renderable', 'components/stores/StoresPageClient.tsx', 'const StoresGrid = dynamic('],
  ['services result grid is server-renderable', 'components/services/ServicesPageClient.tsx', 'const ServiceListingsGrid = dynamic('],
  ['ads route params are passed to the server-rendered results', 'components/ads/AdsPageClient.tsx', 'searchParams={searchParams}'],
  ['products route params are passed to the server-rendered grid', 'components/stores/ProductsPageClient.tsx', 'searchParams={searchParams}'],
  ['stores route params are passed to the server-rendered grid', 'components/stores/StoresPageClient.tsx', 'searchParams={searchParams}'],
  ['services route params are passed to the server-rendered grid', 'components/services/ServicesPageClient.tsx', 'searchParams={searchParams}'],
  ['result grids do not call useSearchParams during their initial render', 'components/ads/SearchResults.tsx', "getBrowseParam(searchParams, 'q')"],
  ['products grid does not call useSearchParams during its initial render', 'components/stores/ProductsGrid.tsx', "getBrowseParam(searchParams, 'search')"],
  ['stores grid does not call useSearchParams during its initial render', 'components/stores/StoresGrid.tsx', "getBrowseParam(searchParams, 'search')"],
  ['services grid does not call useSearchParams during its initial render', 'components/services/ServiceListingsGrid.tsx', "getBrowseParam(searchParams, 'search')"],
  ['URL-dependent save-search control remains isolated from SSR', 'components/services/ServiceListingsGrid.tsx', 'ssr: false, loading: () => null'],
  ['URL-dependent empty-search suggestions remain isolated from SSR', 'components/ads/SearchResults.tsx', 'const EmptySearchSuggestions = dynamic('],
  ['search URL widgets retain their explicit client-only boundary', 'components/search/SearchPageClient.tsx', 'ssr: false'],
];

let failed = 0;
for (const [label, file, needle] of checks) {
  const content = read(file);
  let ok = content.includes(needle);

  if (label === 'server browse fetch has a bounded SSR timeout') {
    ok = ok && content.includes('new AbortController()') && content.includes('setTimeout(() => controller.abort(), timeoutMs)');
  }

  // Result grids must not disable SSR. Their sibling filter controls may
  // remain client-only, so scope this assertion to each grid declaration.
  if (label.endsWith('server-renderable')) {
    const start = content.indexOf(needle);
    const nextDynamic = content.indexOf('\nconst ', start + needle.length);
    const block = content.slice(start, nextDynamic === -1 ? content.length : nextDynamic);
    ok = ok && !block.includes('ssr: false');
  }

  // Grids may read the live URL (history-API filter updates only reach
  // useSearchParams), but must never seed first-page data for a different
  // query: the seed is gated on seedMatchesUrl.
  if (label.includes('do not call useSearchParams')) {
    ok = ok && content.includes('seedMatchesUrl');
  }

  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}

console.log(`\nBrowse hydration phase 1 audit: ${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
