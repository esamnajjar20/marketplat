import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

const test = read('tests/integration/sales.flow.test.ts');
const service = read('src/modules/sales/sales.service.ts');
const schema = read('prisma/schema.prisma');
const docs = read('docs/OFFLINE_IDEMPOTENCY_AUDIT.md');

check('integration test covers simultaneous duplicate retries', /deduplicates concurrent retries of the same offline operation/.test(test) && /Promise\.all\(\[send\(\), send\(\)\]\)/.test(test));
check('concurrent test asserts one sale row', /saleRecord\.count\(\{ where: \{ sellerId: user\.id, offlineOperationId: op \} \}\)\)\.toBe\(1\)/.test(test));
check('concurrent test asserts stable returned sale id', /first\.body\.data\.id\)\.toBe\(second\.body\.data\.id\)/.test(test));
check('integration test covers committed sale replay after a lost acknowledgement', /replays a committed product sale without repeating inventory, payment, or customer side effects/.test(test));
check('replay test asserts inventory is decremented once', /expect\(freshProduct\.stockQuantity\)\.toBe\(8\)/.test(test));
check('replay test asserts customer totals and payment are not duplicated', /expect\(customer\.purchaseCount\)\.toBe\(1\)/.test(test) && /salePayment\.count\(\{ where: \{ saleId: first\.body\.data\.id \} \}\)\)\.toBe\(1\)/.test(test));
check('integration test covers same key across two accounts', /scopes identical offline operation ids to each authenticated seller/.test(test));
check('sales lookup is scoped to authenticated seller', /where: \{ sellerId: userId, offlineOperationId \}/.test(service));
check('database enforces per-seller uniqueness', /@@unique\(\[sellerId, offlineOperationId\]\)/.test(schema));
check('documentation distinguishes static audit from live integration testing', /not a substitute for running the Jest integration suite/i.test(docs));

for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`Result: ${checks.filter(x => x.pass).length}/${checks.length} passed`);
if (checks.some(x => !x.pass)) process.exitCode = 1;
