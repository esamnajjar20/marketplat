import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const constants = read('lib/constants.ts');
const sales = read('hooks/queries/useSales.ts');
const mutations = read('hooks/mutations/useSaleMutations.ts');
const checks = [
  ['sales list has a bounded freshness window', /salesList:\s*15_000/.test(constants) && /staleTime:\s*CACHE_TTL\.salesList/.test(sales)],
  ['sales aggregates share a bounded freshness window', /salesData:\s*60_000/.test(constants) && (sales.match(/staleTime:\s*CACHE_TTL\.salesData/g) ?? []).length === 3],
  ['cost settings are cached as slowly-changing reference data', /costSettings\(\).*staleTime:\s*5 \* 60_000/.test(sales)],
  ['cost products are cached and remain explicitly invalidatable', /costProducts\(\).*staleTime:\s*5 \* 60_000/.test(sales) && /sales\.costProducts\(\)/.test(mutations)],
  ['sale mutations invalidate the sales query family', /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.sales\.all\(\)/.test(mutations)],
  ['sales list retains previous data while changing pages', /placeholderData:\s*keepPreviousData/.test(sales)],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
