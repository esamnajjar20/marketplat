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
  ['auth headers, bodies and arbitrary payloads are not persisted', /never records auth headers, bodies, cookies/.test(monitor) && /arbitrary response/.test(monitor) && /payloads, or raw query values/.test(monitor)],
  ['query values are redacted', /\[redacted\]/.test(monitor) && /searchParams\.keys\(\)/.test(monitor)],
  ['journal is bounded', /MAX_REQUESTS\s*=\s*300/.test(monitor) && /slice\(0, MAX_REQUESTS\)/.test(monitor)],
  ['diagnostic monitor is installed', /installNetworkRequestMonitor\(\)/.test(capture)],
  ['panel has search and outcome filters', /setQuery/.test(panel) && /setOutcome/.test(panel)],
  ['panel can copy and export JSON', /clipboard\.writeText/.test(panel) && /application\/json/.test(panel)],
  ['panel can clear local records', /clearNetworkRequests\(\)/.test(panel)],
  ['legacy network-request tab resolves to unified monitoring center', /requested === 'console' \|\| requested === 'network-requests' \|\| requested === 'device-errors' \|\| requested === 'system'/.test(tabs) && /return 'monitoring'/.test(tabs)],
  ['sidebar exposes the unified monitoring destination', /label: 'المراقبة والتشخيص'/.test(sidebar)],
  ['unified monitoring center renders request panel', /case 'monitoring':[\s\S]*AdminMonitoringCenter/.test(hub) && /AdminNetworkRequestsPanel/.test(read('components/admin/AdminMonitoringCenter.tsx'))],
  ['validated server Request ID is captured for fetch and XHR', /safeRequestId\(response\.headers\.get\('X-Request-Id'\)\)/.test(monitor) && /safeRequestId\(this\.getResponseHeader\('X-Request-Id'\)\)/.test(monitor)],
  ['Content-Length is parsed safely for fetch and XHR', /parseContentLengthHeader\(response\.headers\.get\('Content-Length'\)\)/.test(monitor) && /parseContentLengthHeader\(this\.getResponseHeader\('Content-Length'\)\)/.test(monitor) && /Number\.isSafeInteger\(bytes\)/.test(monitor)],
  ['X-Cache is captured only from an allow-list', /safeCacheStatus\(response\.headers\.get\('X-Cache'\)\)/.test(monitor) && /safeCacheStatus\(this\.getResponseHeader\('X-Cache'\)\)/.test(monitor) && /normalized === 'HIT'.*normalized === 'BYPASS'/s.test(monitor)],
  ['route summary keeps unknown payload sizes separate and counts concurrent duplicate reads', /summarizeNetworkRequestsByRoute/.test(monitor) && /sizedResponseCount/.test(monitor) && /concurrentDuplicateCount/.test(monitor) && /Number\.isSafeInteger\(row\.responseBytes\)/.test(monitor)],
  ['route summaries expose cache hit rate and p95 latency', /cacheHitRate/.test(monitor) && /p95DurationMs/.test(monitor) && /cacheEligibleCount/.test(monitor)],
  ['duplicate tracking is memory-only and excludes unsafe methods', /SAFE_READ_METHODS = new Set\(\['GET', 'HEAD', 'OPTIONS'\]\)/.test(monitor) && /createConcurrentReadTracker/.test(monitor) && /activeTickets\.delete\(ticket\)/.test(monitor) && /concurrentReadTracker\.begin/.test(monitor) && /concurrentDuplicate: trackedRead\.duplicate/.test(monitor) && /typeof row\.concurrentDuplicate === 'boolean' \? row\.concurrentDuplicate : undefined/.test(monitor)],
  ['network panel exposes per-route counts, duplicate reads and Content-Length coverage', /ملخص الطلبات حسب الصفحة/.test(panel) && /حجم الاستجابات المعروف/.test(panel) && /قراءات متطابقة متزامنة/.test(panel) && /Content-Length/.test(panel)],
  ['network details display only the validated Request ID, size and allow-listed cache status', /selected\.requestId \?\? 'غير متاح من الخادم'/.test(panel) && /selected\.responseBytes/.test(panel) && /selected\.cacheStatus/.test(panel) && /selected\.concurrentDuplicate/.test(panel)],
  ['audit command is registered', pkg.scripts['network:request-audit'] === 'node scripts/network-request-monitor-audit.mjs'],
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
console.log(`Network request monitor audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} audit checks failed`);
