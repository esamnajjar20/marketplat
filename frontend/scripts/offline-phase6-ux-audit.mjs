/** Dependency-free guardrails for honest, recoverable offline sync UX. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sync = read('components/settings/SyncCenterClient.tsx');
const warming = read('components/settings/OfflineControlClient.tsx');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('queue replay is not reported as guaranteed completion', sync.includes("toast.message('تم طلب المزامنة'") && sync.includes('لا يعني هذا اكتمال كل الطلبات.') && !sync.includes("toast.success('تمت المزامنة'"));
check('storage read failures are visible instead of silently appearing as empty state', sync.includes('setLoadWarning(hadReadFailure)') && sync.includes('قد تكون الأعداد المعروضة غير مكتملة') && sync.includes('role="alert"'));
check('sync start and failure notices are accessible', sync.includes('setSyncNotice(\'تم طلب بدء المزامنة.') && sync.includes('setSyncNotice(\'تعذّر بدء المزامنة.') && sync.includes('aria-live="polite"'));
check('manual refresh remains available after a partial read failure', sync.includes('تحديث القائمة') && sync.includes('disabled={loading}'));
check('failed queue and draft states remain distinguishable', sync.includes('طلبات فاشلة') && sync.includes('تحتاج انتباهًا') && sync.includes('pending_sync'));
check('connectivity test restores online mode in finally even after assertion failures', (() => {
  const test = read('e2e/tests/offline-connectivity.spec.ts');
  const offlineAt = test.indexOf('await context.setOffline(true)');
  const finallyAt = test.indexOf('} finally {', offlineAt);
  const restoreAt = test.indexOf('await context.setOffline(false)', finallyAt);
  const reconnectAssertionAt = test.indexOf("await expect(page.getByText('متصل', { exact: true })).toBeVisible", restoreAt);
  return offlineAt >= 0 && finallyAt > offlineAt && restoreAt > finallyAt && reconnectAssertionAt > restoreAt;
})());
check('warming actions read live browser connectivity at the action boundary', warming.includes('const isOnlineAtActionBoundary = () =>') && warming.includes("typeof navigator === 'undefined' ? online : navigator.onLine") && warming.includes('if (!isOnlineAtActionBoundary())'));
const hasBoundaryGuard = (signature) => {
  const start = warming.indexOf(signature);
  const nextFunction = warming.indexOf('\n  async function ', start + signature.length);
  const end = nextFunction < 0 ? warming.length : nextFunction;
  return start >= 0 && warming.slice(start, end).includes('if (!isOnlineAtActionBoundary())');
};
check('start, resume, and full reset all guard their network-dependent entry points', hasBoundaryGuard('async function handleStartNow()') && hasBoundaryGuard('async function handleResumeRemaining()') && hasBoundaryGuard('async function performFullReset()'));
check('resume and reset do not report pipeline success when the pipeline did not run', warming.includes('pipelineRan = await runWarmingPipelineLocal()') && warming.includes('if (!pipelineRan)'));
check('long cache-maintenance loops stop deleting routes after connectivity drops', (warming.match(/isWarmingCancelled\(\) \|\| !isOnlineAtActionBoundary\(\)/g) ?? []).length >= 2);
check('start action distinguishes a dropped connection from an already-running pipeline', warming.includes('انقطع الاتصال قبل بدء التسخين؛ لم يبدأ تجهيز الصفحات'));

for (const item of checks) console.log(`[offline-phase6] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase6] PASS ${checks.length} checks`);
