#!/usr/bin/env node
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../hooks/mutations/usePromotionMutations.ts', import.meta.url), 'utf8');
const checks = [
  ['create scopes browse invalidation to the returned product and falls back safely if missing', /onSuccess: \(promotion\) => \{[\s\S]*?invalidateProductBrowseCaches\(queryClient, promotion\?\.productId[\s\S]*?\{ productId: promotion\.productId \}[\s\S]*?\{ includeAllDetails: true \}/.test(source)],
  ['update scopes browse invalidation to the returned product and falls back safely if missing', (source.match(/invalidateProductBrowseCaches\(queryClient, promotion\?\.productId[\s\S]*?\{ productId: promotion\.productId \}[\s\S]*?\{ includeAllDetails: true \}/g) ?? []).length === 2],
  ['cancel attempts to recover product id from cached detail/list', /getQueryData<Promotion>\(queryKeys\.promotions\.detail\(promotionId\)\)/.test(source) && /getQueryData<Promotion\[]>\(queryKeys\.promotions\.mine\(\)\)/.test(source)],
  ['cancel retains safe all-details fallback only when product is unknown', /productId\s*\?\s*\{ productId \}\s*:\s*\{ includeAllDetails: true \}/.test(source)],
  ['promotion collection is still invalidated after all three mutations', (source.match(/invalidateQueries\(\{ queryKey: queryKeys\.promotions\.all\(\) \}\)/g) ?? []).length === 3],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}
console.log(`\nPromotion invalidation scope audit: ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
