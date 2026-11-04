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
  ['updates are no longer auto-applied on a timer or visibility change', !pwa.includes('scheduleAutoApply') && !pwa.includes('PWA_AUTO_APPLY_AFTER_MS')],
  ['the update UI is the sole explicit activation path', /export function activateWaitingServiceWorker[\s\S]{0,500}userRequestedUpdateActivation = true[\s\S]{0,500}postMessage\(\{ type: 'SKIP_WAITING' \}\)/.test(pwa)],
  ['stale activation compatibility entry point is a no-op', stale.includes('Intentionally empty') && !stale.includes('postMessage')],
  ['unit tests cover select focus', tests.includes("it.each(['input', 'textarea', 'select'])")],
  ['unit tests cover draft and text selection', tests.includes('explicitly marked draft') && tests.includes('selected text')],
];
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  assert.ok(pass, label);
}
console.log(`PASS ${checks.length}/${checks.length} SW update safety checks`);
