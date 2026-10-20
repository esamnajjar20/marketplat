import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const helper = read('../lib/swUpdateSafety.ts');
const pwa = read('../lib/pwa.ts');
const stale = read('../lib/swStaleActivation.ts');
const tests = read('../__tests__/unit/lib/swUpdateSafety.test.ts');
const checks = [
  ['shared safety predicate covers input, textarea, select and contenteditable', /tag === 'INPUT'.*tag === 'TEXTAREA'.*tag === 'SELECT'.*active\.isContentEditable/s.test(helper)],
  ['shared safety predicate defers open drafts', helper.includes('[data-draft-open="true"]')],
  ['shared safety predicate defers selected text', helper.includes('selection.toString().length > 0')],
  ['unknown editing state fails safe', /catch\s*\{[\s\S]*return true/.test(helper)],
  ['normal auto-apply uses shared predicate', pwa.includes('isUserBusyForServiceWorkerUpdate()')],
  ['stale activation uses same shared predicate', stale.includes('isUserBusyForServiceWorkerUpdate()')],
  ['stale activation still refuses while offline', /navigator\.onLine === false\) return/.test(stale)],
  ['auto-apply still cancels when connection drops', pwa.includes("window.addEventListener('offline', onOfflineLost")],
  ['unit tests cover select focus', tests.includes("it.each(['input', 'textarea', 'select'])")],
  ['unit tests cover draft and text selection', tests.includes('explicitly marked draft') && tests.includes('selected text')],
];
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  assert.ok(pass, label);
}
console.log(`PASS ${checks.length}/${checks.length} SW update safety checks`);
