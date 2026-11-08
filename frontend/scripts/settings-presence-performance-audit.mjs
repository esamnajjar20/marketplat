#!/usr/bin/env node
/**
 * SETTINGS-PRESENCE-PERF-01 — static regression checks for settings lazy
 * loading and the single-flight/pipelined presence heartbeat.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['settings page mounts one lazy tab hub', /<SettingsTabsHub\s*\/>/.test(read('components/settings/SettingsTabsHub.tsx')) === false
    && /renderTab=\{\(tab\) => <TabBody tab=\{tab\} \/>\}/.test(read('components/settings/SettingsTabsHub.tsx'))],
  ['blocked users query is isolated to its tab component', /useMyBlockedUsers\(\{ limit: 100 \}\)/.test(read('components/profile/BlockedUsersList.tsx'))],
  ['developer setting reads are shared and cached', /CACHE_TTL_MS = 5 \* 60_000/.test(read('lib/adminDeveloperToolsSetting.ts')) && /if \(inFlight\) return inFlight/.test(read('lib/adminDeveloperToolsSetting.ts'))],
  ['presence heartbeat prevents overlapping requests', /beatInFlight/.test(read('components/shared/PresenceHeartbeat.tsx'))],
  ['presence writes use one Redis pipeline', /redis\.pipeline\(\)/.test(read('../apps/api/src/shared/utils/presence.ts'))],
  ['presence tests cover the pipeline behavior', /pipelines a TTL-bound presence key/.test(read('../apps/api/tests/unit/presence.test.ts'))],
];
let failed = 0;
for (const [name, passed] of checks) {
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name}\n`);
  if (!passed) failed += 1;
}
process.stdout.write(`${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
