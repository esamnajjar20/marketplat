#!/usr/bin/env node
/** Public browse/search request guardrails derived from the supplied network trace. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const link = read('components/navigation/IntentPrefetchLink.tsx');
const adsSheet = read('components/ads/SearchFiltersSheet.tsx');
const searchFilters = read('components/search/SearchFilters.tsx');
const listShell = read('components/shared/list/ListPageShell.tsx');
const searchPage = read('components/search/SearchPageClient.tsx');
const categoryPage = read('app/(public)/categories/[slug]/page.tsx');
const serviceTypesHook = read('hooks/queries/useServiceTypes.ts');
const storeTypesHook = read('hooks/queries/useStoreTypes.ts');
const storeFilters = read('components/stores/StoresFilters.tsx');
const serviceFilters = read('components/services/ServiceCategoryFilter.tsx');
const requestFilters = read('components/requests/RequestFilters.tsx');
const desktopOnly = read('components/shared/layout/DesktopOnly.tsx');
const searchSheet = read('components/search/SearchFiltersSheet.tsx');

check(/prefetchOnIntent\s*=\s*false/.test(link), 'opt-in intent prefetch must default to disabled');
check(/prefetchOnIntent\s*&&\s*isOptedOut/.test(link), 'intent prefetch must require an explicit opt-in');
check(/canPrefetchOnIntent\s*&&\s*intentHref\s*===\s*href\s*\?\s*null\s*:\s*prefetch/.test(link), 'explicit prefetch=false is not being preserved by default');

check(!/useAds|useSearchAds|useCategoryBySlug/.test(adsSheet), 'ads mobile filter sheet still requests list/category data it no longer displays');
check(/results grid owns listing data/i.test(adsSheet), 'ads filter sheet ownership comment is missing');

check(/useCategories\(\{\s*enabled:\s*shouldLoadAdCategories\s*\}\)/.test(searchFilters), 'search page ad taxonomy is not gated by advanced filter visibility');
check(/useProductCategories\(\{\s*enabled:\s*shouldLoadProductCategories\s*\}\)/.test(searchFilters), 'search page product taxonomy is not gated by advanced filter visibility');
check(/useServiceCategories\(\{\s*enabled:\s*shouldLoadServiceCategories\s*\}\)/.test(searchFilters), 'search page service taxonomy is not gated by advanced filter visibility');
check(/const shouldLoadAdCategories\s*=\s*advancedOpen/.test(searchFilters), 'search taxonomies are not gated by the user opening advanced options');

check(/<DesktopOnly>\{sidebar\}<\/DesktopOnly>/.test(listShell), 'shared browse sidebars still mount on mobile');
check(/<DesktopOnly>\s*<SearchFilters\s*\/>\s*<\/DesktopOnly>/.test(searchPage), 'search desktop sidebar still mounts on mobile');
check(/<DesktopOnly>\s*<Suspense>\s*<SearchFilters/.test(categoryPage), 'category desktop sidebar still mounts on mobile');
check(/useSyncExternalStore/.test(desktopOnly) && /1024px/.test(desktopOnly), 'desktop-only mounting must follow the lg breakpoint without hydration mismatch');

check(/options\?:\s*\{\s*enabled\?:\s*boolean\s*\}/.test(serviceTypesHook), 'service types hook does not expose an enabled guard');
check(/options\?:\s*\{\s*enabled\?:\s*boolean\s*\}/.test(storeTypesHook), 'store types hook does not expose an enabled guard');
check(/useStoreTypes\(\{\s*enabled:\s*Boolean\(sp\.get\('type'\)\)\s*\|\|\s*storeTypesRequested,\s*\}\)/.test(storeFilters), 'store types are fetched before a type selector is used');
check(/onOpenChange=\{\(open\)\s*=>\s*\{\s*if\s*\(open\)\s*setStoreTypesRequested\(true\)/.test(storeFilters), 'store type select does not request options on user interaction');
check(/useServiceTypes\(\{\s*enabled:\s*Boolean\(serviceTypeId\)\s*\|\|\s*serviceTypesRequested,\s*\}\)/.test(serviceFilters), 'service types are fetched before a service type is selected or opened');
check(/onOpenChange=\{\(open\)\s*=>\s*\{\s*if\s*\(open\)\s*setServiceTypesRequested\(true\)/.test(serviceFilters), 'service type selector does not request options on user interaction');
check(/type === 'SERVICE' && \(Boolean\(serviceTypeId\) \|\| serviceTypesRequested\)/.test(requestFilters), 'requests page loads service types outside the active service filter');
check(/onFocus=\{\(\)\s*=>\s*setServiceTypesRequested\(true\)\}/.test(requestFilters), 'request service type selector does not defer its taxonomy until focus');
check(/<SearchFilters\s*\/>/.test(searchSheet), 'search mobile filter panel no longer includes the actual filters');
check(!/useCategories|useProductCategories|useServiceCategories/.test(searchSheet), 'search mobile sheet itself owns taxonomy fetching rather than the opened filter UI');

console.log(`Public page request reduction audit: ${failures.length ? 'FAILED' : 'PASSED'}`);
console.log('Scope: public RSC prefetch policy, ads filters, search taxonomies, responsive sidebars, requests taxonomy.');
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
