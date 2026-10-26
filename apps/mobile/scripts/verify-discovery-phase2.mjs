import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['unified search calls existing API', () => assert.match(read('src/features/discovery/discovery.api.ts'), /\/api\/v1\/search\?/)],
  ['seller ranking calls existing API', () => assert.match(read('src/features/discovery/discovery.api.ts'), /\/api\/v1\/sellers\/ranking\?/)],
  ['recommendations use existing mixed endpoint', () => assert.match(read('src/features/discovery/discovery.api.ts'), /\/api\/v1\/recommendations\?type=mixed/)],
  ['advanced search exposes entity types', () => { const s = read('app/search.tsx'); for (const v of ['ads', 'products', 'stores', 'services']) assert.ok(s.includes(`value: '${v}'`)); }],
  ['advanced search supports price validation', () => assert.match(read('app/search.tsx'), /min > max/)],
  ['advanced search supports pagination', () => assert.match(read('app/search.tsx'), /تحميل المزيد/)],
  ['recommendation feed handles ads products and services', () => { const s = read('src/features/discovery/DiscoveryFeedScreen.tsx'); for (const v of ["kind: 'ad'", "kind: 'product'", "kind: 'service'"]) assert.ok(s.includes(v)); }],
  ['trending screen is registered', () => assert.ok(fs.existsSync(path.join(root, 'app/trending.tsx')))],
  ['suggestions screen is registered', () => assert.ok(fs.existsSync(path.join(root, 'app/suggestions.tsx')))],
  ['category detail screen is registered', () => assert.ok(fs.existsSync(path.join(root, 'app/categories/[id].tsx')))],
  ['public category list is registered', () => assert.ok(fs.existsSync(path.join(root, 'app/categories.tsx')))],
  ['seller ranking screen is registered', () => assert.ok(fs.existsSync(path.join(root, 'app/sellers-ranking.tsx')))],
  ['explore menu links discovery screens', () => { const s = read('app/explore.tsx'); for (const p of ['/categories', '/search', '/suggestions', '/trending', '/sellers-ranking']) assert.ok(s.includes(p)); }],
  ['home shortcuts link discovery screens', () => { const s = read('app/index.tsx'); for (const p of ['/categories', '/search', '/suggestions', '/trending', '/sellers-ranking']) assert.ok(s.includes(p)); }],
];
for (const [name, run] of checks) { run(); console.log(`PASS ${name}`); }
console.log(`Discovery phase 2: ${checks.length} checks passed.`);
