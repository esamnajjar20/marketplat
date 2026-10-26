import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const products = fs.readFileSync(path.join(root, 'app/products.tsx'), 'utf8');
const storeDetail = fs.readFileSync(path.join(root, 'app/stores/[id].tsx'), 'utf8');
const commerceApi = fs.readFileSync(path.join(root, 'src/features/commerce/commerce.api.ts'), 'utf8');

assert.match(storeDetail, /pathname:\s*'\/products',[\s\S]{0,80}params:\s*\{\s*storeId:\s*id\s*\}/, 'store page must preserve storeId when opening all products');
assert.match(products, /useLocalSearchParams[\s\S]{0,220}storeId/, 'products page must read storeId route param');
assert.match(products, /fetchProducts\(\{page:1,limit:30,search:submitted,storeId,categoryId\}\)/, 'first page must be scoped to selected store');
assert.match(products, /fetchProducts\(\{page:page\+1,limit:30,search:submitted,storeId,categoryId\}\)/, 'load-more requests must preserve store filter');
assert.match(products, /page\s*<\s*totalPages[\s\S]{0,180}loadMore/, 'products page must expose load more while pages remain');
assert.match(commerceApi, /sortOrder\s*=\s*options\.sortOrder\s*\?\?\s*\(sortBy\s*===\s*'price'\s*\?\s*'asc'\s*:\s*'desc'\)/, 'price sorting should default to ascending');
console.log('Store/services audit regression checks passed (6 checks; static source assertions only).');
