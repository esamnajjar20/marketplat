import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');

test('offline inventory reflects the repaired query-cache policy without stale findings', () => {
  const output = execFileSync(process.execPath, [path.join(frontendRoot, 'scripts/offline-system-inventory.mjs')], { encoding: 'utf8' });
  assert.match(output, /0 findings/);
  assert.doesNotMatch(output, /CACHE-03: Offline query persistence relies on broad public prefixes/);
  assert.doesNotMatch(output, /AUDIT-01: Static audit expectations drift from implementation/);
});

test('phase 1 inventory document records scope, limitations, and no-auto-delete rule', () => {
  const report = fs.readFileSync(path.join(repoRoot, 'OFFLINE_SYSTEM_PHASE1_INVENTORY.md'), 'utf8');
  assert.match(report, /Inventory by responsibility/);
  assert.match(report, /zero-static-import candidates/i);
  assert.match(report, /Import counts are not a safe basis for deleting code/);
  assert.match(report, /does not prove runtime behavior/i);
});

test('phase 1 audit command is available in frontend package scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['offline:phase1-audit'], 'node scripts/offline-system-inventory.mjs --write && node --test scripts/offline-phase1-guardrails.test.mjs');
});
