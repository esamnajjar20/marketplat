import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['products route delegates to client-only browse shell', 'app/(public)/products/page.tsx', 'ProductsPageClient'],
  ['stores route delegates to client-only browse shell', 'app/(public)/stores/page.tsx', 'StoresPageClient'],
  ['services route delegates to client-only browse shell', 'app/(public)/services/page.tsx', 'ServicesPageClient'],
  ['search route delegates URL-driven widgets to client-only shell', 'app/(public)/search/page.tsx', 'SearchPageClient'],
  ['products filters and results disable SSR', 'components/stores/ProductsPageClient.tsx', 'ssr: false'],
  ['stores filters and results disable SSR', 'components/stores/StoresPageClient.tsx', 'ssr: false'],
  ['services filters and results disable SSR', 'components/services/ServicesPageClient.tsx', 'ssr: false'],
  ['search URL-bound widgets disable SSR', 'components/search/SearchPageClient.tsx', 'ssr: false'],
  ['search query is passed from route params', 'app/(public)/search/page.tsx', 'query={q ?? \'\'}'],
  ['search box remounts when the initial query changes', 'components/search/SearchPageClient.tsx', 'key={query}'],
];
let failed = 0;
for (const [label, file, needle] of checks) {
  const full = path.join(root, file);
  const content = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const ok = content.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}
console.log(`\nBrowse hydration phase 1 audit: ${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
