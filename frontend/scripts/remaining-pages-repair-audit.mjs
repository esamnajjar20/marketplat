#!/usr/bin/env node
/**
 * Regression guardrails for the final remaining-page repairs.
 * Source-contract checks complement (but do not replace) Next build and browser tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];
let passed = 0;
function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${message}`);
  } else {
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
}

const suggestions = read('components/suggestions/SuggestionsPageClient.tsx');
const recommendationsApi = read('api/recommendations.api.ts');
const trendingPage = read('app/(public)/trending/page.tsx');
check(/useMixedRecommendations/.test(suggestions) && !/useProductRecommendations|useServiceRecommendations|useRecommendations\(/.test(suggestions), 'Suggestions use one mixed recommendation request instead of three type-specific calls');
check(/recommendationSettled/.test(suggestions) && /fallbackAdsEnabled = ready && recommendationSettled/.test(suggestions) && /fallbackProductsEnabled = ready && recommendationSettled/.test(suggestions) && /fallbackServicesEnabled = ready && recommendationSettled/.test(suggestions), 'Recommendation fallbacks start only after the mixed response settles and only for underfilled types');
check(/getMixedRecommendations/.test(recommendationsApi) && /queryKeys\.recommendations\.mixed/.test(read('hooks/queries/useRecommendations.ts')), 'Mixed recommendation client and query key remain the canonical contract');
check(/fetchServerApi<MixedRecommendations>/.test(trendingPage) && /recommendations\.mixed\(params, 'guest'\)/.test(trendingPage) && /mode: 'no-store'/.test(trendingPage), 'Public trending page hydrates one non-shared guest-scoped mixed response');
check(/hasRecommendationContent/.test(suggestions) && /!hasRecommendationContent/.test(suggestions), 'Hydrated public trending items render before browser auth/city readiness while empty shelves wait for fallbacks');

const categoriesPage = read('app/(public)/categories/page.tsx');
const prefetch = read('lib/prefetch.ts');
const categoryItems = read('hooks/queries/useCategoryItems.ts');
check(/prefetchCategoryCatalog/.test(categoriesPage) && !/prefetchHomepage/.test(categoriesPage), 'Category index no longer downloads the full homepage payload');
check(/queryKeys\.categories\.all\(\)/.test(prefetch) && /queryKeys\.productCategories\.all\(\)/.test(prefetch) && /queryKeys\.serviceCategories\.all\(\)/.test(prefetch), 'Category catalog prefetches all three trees under the hooks canonical keys');
check(!/useHomepage/.test(categoryItems) && /useCategories/.test(categoryItems) && /useProductCategories/.test(categoryItems) && /useServiceCategories/.test(categoryItems), 'Category index consumes its three dedicated catalog queries');

const requestsPage = read('app/(public)/requests/page.tsx');
const requestsShell = read('components/requests/RequestsPageShell.tsx');
const requestsClient = read('components/requests/RequestsPageClient.tsx');
check(/fetchServerApi<RequestListItem\[]>/.test(requestsPage) && /queryKeys\.requests\.open\(params\)/.test(requestsPage), 'Open requests first page is prefetched server-side with the same cache key as the client');
check(/searchParams: Promise/.test(requestsPage) && /params: OpenRequestsPageParams/.test(requestsShell) && !/useSearchParams/.test(requestsClient), 'Request filters are normalized from the URL on the server');
check(/useOpenRequests\(params\)/.test(requestsClient) && /buildTypeHref/.test(requestsClient), 'Request filters and interactive URL navigation remain active after hydration');

const searchPage = read('app/(public)/search/page.tsx');
const searchClient = read('components/search/SearchPageClient.tsx');
const searchResults = read('components/search/SearchResults.tsx');
check(/fetchServerApi<SearchResult\[]>/.test(searchPage) && /queryKeys\.search\.infinite/.test(searchPage) && /mode: 'no-store'/.test(searchPage), 'Search first page is server-rendered without creating high-cardinality shared cache entries');
check(/lat === undefined && search\.lng === undefined/.test(searchPage), 'GPS-dependent search remains client-resolved unless both coordinates are supplied');
const searchResultsImport = searchClient.slice(searchClient.indexOf('const SearchResults = dynamic('), searchClient.indexOf('const SearchActiveFilters = dynamic('));
check(/const SearchResults = dynamic\([\s\S]*?loading:/.test(searchResultsImport) && !/ssr:\s*false/.test(searchResultsImport) && /<Suspense/.test(searchClient), 'Search result graph is SSR-capable and URL hook is enclosed by Suspense');
check(/limit:\s*pageSize/.test(searchResults) && /queryKeys\.search\.infinite/.test(searchResults), 'Search client uses the stable hydrated page size and exact infinite query key');
check(/parseUrlNumber/.test(searchResults) && /value\.trim\(\) === ''/.test(searchResults) && /value\.trim\(\) === ''/.test(searchPage), 'Blank and malformed numeric URL filters normalize consistently on server and client');

const profilePage = read('app/(public)/profile/[id]/page.tsx');
const profileAds = read('components/profile/PublicProfileAds.tsx');
check(/fetchServerApi<AdListItem\[]>/.test(profilePage) && /queryKeys\.users\.ads\(id, \{ page: requestedPage \}\)/.test(profilePage), 'Public profile initial ads page is prefetched under the client hook key');
check(/selectedTab === 'overview' \|\| selectedTab === 'ads'/.test(profilePage) && /useUserAds\(userId, \{ page \}\)/.test(profileAds), 'Only the initially visible ads tab is prefetched; other profile tabs remain lazy');


const recommendationsRoutes = read('../apps/api/src/modules/recommendations/recommendations.routes.ts');
const requestsRoutes = read('../apps/api/src/modules/requests/requests.routes.ts');
const searchRoutes = read('../apps/api/src/modules/search/search.routes.ts');
const usersRoutes = read('../apps/api/src/modules/users/users.routes.ts');
const categoriesRoutes = read('../apps/api/src/modules/categories/categories.routes.ts');
check(/recommendationsRouter\.get\([\s\S]*?recommendationsRateLimit,\s*CACHE\.NONE,\s*recommendationsController\.getRecommendations/.test(recommendationsRoutes), 'Trending SSR reads the public, non-shared recommendation endpoint without caller identity');
check(/requestsRouter\.get\('\/', optionalAuthenticate, CACHE\.SHORT, requestsController\.getOpenFeed\)/.test(requestsRoutes), 'Requests SSR targets the public open feed, not the owner-only requests endpoints');
check(/searchRouter\.get\('\/', CACHE\.SHORT, searchController\.search\)/.test(searchRoutes), 'Search SSR uses the explicitly public search route');
check(/usersRouter\.get\('\/:id\/ads', CACHE\.SHORT, usersController\.getUserAds\)/.test(usersRoutes), 'Profile SSR only fetches the public profile-ad list endpoint');
check(/categoriesRouter\.get\('\/', CACHE\.STATIC/.test(categoriesRoutes), 'Category catalog SSR is limited to public taxonomy endpoints');

const promotedPage = read('app/(public)/promoted/page.tsx');
const promotedClient = read('components/promoted/PromotedLoadMore.tsx');
check(/promotedInfinite\(PAGE_SIZE\)/.test(promotedPage) && /promotedInfinite\(PAGE_SIZE\)/.test(promotedClient), 'Promoted products server and client use the same infinite query key');
check(/items\.map\(\(product\) =>/.test(promotedPage) && /<ProductCard/.test(promotedPage), 'Promoted first page is rendered as Server Component cards in the route');
check(/hasServerSeed \? pages\.slice\(1\) : pages/.test(promotedClient) && /visiblePages\.flatMap\(\(page\) => page\.items/.test(promotedClient), 'Promoted client island renders only later pages when the server seeded page one, and all pages on fallback');
check(/useInfiniteQuery/.test(promotedClient) && /fetchNextPage\(\)/.test(promotedClient), 'Promoted pagination uses TanStack infinite-query lifecycle and preserves load-more behavior');

console.log(`\nRemaining pages repair audit: ${passed}/${passed + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
