import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [
  ['global navigation progress is mounted in the root layout', read('app/layout.tsx').includes('<NavigationProgress />')],
  ['stalled navigation has a visible recovery prompt', read('components/shared/NavigationProgress.tsx').includes('LOADING_COPY.navigationStalled') && read('lib/loadingCopy.ts').includes('تأخر فتح الصفحة') && read('components/shared/NavigationProgress.tsx').includes('window.location.assign(stalledHref)')],
  ['navigation fail-safe is bounded', read('components/shared/NavigationProgress.tsx').includes('FAILSAFE_MS = 12_000')],
  ['public routes have a non-empty loading boundary', fs.existsSync(path.join(root, 'app/(public)/loading.tsx'))],
  ['protected routes have a non-empty loading boundary', fs.existsSync(path.join(root, 'app/(protected)/loading.tsx'))],
  ['auth routes have a non-empty loading boundary', fs.existsSync(path.join(root, 'app/(auth)/loading.tsx'))],
  ['admin routes have a non-empty loading boundary', fs.existsSync(path.join(root, 'app/(admin)/loading.tsx'))],
  ['error boundaries do not return a blank while recovering', ['app/(auth)/error.tsx','app/(admin)/error.tsx','app/(public)/error.tsx','app/(protected)/error.tsx'].every((p) => !/if \(recovering\) return null;/.test(read(p)))],
  ['protected edit redirects display status instead of null', ['app/(protected)/my-ads/[id]/edit/page.tsx','app/(protected)/my-services/[id]/edit/page.tsx','app/(protected)/my-store/products/[id]/edit/page.tsx'].every((p) => !/if \(isRedirecting\) return null;/.test(read(p)))],
  ['admin access redirects display a status instead of null', !/if \(!isAuthenticated \|\| !isAdminTier \|\| isOutOfScopeForModerator\) return null;/.test(read('app/(admin)/layout.tsx'))],
];
let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
console.log(`\nBlank-screen navigation audit: ${checks.length - failures}/${checks.length} checks passed`);
if (failures) process.exitCode = 1;
