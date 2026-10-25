import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const checks = [
  ['offline action gate uses native inert interaction blocking', () => read('components/shared/OfflineActionGate.tsx').includes('inert={!online && disableWhenOffline}')],
  ['offline action gate retains accessible status notice', () => read('components/shared/OfflineActionGate.tsx').includes('role="status"')],
  ['offline lifecycle browser test exists', () => existsSync(resolve(root, 'e2e/tests/offline-connectivity.spec.ts'))],
  ['browser test exercises offline transition', () => read('e2e/tests/offline-connectivity.spec.ts').includes('context.setOffline(true)')],
  ['browser test exercises reconnect transition', () => read('e2e/tests/offline-connectivity.spec.ts').includes('context.setOffline(false)')],
  ['unit test checks keyboard-safe interaction gate', () => read('__tests__/components/OfflineActionGate.test.tsx').includes("closest('[inert]')")],
  ['package script exposes phase audit', () => read('package.json').includes('offline:ux-phases-5-6-audit')],
];
let failed = 0;
for (const [name, run] of checks) {
  let ok = false;
  try { ok = Boolean(run()); } catch { ok = false; }
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}\n`);
  if (!ok) failed++;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
