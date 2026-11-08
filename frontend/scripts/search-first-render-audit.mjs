import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const component = readFileSync(new URL('../components/search/SearchResults.tsx', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../__tests__/components/search/SearchResults.test.tsx', import.meta.url), 'utf8');
const checks = [
  ['infinite search keeps previous data', /placeholderData:\s*keepPreviousData/.test(component)],
  ['placeholder state is exposed', /isPlaceholderData/.test(component)],
  ['pagination is paused for placeholder data', /items\.length > 0 && !isPlaceholderData/.test(component)],
  ['status component receives placeholder state', /isPlaceholderData=\{isPlaceholderData\}/.test(component)],
  ['regression test covers retained results', /keeps previous results visible/.test(tests)],
  ['regression test protects pagination', /Do not allow pagination from the previous filter set/.test(tests)],
];
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
assert.ok(checks.every(([, passed]) => passed), 'Search first-render audit failed');
console.log(`\n${checks.length}/${checks.length} checks passed`);
