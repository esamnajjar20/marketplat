import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}
const sources = [...walk('app'), ...walk('src')];

// 1) Pull-to-refresh: screens must use BrandRefreshControl, never RefreshControl directly.
const directRefresh = sources.filter((f) => {
  if (f.endsWith('src/components/ui/BrandRefreshControl.tsx')) return false;
  const text = read(f);
  return /<RefreshControl\b/.test(text) || /import\s*\{[^}]*\bRefreshControl\b[^}]*\}\s*from 'react-native'/.test(text);
});
const brand = read('src/components/ui/BrandRefreshControl.tsx');
const uiIndex = read('src/components/ui/index.ts');
const appointment = read('app/appointment-create.tsx');
const slots = read('src/features/appointments/appointment-slots.ts');

const checks = [
  ['BrandRefreshControl owns the pull-to-refresh colors for iOS and Android',
    brand.includes('tintColor={colors.brand}') && brand.includes('colors={[colors.brand]}') && brand.includes('<RefreshControl')],
  ['BrandRefreshControl is exported from the ui barrel', uiIndex.includes("BrandRefreshControl")],
  [`no screen builds RefreshControl directly (${directRefresh.length} offenders${directRefresh.length ? ': ' + directRefresh.join(', ') : ''})`,
    directRefresh.length === 0],
  ['appointment-create reuses the shared market-date key instead of its own Intl formatter',
    appointment.includes('marketDateKey') && !appointment.includes('marketDateParts') && slots.includes('export function marketDateKey')],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}
console.log(`Round 5 unification checks: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
