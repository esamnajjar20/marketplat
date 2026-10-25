import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const cache = read('src/storage/public-cache.ts');
const ads = read('src/features/ads/ads.api.ts');
const categories = read('src/features/categories/categories.api.ts');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['public cache uses persistent SQLite storage', cache.includes("from 'expo-sqlite'")],
  ['public cache has bounded entry size', cache.includes('MAX_ENTRY_CHARS')],
  ['public cache stores timestamps in SQLite', cache.includes('saved_at INTEGER NOT NULL')],
  ['ads read cached results on request failure', ads.includes('readPublicCache<AdListResult>(cacheKey)')],
  ['ads cache successful results', (ads.includes('writePublicCache(cacheKey, result)') || ads.includes('writePublicCache(cacheKey, cachedResult)'))],
  ['categories fallback to cache', categories.includes("readPublicCache<PublicCategory[]>('categories')")],
  ['categories cache successful results', categories.includes("writePublicCache('categories', categories)")],
  ['phase 18 test is wired', pkg.scripts.test.includes('verify-phase18.mjs')],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
console.log('Phase 18 cache integration checks passed (static checks only; no device/database runtime test implied).');
