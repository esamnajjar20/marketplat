import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sidebar = read('components/layout/ProtectedSidebar.tsx');
const bottomNav = read('components/layout/BottomNav.tsx');
const protectedLayout = read('app/(protected)/layout.tsx');
const publicLayout = read('app/(public)/layout.tsx');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const checks = [
  ['sidebar links use at least 44px minimum height', /min-h-11 items-center/.test(sidebar)],
  ['sidebar disclosure controls use at least 44px minimum height', /min-h-11 w-full/.test(sidebar)],
  ['sidebar links have visible keyboard focus', /focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2/.test(sidebar)],
  ['disclosure controls have visible keyboard focus', /min-h-11 w-full[\s\S]*?focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2/.test(sidebar)],
  ['disclosure controls expose expanded state', /aria-expanded=\{isOpen\}/.test(sidebar)],
  ['sidebar navigation avoids eager route prefetch', /prefetch=\{false\}/.test(sidebar)],
  ['mobile navigation has a descriptive accessible label', /aria-label="التنقل الرئيسي"/.test(bottomNav)],
  ['mobile navigation marks current page', /aria-current=\{isActive \? 'page' : undefined\}/.test(bottomNav)],
  ['mobile navigation respects reduced motion', /motion-reduce:transition-none/.test(bottomNav)],
  ['protected shell reserves mobile bottom-nav space', /pb-20 md:p-6 md:pb-6/.test(protectedLayout)],
  ['conversation thread avoids bottom-nav overlap', /isConversationThread\s*\|\|/.test(protectedLayout) && /\{!isImmersiveTask && <BottomNav \/>\}/.test(protectedLayout)],
  ['protected shell includes skip-link target', /id="main-content"/.test(protectedLayout)],
  ['public shell includes main-content skip-link target', /id="main-content"/.test(publicLayout)],
  ['audit command is registered in package scripts', packageJson.scripts?.['app-shell:navigation-audit'] === 'node scripts/app-shell-navigation-audit.mjs'],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
