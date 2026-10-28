import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [
  {
    name: 'analytics interval stops while hidden',
    pass: /function syncFlushTimer\(\)[\s\S]*?document\.visibilityState !== 'visible'[\s\S]*?stopFlushTimer\(\)/.test(read('lib/analytics.ts')),
  },
  {
    name: 'analytics interval stops when consent is absent',
    pass: /!hasAnalyticsConsent\(\) \|\| document\.visibilityState !== 'visible'/.test(read('lib/analytics.ts')),
  },
  {
    name: 'analytics timer is cleared and nulled',
    pass: /clearInterval\(flushTimer\);\s*flushTimer = null;/.test(read('lib/analytics.ts')),
  },
  {
    name: 'analytics lifecycle listeners are installed once',
    pass: /if \(typeof window === 'undefined' \|\| typeof document === 'undefined' \|\| flushLifecycleInstalled\) return;\s*flushLifecycleInstalled = true;/.test(read('lib/analytics.ts')),
  },
  {
    name: 'analytics flushes once when hidden',
    pass: /const onVisibilityChange = \(\) => \{\s*if \(document\.visibilityState === 'hidden'\) flush\(\);\s*syncFlushTimer\(\);/.test(read('lib/analytics.ts')),
  },
  {
    name: 'offline queue replay skips hidden tabs',
    pass: /const periodicId = window\.setInterval\(\(\) => \{[\s\S]*?navigator\.onLine[\s\S]*?document\.visibilityState === 'visible'[\s\S]*?replayThenPublishDrafts\(\)/.test(read('components/pwa/OfflineBootstrap.tsx')),
  },
  {
    name: 'service-worker periodic checks skip hidden tabs',
    pass: /const checkUpdate = \(\) => \{[\s\S]*?document\.visibilityState === 'hidden'\) return;/.test(read('lib/pwa.ts')),
  },
  {
    name: 'service-worker checks resume when visible',
    pass: /const onVisible = \(\) => \{\s*if \(document\.visibilityState === 'visible'\) checkUpdate\(\);/.test(read('lib/pwa.ts')),
  },
];

for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
const failed = checks.filter((check) => !check.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
