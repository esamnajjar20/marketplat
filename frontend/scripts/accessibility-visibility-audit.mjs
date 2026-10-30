import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const css = read('app/globals.css');
const publicLayout = read('app/(public)/layout.tsx');
const protectedLayout = read('app/(protected)/layout.tsx');
const authLayout = read('app/(auth)/layout.tsx');
const adminLayout = read('components/admin/AdminLayoutClient.tsx');
const skipLink = read('components/shared/a11y/SkipLink.tsx');
const publicHeader = read('components/layout/PublicHeader.tsx');
const mobileNav = read('components/layout/MobileNav.tsx');
const protectedSidebar = read('components/layout/ProtectedSidebar.tsx');
const adminSidebar = read('components/admin/AdminSidebar.tsx');
const bottomNav = read('components/layout/BottomNav.tsx');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const mobilePackage = JSON.parse(readFileSync(resolve(process.cwd(), '../apps/mobile/package.json'), 'utf8'));

const checks = [
  ['root skip link exists and targets the main content', skipLink.includes('href="#main-content"')],
  ['public pages expose a focusable main landmark', /<main id="main-content" tabIndex=\{-1\}/.test(publicLayout)],
  ['protected pages expose a focusable main landmark', /id="main-content"[\s\S]*?tabIndex=\{-1\}/.test(protectedLayout)],
  ['authentication pages expose a semantic main landmark', /<main id="main-content" tabIndex=\{-1\}/.test(authLayout)],
  ['admin pages expose a focusable main landmark', /<main id="main-content" tabIndex=\{-1\}/.test(adminLayout)],
  ['interactive controls have a 44px minimum target', /--touch-target:\s*44px/.test(css) && /button, \[role="button"\][\s\S]*?min-block-size:\s*var\(--touch-target\)/.test(css)],
  ['named icon actions have square minimum targets', /button\[aria-label\], a\[aria-label\]/.test(css) && /min-inline-size:\s*var\(--touch-target\)/.test(css)],
  ['mobile text controls remain at least 16px', /max-width:\s*640px[\s\S]*?font-size:\s*16px/.test(css)],
  ['keyboard focus remains visible', /:focus-visible[\s\S]*?outline:\s*2px solid/.test(css)],
  ['high-contrast forced-colors mode is supported', /@media \(forced-colors:\s*active\)/.test(css)],
  ['reduced-motion preferences are respected', /@media \(prefers-reduced-motion:\s*reduce\)/.test(css)],
  ['toast colors use semantic theme tokens instead of fixed white palette', /background:\s*hsl\(var\(--card\)\)/.test(css) && /color:\s*hsl\(var\(--muted-foreground\)\)/.test(css) && !/#(?:ffffff|2A241D|6B6459)/i.test(css.slice(css.indexOf('[data-sonner-toast]'), css.indexOf('/* PRIMARY-STRONG')))],
  ['toast actions and close controls use 44px targets', /market-toast button\[data-button\][\s\S]*?min-height:\s*44px/.test(css) && /market-toast \[data-close-button\][\s\S]*?width:\s*44px/.test(css)],
  ['public navigation has an accessible name', /aria-label="التنقل العام"/.test(publicHeader) && /aria-label=\{isMobileNavOpen \? 'أغلق القائمة' : 'افتح القائمة'\}/.test(mobileNav) && /aria-controls=\{NAV_ID\}/.test(mobileNav)],
  ['protected sidebar links and disclosure controls meet touch size', /min-h-11 items-center/.test(protectedSidebar) && /min-h-11 w-full/.test(protectedSidebar)],
  ['protected disclosure groups expose expanded state and their controlled panel', /aria-expanded=\{isOpen\}/.test(protectedSidebar) && /aria-controls=\{panelId\}/.test(protectedSidebar) && /id=\{panelId\} hidden=\{!isOpen\}/.test(protectedSidebar)],
  ['admin navigation is discoverable and touch-sized', /min-h-11/.test(adminSidebar) && /aria-label="بحث في قائمة الإدارة"/.test(adminSidebar) && /aria-controls="admin-navigation-dialog"/.test(adminSidebar)],
  ['mobile bottom navigation has a named landmark and meaningful active states', /aria-label="التنقل الرئيسي"/.test(bottomNav) && /aria-current=\{isActive \? 'page' : undefined\}/.test(bottomNav)],
  ['mobile accessibility regression script is callable', mobilePackage.scripts?.['verify:a11y'] === 'node ./scripts/verify-design-system-a11y.mjs'],
  ['web accessibility audit is registered in package scripts', packageJson.scripts?.['a11y:visibility-audit'] === 'node scripts/accessibility-visibility-audit.mjs'],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed += 1;
}
console.log(`\nAccessibility and discoverability contract: ${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
