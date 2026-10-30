import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.cwd());
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const checks = [
  ['customer management screen', 'app/customers.tsx', ['fetchCustomers', 'fetchCustomerSummary', 'createCustomer', 'إضافة عميل جديد']],
  ['debts screen', 'app/debts.tsx', ['fetchDebtSummary', 'fetchDebts', '/sales/[id]', 'إجمالي المستحق']],
  ['installments screen', 'app/installments.tsx', ['fetchInstallments', 'payInstallment', 'تسجيل التحصيل']],
  ['activity screen', 'app/activity.tsx', ['fetchMyActivity', 'group', 'سجل النشاط']],
  ['sale details screen', 'app/sales/[id].tsx', ['fetchSaleDetail', 'fetchSaleReceipt', 'الدفعات المسجلة']],
  ['sale receipt screen', 'app/sales/[id]/receipt.tsx', ['fetchSaleReceipt', 'فاتورة بيع']],
  ['extra account APIs', 'src/features/sales/sales-extra.api.ts', ['/api/v1/customers', '/api/v1/activity', '/api/v1/sales/installments']],
];
let failed = 0;
for (const [label, file, fragments] of checks) {
  if (!existsSync(resolve(root, file))) { console.error(`FAIL ${label}: missing ${file}`); failed++; continue; }
  const content = read(file);
  const missing = fragments.filter((f) => !content.includes(f));
  if (missing.length) { console.error(`FAIL ${label}: missing ${missing.join(', ')}`); failed++; }
  else console.log(`PASS ${label}`);
}
const account = read('app/account.tsx');
const sales = read('app/my-sales.tsx');
for (const [label, content, paths] of [
  ['account hub navigation', account, ['/customers', '/debts', '/installments', '/activity']],
  ['sales navigation', sales, ['/customers', '/debts', '/installments', '/activity']],
]) {
  const missing = paths.filter((p) => !content.includes(p));
  if (missing.length) { console.error(`FAIL ${label}: missing ${missing.join(', ')}`); failed++; }
  else console.log(`PASS ${label}`);
}
if (failed) process.exit(1);
console.log('All remaining-account-pages static checks passed.');
