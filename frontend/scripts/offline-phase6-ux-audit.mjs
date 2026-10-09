/** Dependency-free guardrails for honest, recoverable offline sync UX. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sync = read('components/settings/SyncCenterClient.tsx');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('queue replay is not reported as guaranteed completion', sync.includes("toast.message('تم طلب المزامنة'") && sync.includes('لا يعني هذا اكتمال كل الطلبات.') && !sync.includes("toast.success('تمت المزامنة'"));
check('storage read failures are visible instead of silently appearing as empty state', sync.includes('setLoadWarning(hadReadFailure)') && sync.includes('قد تكون الأعداد المعروضة غير مكتملة') && sync.includes('role="alert"'));
check('sync start and failure notices are accessible', sync.includes('setSyncNotice(\'تم طلب بدء المزامنة.') && sync.includes('setSyncNotice(\'تعذّر بدء المزامنة.') && sync.includes('aria-live="polite"'));
check('manual refresh remains available after a partial read failure', sync.includes('تحديث القائمة') && sync.includes('disabled={loading}'));
check('failed queue and draft states remain distinguishable', sync.includes('طلبات فاشلة') && sync.includes('تحتاج انتباهًا') && sync.includes('pending_sync'));

for (const item of checks) console.log(`[offline-phase6] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase6] PASS ${checks.length} checks`);
