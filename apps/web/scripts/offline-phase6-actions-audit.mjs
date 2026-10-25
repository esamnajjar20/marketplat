/** Guardrails for duplicate-action prevention and visible action failures. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'components/settings/SyncCenterClient.tsx'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = [
  ['per-action lock prevents duplicate taps', source.includes('const [busyActions, setBusyActions]') && source.includes('if (busyActions.has(key)) return;')],
  ['action lock always releases in finally', source.includes('finally {\n      setBusyActions((current) => {')],
  ['appointment retry button is disabled while running', source.includes('appointment:retry:${draft.id}') && source.includes('busyActions.has(`appointment:retry:${draft.id}`)')],
  ['appointment deletion reports storage errors', source.includes("toast.error('تعذّر حذف طلب الموعد المحفوظ')")],
  ['favorite intent discard is protected against duplicate taps', source.includes('favorite:discard:${intent.key}') && source.includes('busyActions.has(`favorite:discard:${intent.key}`)')],
  ['draft retry and deletion are disabled while running', source.includes('draft:retry:${d.id}') && source.includes('draft:delete:${d.id}') && source.includes('busyActions.has(`draft:retry:${d.id}`)')],
  ['failed queue retry and discard are guarded', source.includes('queue:retry:${item.id}') && source.includes('queue:discard:${item.id}') && source.includes('busyActions.has(`queue:retry:${item.id}`)') && source.includes('busyActions.has(`queue:discard:${item.id}`)')],
  ['sales retry/discard failures are caught and reported', source.includes('async function handleSalesAction') && source.includes("toast.error(action === 'retry' ? 'تعذّرت إعادة محاولة البيع' : 'تعذّر حذف مسودة البيع')")],
  ['sales controls prevent duplicate actions', source.includes('sales:${draft.operationId}:retry') && source.includes('sales:${draft.operationId}:discard')],
  ['audit is registered in package scripts', pkg.scripts['offline:phase6-actions-audit'] === 'node scripts/offline-phase6-actions-audit.mjs'],
];
for (const [name, ok] of checks) console.log(`[phase6-actions] ${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`[phase6-actions] PASS ${checks.length} checks`);
