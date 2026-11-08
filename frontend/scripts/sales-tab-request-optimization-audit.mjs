import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const overview = read('components/sales/SalesPageClient.tsx');
const list = read('components/sales/SalesListClient.tsx');
const reports = read('components/sales/SalesReports.tsx');
const checks = [
  ['overview shares first sales page query', /useSales\(\{\s*page:\s*1,\s*limit:\s*12\s*\}\)/.test(overview)],
  ['overview renders only four records', /data\?\.items\s*\?\?\s*\[\]\)\.slice\(0,\s*4\)/.test(overview)],
  ['sales list uses the shared first-page query', /useSales\(\{\s*page,\s*limit:\s*12\s*\}\)/.test(list)],
  ['report preview bounded to 100 rows', /REPORT_PREVIEW_LIMIT\s*=\s*100/.test(reports)],
  ['CSV export remains independently bounded', /REPORT_EXPORT_LIMIT\s*=\s*5000/.test(reports)],
  ['report totals and hasMore messaging retained', /data\.totals\.revenue/.test(reports) && /data\.hasMore/.test(reports)],
];
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
console.log(`\n${checks.filter(([, ok]) => ok).length}/${checks.length} checks passed`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
