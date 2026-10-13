import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const checks = [
  ['account actions can wrap on narrow screens', 'components/shared/account/AccountPageShell.tsx', /w-full min-w-0 flex-wrap[\s\S]*sm:w-auto/],
  ['legal navigation targets are at least 44px tall', 'components/shared/legal/LegalPageShell.tsx', /min-h-11 items-center/],
  ['legal navigation has a visible keyboard focus indicator', 'components/shared/legal/LegalPageShell.tsx', /focus-visible:ring-2 focus-visible:ring-primary/],
  ['legal navigation respects reduced-motion preferences', 'components/shared/legal/LegalPageShell.tsx', /motion-reduce:transition-none/],
  ['browse toolbars improve touch target sizing', 'components/shared/list/ListPageShell.tsx', /\[&_button\]:min-h-11/],
  ['browse toolbar links improve touch target sizing', 'components/shared/list/ListPageShell.tsx', /\[&_a\]:min-h-11/],
];
let failures = 0;
for (const [label, file, pattern] of checks) {
  const content = readFileSync(resolve(root, file), 'utf8');
  const passed = pattern.test(content);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures++;
}
console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
if (failures) process.exitCode = 1;
