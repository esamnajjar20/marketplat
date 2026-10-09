import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const files = {
  monitor: readFileSync(resolve(root, 'lib/deviceErrorMonitor.ts'), 'utf8'),
  panel: readFileSync(resolve(root, 'components/admin/AdminDeviceErrorsPanel.tsx'), 'utf8'),
  layout: readFileSync(resolve(root, 'app/layout.tsx'), 'utf8'),
  capture: readFileSync(resolve(root, 'components/debug/DeviceErrorCapture.tsx'), 'utf8'),
  tabs: readFileSync(resolve(root, 'lib/adminHubTabs.ts'), 'utf8'),
  sidebar: readFileSync(resolve(root, 'components/admin/AdminSidebar.tsx'), 'utf8'),
  hub: readFileSync(resolve(root, 'components/admin/AdminTabsHub.tsx'), 'utf8'),
};
const checks = [
  ['global runtime error capture', /addEventListener\('error'/.test(files.monitor)],
  ['unhandled promise capture', /unhandledrejection/.test(files.monitor)],
  ['console error capture', /console\.error\s*=/.test(files.monitor)],
  ['network failures and HTTP 5xx capture', /network-request/.test(files.monitor) && /response\.status >= 500/.test(files.monitor)],
  ['resource failures and connectivity capture', /resource-load/.test(files.monitor) && /addEventListener\('offline'/.test(files.monitor)],
  ['device-local storage only, no remote endpoint', /localStorage\.setItem\(DEVICE_ERRORS_KEY/.test(files.monitor) && !/fetch\(['"]https?:/.test(files.monitor)],
  ['bounded journal and deduplication', /MAX_RECORDS = 300/.test(files.monitor) && /DEDUPE_MS/.test(files.monitor)],
  ['basic secret redaction before storage', /function redactSensitive/.test(files.monitor) && /\[REDACTED\]/.test(files.monitor)],
  ['admin-only tab added', /'device-errors'/.test(files.tabs) && /device-errors/.test(files.sidebar)],
  ['admin UI includes search, filters and report export', /placeholder="ابحث/.test(files.panel) && /downloadReport/.test(files.panel) && /clearAll/.test(files.panel)],
  ['collector mounted in client bundle at root layout', /DeviceErrorCapture/.test(files.layout) && /deviceErrorMonitor/.test(files.capture)],
  ['admin tab renders diagnostic panel', /case 'device-errors'/.test(files.hub) && /AdminDeviceErrorsPanel/.test(files.hub)],
];
let failed = 0;
for (const [label, passed] of checks) { console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); if (!passed) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
