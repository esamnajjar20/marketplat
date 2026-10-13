import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const spinner = read('components/shared/feedback/LoadingSpinner.tsx');
const emptyState = read('components/shared/feedback/EmptyState.tsx');
const pageLoading = read('components/shared/feedback/PageLoadingState.tsx');
const css = read('app/globals.css');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['spinner rotation respects reduced motion', /animate-spin motion-reduce:animate-none/.test(spinner)],
  ['spinner pulse respects reduced motion', /animate-pulse motion-reduce:animate-none/.test(spinner)],
  ['empty-state entrance respects reduced motion', /section-enter motion-reduce:animate-none/.test(emptyState)],
  ['page progress decoration is hidden from assistive technology', /aria-hidden="true"/.test(pageLoading)],
  ['global reduced-motion media query exists', /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)],
  ['global progress animation is disabled for reduced motion', /\.nav-progress-bar\s*\{[^}]*animation:\s*none\s*!important/s.test(css)],
  ['audit command is registered', pkg.scripts?.['ux:feedback-motion-audit'] === 'node scripts/feedback-motion-audit.mjs'],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
