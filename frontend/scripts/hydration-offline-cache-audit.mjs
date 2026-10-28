#!/usr/bin/env node
/** Guard against reintroducing browser-local cache data into the first hydration render. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let passed = 0;
const check = (ok, message) => {
  if (ok) { passed += 1; console.log(`PASS ${message}`); }
  else { failures.push(message); console.error(`FAIL ${message}`); }
};
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const cachedBrowseHooks = [
  ['hooks/queries/useAds.ts', 'adsBrowse'],
  ['hooks/queries/useProducts.ts', 'productsBrowse'],
  ['hooks/queries/useStores.ts', 'storesBrowse'],
  ['hooks/queries/useServiceListings.ts', 'servicesBrowse'],
  ['hooks/queries/useCategories.ts', 'categories'],
  ['hooks/queries/useProductCategories.ts', 'productCategories'],
  ['hooks/queries/useServiceCategories.ts', 'serviceCategories'],
];
for (const [file, key] of cachedBrowseHooks) {
  const source = read(file);
  check(source.includes('useOfflineListSeed') && source.includes(`OFFLINE_LIST_KEYS.${key}`), `${file}: offline cache is seeded after mount`);
  check(!/const cached\s*=\s*(?:isBaseBrowse\s*\?\s*)?getOfflineList/.test(source), `${file}: no synchronous render-time offline cache read`);
  check(!/initialData:\s*(?:cached\.items|offlinePage\(cached\.items\))/.test(source), `${file}: localStorage snapshot cannot alter initial SSR/client markup`);
}

const seed = read('lib/useOfflineListSeed.ts');
check(/useEffect\(/.test(seed) && /getOfflineList<TItem>/.test(seed), 'shared cache seed reads browser storage only inside an effect');
check(/queryClient\.getQueryData\(queryKey\) !== undefined/.test(seed), 'shared cache seed never overwrites existing query data');
check(/updatedAt:/.test(seed), 'offline snapshot preserves its saved timestamp');



const ranking = read('components/sellers/SellersRankingList.tsx');
check(ranking.includes('useOfflineListSeed') && ranking.includes('OFFLINE_LIST_KEYS.sellersRanking'), 'public sellers ranking seeds its offline list after mount');
check(!/const cached\s*=\s*getOfflineList<RankRow>/.test(ranking) && !/initialData:\s*cached\.items/.test(ranking), 'public sellers ranking has no render-time offline initialData');

const notifications = read('hooks/queries/useNotifications.ts');
check((notifications.match(/getNotificationsCache\(\)/g) ?? []).length === 2, 'notification cache is read only in the two post-mount seed effects');
check(!/initialData:\s*(?:\{\s*items:\s*cached\.items|cached\.unreadCount)/.test(notifications), 'global notification list and badge do not use browser cache as initialData');
check((notifications.match(/queryClient\.setQueryData\(/g) ?? []).length === 2 && (notifications.match(/useEffect\(/g) ?? []).length >= 4, 'both notification cache seeds run through effects without overwriting existing query data');

const providerCard = read('components/services/ServiceProviderCard.tsx');
check(/const \[mounted, setMounted\] = useState\(false\)/.test(providerCard) && /const userCity = mounted \? persistedUserCity : null/.test(providerCard), 'service-provider card defers persisted account city until after hydration');

console.log(`\nOffline-cache hydration audit: ${passed}/${passed + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
