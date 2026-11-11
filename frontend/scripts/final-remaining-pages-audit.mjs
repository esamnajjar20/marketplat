#!/usr/bin/env node
/**
 * Final sweep guardrails for public routes outside the five earlier phases.
 * Checks source contracts only; this does not replace Next build/browser tests.
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

const rankingPage = read('app/(public)/sellers/ranking/page.tsx');
const rankingClient = read('components/sellers/SellersRankingClient.tsx');
const rankingList = read('components/sellers/SellersRankingList.tsx');
const rankingTypes = read('types/seller-ranking.types.ts');
const rankingNormalizer = read('lib/sellerRanking.ts');
const queryKeys = read('lib/queryKeys.ts');
const rankingTests = read('__tests__/integration/queryKeys.test.ts');

check(/fetchServerApi<SellerRankingRow\[]>/.test(rankingPage), 'Seller ranking is prefetched in the Server Component');
check(/queryKeys\.sellers\.ranking\(RANKING_LIMIT\)/.test(rankingPage), 'Seller ranking SSR uses the canonical query key');
check(/HydrationBoundary[\s\S]*SellersRankingClient/.test(rankingPage), 'Seller ranking passes its first page through HydrationBoundary');
check(!/ssr:\s*false/.test(rankingClient), 'Seller ranking no longer disables server rendering');
check(/useOfflineListSeed/.test(rankingList) && /useEffect\([\s\S]*persistServerSeed/.test(rankingList), 'Seller ranking preserves offline seeding without re-stamping stale snapshots');
check(/staleTime:\s*30_000/.test(rankingList), 'Seller ranking avoids an immediate duplicate fetch after hydration');
check(/isError && data !== undefined/.test(rankingList) && /isError && data === undefined/.test(rankingList), 'Seller ranking keeps cached/offline rows visible after refresh errors');
check(/ranking:\s*\(limit = 20\) => \['sellers', 'ranking', limit\]/.test(queryKeys), 'Seller ranking key is centralized');
check(/queryKeys\.sellers\.ranking\(30\)/.test(rankingTests), 'Seller ranking key contract is covered by integration tests');
check(/interface SellerRankingRow/.test(rankingTypes) && /normalizeSellerRankingRows/.test(rankingNormalizer), 'Seller ranking DTO and normalization are shared by server/client paths');

const statsPage = read('app/(public)/store/[slug]/stats/page.tsx');
const statsClient = read('components/stores/PublicSalesStats.tsx');
check(/fetchServerApi<PublicStoreSalesStats>/.test(statsPage), 'Public store statistics are fetched in the Server Component');
check(/public\/stores\/\$\{encodeURIComponent\(slug\)\}\/stats/.test(statsPage), 'Public store stats path encodes the route slug');
check(/queryKeys\.publicStoreSalesStats\(slug\)/.test(statsPage) && /HydrationBoundary/.test(statsPage), 'Public store stats hydrate the exact client query key');
check(/staleTime:\s*20_000/.test(statsClient), 'Public store stats do not immediately repeat the SSR request');
check(/interface PublicStoreSalesStats/.test(read('types/public-store-stats.types.ts')), 'Public store statistics use an explicit shared DTO');

const categoryPage = read('app/(public)/categories/[slug]/page.tsx');
check(/cache\(\(slug: string\) => categoriesApi\.getBySlug\(slug\)\)/.test(categoryPage), 'Category metadata and page share the same category lookup');
check(/queryKeys\.categories\.slug\(slug\)/.test(categoryPage), 'Category slug query is hydrated instead of refetched by client widgets');
check(/fetchPublicBrowsePage<AdListItem>/.test(categoryPage) && /initialPage=\{initialPage\}/.test(categoryPage), 'Category landing page server-renders its first filtered ad page');
check(/searchEnabled \? '\/ads\/search' : '\/ads'/.test(categoryPage), 'Category landing SSR preserves the existing search endpoint selection');

// Location-dependent service-provider discovery intentionally remains client-only:
// it depends on persisted account city and browser GPS state, so forcing SSR would
// make server/client initial output diverge unless a separate deterministic seed is designed.
const providerShell = read('components/services/ServiceProvidersPageShell.tsx');
const providerDirectory = read('components/services/NearbyServiceProviders.tsx');
check(/ssr:\s*false/.test(providerShell) && /useServiceProvidersDirectory/.test(providerDirectory) && /useLocationResolver/.test(read('hooks/useServiceProvidersDirectory.ts')), 'GPS/account-city directory remains behind a hydration-safe client boundary');

// Preserve deliberate boundaries after the final sweep: these routes have
// browser-, identity-, or URL-dependent behavior and must not be converted
// without a smaller client graph or a deterministic server contract.
const servicesPage = read('app/(public)/services/page.tsx');
check(/fetchPublicBrowsePage<ServiceListingWithProvider>/.test(servicesPage) && /initialPage=/.test(servicesPage), 'Services first page remains server-prefetched while pagination stays interactive');
const searchPage = read('app/(public)/search/page.tsx');
const searchClient = read('components/search/SearchPageClient.tsx');
const searchResults = read('components/search/SearchResults.tsx');
check(/fetchServerApi<SearchResult\[]>/.test(searchPage) && /queryKeys\.search\.infinite/.test(searchPage), 'Unified search hydrates the exact first-page query for non-GPS URLs');
const searchResultsImport = searchClient.slice(searchClient.indexOf('const SearchResults = dynamic('), searchClient.indexOf('const SearchActiveFilters = dynamic('));
check(/const SearchResults = dynamic\([\s\S]*?loading:/.test(searchResultsImport) && !/ssr:\s*false/.test(searchResultsImport) && /<Suspense/.test(searchClient), 'Search results are server-renderable while URL hooks remain inside Suspense');
check(/limit:\s*pageSize/.test(searchResults) && /queryKeys\.search\.infinite/.test(searchResults), 'Search client keeps the hydrated page size and canonical key');
const requestsPage = read('app/(public)/requests/page.tsx');
const requestsShell = read('components/requests/RequestsPageShell.tsx');
const requestsClient = read('components/requests/RequestsPageClient.tsx');
check(/fetchServerApi<RequestListItem\[]>/.test(requestsPage) && /queryKeys\.requests\.open/.test(requestsPage), 'Open requests first page is server-prefetched with the canonical query key');
check(!/ssr:\s*false/.test(requestsShell) && /searchParams: Promise/.test(requestsPage) && /params=\{params\}/.test(requestsShell), 'Open requests parse URL state on the server and pass normalized parameters to the client island');
const storiesPage = read('app/(protected)/stories/page.tsx');
check(/^['"]use client['"]/m.test(storiesPage) && /StoryComposer/.test(storiesPage) && /StoryViewer/.test(storiesPage), 'Authenticated story composer/viewer remains an interactive client route');

console.log(`\nFinal remaining public pages audit: ${passed}/${passed + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
