import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

const categoriesApi = await read('src/features/categories/categories.api.ts');
const adsApi = await read('src/features/ads/ads.api.ts');
const home = await read('app/index.tsx');
const backendRoutes = await readFile(path.resolve(root, '../api/src/modules/categories/categories.routes.ts'), 'utf8').catch(() => '');

assert.match(categoriesApi, /\/api\/v1\/categories/);
assert.match(categoriesApi, /response\.success !== true/);
assert.match(categoriesApi, /flattenPublicCategories/);
assert.match(adsApi, /categoryId\?: string/);
assert.match(adsApi, /params\.set\('categoryId', options\.categoryId\)/);
assert.doesNotMatch(home, /fetchPublicCategories|categoriesError|setSelectedCategory|categoryGrid/, 'Home should not fetch or render a duplicate category grid; category browsing remains a separate route.');
assert.match(home, /fetchServiceListings/, 'Home must retain the requested services section.');
if (backendRoutes) assert.match(backendRoutes, /categoriesRouter\.get\('\/', CACHE\.STATIC, categoriesController\.getCategories\)/);

console.log('Phase 7 category integration checks passed (static contract checks only; no live API or native build performed).');
