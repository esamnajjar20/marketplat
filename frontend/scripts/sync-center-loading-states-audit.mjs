/** Static guardrails for truthful loading/empty/error states in the sync center. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'components/settings/SyncCenterClient.tsx'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = [
  ['sync center exposes busy state to assistive technology', source.includes('aria-busy={loading || syncing}')],
  ['pending count does not present fallback zero as authoritative after read failure', source.includes("loadWarning ? '—' : String(Math.max(0, pending))")],
  ['draft count distinguishes read failure from zero', source.includes("loadWarning\n                ? '—'\n                : String(drafts.filter")],
  ['attention count distinguishes read failure from zero', source.includes("loadWarning\n                ? '—'\n                : String(failed + drafts.filter")],
  ['favorite empty state distinguishes loading and read failure', source.includes('جارٍ تحميل تغييرات المفضلة') && source.includes('تعذّر التأكد من قائمة تغييرات المفضلة')],
  ['appointment empty state distinguishes loading and read failure', source.includes('جارٍ تحميل طلبات المواعيد') && source.includes('تعذّر التأكد من طلبات المواعيد المحفوظة')],
  ['draft empty state does not falsely claim empty during loading', source.includes('جارٍ تحميل المسودات…') && source.includes('تعذّر التأكد من قائمة المسودات')],
  ['failed queue empty state does not falsely claim empty during loading', source.includes('جارٍ تحميل الطلبات الفاشلة…') && source.includes('لا يمكن تأكيد أن القائمة فارغة')],
  ['sync spinner respects reduced-motion preference', source.includes('animate-spin motion-reduce:animate-none')],
  ['audit command is registered', pkg.scripts?.['ux:sync-center-loading-audit'] === 'node scripts/sync-center-loading-states-audit.mjs'],
];
for (const [name, ok] of checks) console.log(`[sync-center-loading] ${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`[sync-center-loading] PASS ${checks.length} checks`);
