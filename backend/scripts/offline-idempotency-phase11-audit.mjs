import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const middleware = fs.readFileSync(path.join(backend, 'src/middlewares/offlineOperationId.middleware.ts'), 'utf8');
const unit = fs.readFileSync(path.join(backend, 'tests/unit/offlineOperationId.middleware.test.ts'), 'utf8');
const sales = fs.readFileSync(path.join(backend, 'tests/integration/sales.flow.test.ts'), 'utf8');
const schema = fs.readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8');
const checks = [
  ['operation ID has bounded length', /\{0,127\}/.test(middleware)],
  ['operation ID uses an explicit allowlist', /OFFLINE_OPERATION_ID_PATTERN/.test(middleware)],
  ['missing key remains optional for online requests', /raw === undefined/.test(middleware)],
  ['invalid key returns stable error code', /OFFLINE_OP_ID_INVALID/.test(middleware)],
  ['single-character boundary is tested', /\n\s*'a',/.test(unit)],
  ['128-character maximum boundary is tested', /'x'\.repeat\(128\)/.test(unit)],
  ['129-character overflow is tested', /'x'\.repeat\(129\)/.test(unit)],
  ['whitespace injection is tested', /bad\\theader/.test(unit) && /bad\\nheader/.test(unit)],
  ['comma-separated header injection is tested', /id,another-id/.test(unit)],
  ['path-like IDs are rejected by tests', /\/path-like-id/.test(unit)],
  ['non-ASCII IDs are rejected by tests', /عربي/.test(unit)],
  ['same-operation concurrent replay is integration-tested', /deduplicates concurrent retries of the same offline operation/.test(sales)],
  ['lost acknowledgement replay checks inventory and payment side effects', /replays a committed product sale without repeating inventory, payment, or customer side effects/.test(sales)],
  ['cross-account operation scope is integration-tested', /scopes identical offline operation ids to each authenticated seller/.test(sales)],
  ['database operation ID uniqueness constraints exist', /offlineOperationId\s+String\?\s+@unique/.test(schema) || /@@unique\(\[sellerId, offlineOperationId\]\)/.test(schema)],
];
let failed = 0;
for (const [label, ok] of checks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!ok) failed++;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
