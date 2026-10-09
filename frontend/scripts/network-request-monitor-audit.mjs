import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const monitor = read('lib/networkRequestMonitor.ts');
const capture = read('components/debug/DeviceErrorCapture.tsx');
const panel = read('components/admin/AdminNetworkRequestsPanel.tsx');
const tabs = read('lib/adminHubTabs.ts');
const sidebar = read('components/admin/AdminSidebar.tsx');
const hub = read('components/admin/AdminTabsHub.tsx');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['fetch is intercepted', /window\.fetch\s*=\s*async/.test(monitor)],
  ['XMLHttpRequest is intercepted', /XMLHttpRequest\.prototype\.open/.test(monitor) && /XMLHttpRequest\.prototype\.send/.test(monitor)],
  ['request bodies and headers are not persisted', /headers, bodies,/.test(monitor) && /response payloads, cookies/.test(monitor)],
  ['query values are redacted', /\[redacted\]/.test(monitor) && /searchParams\.keys\(\)/.test(monitor)],
  ['journal is bounded', /MAX_REQUESTS\s*=\s*300/.test(monitor) && /slice\(0, MAX_REQUESTS\)/.test(monitor)],
  ['diagnostic monitor is installed', /installNetworkRequestMonitor\(\)/.test(capture)],
  ['panel has search and outcome filters', /setQuery/.test(panel) && /setOutcome/.test(panel)],
  ['panel can copy and export JSON', /clipboard\.writeText/.test(panel) && /application\/json/.test(panel)],
  ['panel can clear local records', /clearNetworkRequests\(\)/.test(panel)],
  ['admin tab is registered', /'network-requests'/.test(tabs)],
  ['sidebar links to request monitor', /label: 'طلبات الشبكة'/.test(sidebar)],
  ['admin hub renders request panel', /case 'network-requests':[\s\S]*AdminNetworkRequestsPanel/.test(hub)],
  ['audit command is registered', pkg.scripts['network:request-audit'] === 'node scripts/network-request-monitor-audit.mjs'],
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
console.log(`Network request monitor audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} audit checks failed`);
