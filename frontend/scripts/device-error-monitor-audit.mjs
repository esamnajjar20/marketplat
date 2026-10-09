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
  ['global runtime and resource error capture', /addEventListener\('error'/.test(files.monitor) && /resource-load/.test(files.monitor)],
  ['unhandled promise rejection capture', /unhandledrejection/.test(files.monitor)],
  ['console error/warning and opt-in debug capture', /console\.error\s*=/.test(files.monitor) && /console\.warn\s*=/.test(files.monitor) && /isReproduceMode\(\)/.test(files.monitor)],
  ['HTTP 5xx and failed network request capture', /network-request/.test(files.monitor) && /response\.status >= 500/.test(files.monitor)],
  ['bounded breadcrumbs include navigation, clicks, API and storage', /MAX_BREADCRUMBS = 20/.test(files.monitor) && /addBreadcrumb\('navigation'/.test(files.monitor) && /addBreadcrumb\('click'/.test(files.monitor) && /addBreadcrumb\('api'/.test(files.monitor) && /addBreadcrumb\('storage'/.test(files.monitor)],
  ['IndexedDB journal and localStorage fallback', /indexedDB\.open/.test(files.monitor) && /LOCALSTORAGE_MIRROR_RECORDS/.test(files.monitor) && /getDeviceErrorsAsync/.test(files.monitor)],
  ['cross-tab synchronization', /BroadcastChannel/.test(files.monitor) && /DEVICE_ERRORS_CHANNEL/.test(files.monitor)],
  ['performance snapshot attached to records', /performanceSnapshot\(\)/.test(files.monitor) && /longTasksLast5s/.test(files.monitor)],
  ['safe redaction and no response body capture', /function redactSensitive/.test(files.monitor) && /\[REDACTED\]/.test(files.monitor) && !/response\.text\(\)|response\.json\(\)/.test(files.monitor)],
  ['reproduce mode is opt-in and bounded', /MAX_REPRODUCE_RECORDS = 5000/.test(files.monitor) && /setReproduceMode/.test(files.monitor) && /reproductionMode/.test(files.monitor)],
  ['panel includes grouping, route filters and timeline', /تجميع المتكرر/.test(files.panel) && /HTTP 5xx/.test(files.panel) && /الخط الزمني/.test(files.panel)],
  ['copy report and JSON export include diagnostic data', /navigator\.clipboard\.writeText/.test(files.panel) && /downloadReport/.test(files.panel) && /breadcrumbs/.test(files.panel)],
  ['admin-only tab added', /'device-errors'/.test(files.tabs) && /device-errors/.test(files.sidebar)],
  ['collector mounted in client bundle at root layout', /DeviceErrorCapture/.test(files.layout) && /deviceErrorMonitor/.test(files.capture)],
  ['admin tab renders diagnostic panel', /case 'device-errors'/.test(files.hub) && /AdminDeviceErrorsPanel/.test(files.hub)],
];
let failed = 0;
for (const [label, passed] of checks) { console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); if (!passed) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
