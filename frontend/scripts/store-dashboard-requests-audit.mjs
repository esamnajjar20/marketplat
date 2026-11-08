import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const checks = [
  {
    name: 'Promotion product-name lookup is conditional on actual promotions',
    ok: /useMyProducts\(\s*\{\s*limit:\s*100\s*\},\s*\{\s*enabled:\s*\(promotions\?\.length\s*\?\?\s*0\)\s*>\s*0\s*\}/s.test(read('../components/stores/MyPromotionsList.tsx')),
  },
  {
    name: 'Promotion form product catalogue loads only while dialog is open',
    ok: /useMyProducts\(\s*\{\s*status:\s*'ACTIVE',\s*limit:\s*100\s*\},\s*\{\s*enabled:\s*open\s*\}/s.test(read('../components/stores/PromotionForm.tsx')),
  },
  {
    name: 'My product list remains paginated at 10 items',
    ok: /useMyProducts\(\{[\s\S]*?page,[\s\S]*?limit:\s*10/.test(read('../components/stores/MyProductsList.tsx')),
  },
  {
    name: 'Inventory remains paginated at 20 active products',
    ok: /useMyProducts\(\{[\s\S]*?limit:\s*20,[\s\S]*?status:\s*'ACTIVE'/.test(read('../components/stores/MyStoreInventory.tsx')),
  },
  {
    name: 'Owner product queries retain the central 120-second freshness policy',
    ok: /staleTime:\s*CACHE_TTL\.myAds/.test(read('../hooks/queries/useProducts.ts')) && /myAds:\s*120_000/.test(read('../lib/constants.ts')),
  },
];

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
const failed = checks.filter((check) => !check.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
