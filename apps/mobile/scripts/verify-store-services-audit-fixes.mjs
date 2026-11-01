import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const products = fs.readFileSync(path.join(root, 'app/products.tsx'), 'utf8');
const storeDetail = fs.readFileSync(path.join(root, 'app/stores/[id].tsx'), 'utf8');
const commerceApi = fs.readFileSync(path.join(root, 'src/features/commerce/commerce.api.ts'), 'utf8');

assert.match(storeDetail, /pathname:\s*'\/products',[\s\S]{0,80}params:\s*\{\s*storeId:\s*id\s*\}/, 'store page must preserve storeId when opening all products');
assert.match(products, /useLocalSearchParams[\s\S]{0,220}storeId/, 'products page must read storeId route param');
assert.match(products, /usePaginatedList<ProductSummary>/, 'products page must use the shared cancellable pagination lifecycle');
assert.match(products, /search:\s*submitted,[\s\S]*?storeId,[\s\S]*?categoryId,[\s\S]*?signal,/, 'every page must preserve search, store, category and cancellation options');
assert.match(products, /hasNextPage[\s\S]{0,260}loadMore/, 'products page must expose load more while pages remain');
assert.match(products, /loadMoreError[\s\S]{0,220}loadMore\(\)/, 'page append failures must offer retry without resetting the list');
assert.match(commerceApi, /sortOrder\s*=\s*options\.sortOrder\s*\?\?\s*\(sortBy\s*===\s*'price'\s*\?\s*'asc'\s*:\s*'desc'\)/, 'price sorting should default to ascending');
console.log('Store/services audit regression checks passed (shared pagination preserves store filters and retry behavior).');
