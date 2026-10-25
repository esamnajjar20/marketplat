import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const tailwind = readFileSync(path.join(root, 'tailwind.config.ts'), 'utf8');
const required = [
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5',
  '--space-6', '--space-8', '--space-10', '--space-12', '--space-16',
  '--radius-control', '--radius-card', '--radius-shell', '--radius-modal', '--radius-hero',
  '--elevation-1', '--elevation-2', '--elevation-3', '--elevation-4',
];
let failures = 0;
const check = (condition, label) => {
  if (condition) console.log(`✓ ${label}`);
  else { failures += 1; console.error(`✗ ${label}`); }
};

for (const token of required) {
  check(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(css), `${token} is declared in globals.css`);
}

const themeTokens = [...tailwind.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
const missing = [...new Set(themeTokens)].filter((token) => !new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(css) && token !== '--radix-accordion-content-height');
check(missing.length === 0, missing.length ? `Tailwind token references resolve: missing ${missing.join(', ')}` : 'All Tailwind CSS variable references resolve to declarations');
check(css.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced-motion support remains present');
check(css.includes('--touch-target: 44px'), 'Minimum touch-target token remains 44px');
check(css.includes('.dark {') && css.includes('--shadow-lg:'), 'Dark theme and elevation shadow foundation remain present');

console.log(`\nDesign-system token contract: ${required.length + 4 - failures}/${required.length + 4} checks passed.`);
if (failures) process.exitCode = 1;
