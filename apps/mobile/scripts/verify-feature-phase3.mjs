import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const required = [
  'app/stores.tsx', 'app/stores/[id].tsx', 'app/products.tsx', 'app/products/[id].tsx',
  'app/product-editor.tsx', 'app/my-products.tsx', 'app/my-store.tsx',
  'src/features/commerce/commerce.api.ts',
];
for (const file of required) assert.ok(existsSync(resolve(root, file)), `Missing Phase 3 file: ${file}`);
const api = readFileSync(resolve(root, 'src/features/commerce/commerce.api.ts'), 'utf8');
for (const endpoint of ['/api/v1/stores', '/api/v1/products', '/api/v1/product-categories', '/api/v1/stores/me', '/api/v1/products/me']) assert.ok(api.includes(endpoint), `Missing API contract: ${endpoint}`);
const explore = readFileSync(resolve(root, 'app/explore.tsx'), 'utf8');
const account = readFileSync(resolve(root, 'app/account.tsx'), 'utf8');
for (const route of ["'/stores'", "'/products'"]) assert.ok(explore.includes(route), `Missing explore navigation: ${route}`);
for (const route of ["'/my-store'", "'/my-products'"]) assert.ok(account.includes(route), `Missing account navigation: ${route}`);
const editor = readFileSync(resolve(root, 'app/product-editor.tsx'), 'utf8');
assert.ok(editor.includes('createProduct') && editor.includes('updateProduct'), 'Product editor must support create and update');
assert.ok(editor.includes('categoryId') && editor.includes('description') && editor.includes('price'), 'Product editor fields are incomplete');
console.log(`Phase 3 static verification passed (${required.length} files, API routes, navigation, editor contracts).`);
