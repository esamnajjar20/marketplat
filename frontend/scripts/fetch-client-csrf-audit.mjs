import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../lib/fetchClient.ts', import.meta.url), 'utf8');
const test = readFileSync(new URL('../__tests__/unit/lib/fetchClient.test.ts', import.meta.url), 'utf8');
const checks = [
  ['fetchClient uses the shared CSRF token getter', /import\s+\{\s*getCsrfToken\s*\}\s+from\s+'@\/lib\/csrf'/.test(source)],
  ['fetchClient reads the in-memory access token', /import\s+\{\s*useAuthStore\s*\}\s+from\s+'@\/store\/auth\.store'/.test(source)],
  ['Bearer Authorization is attached from the active session', /headers\.set\('Authorization',\s*`Bearer \$\{accessToken\}`\)/.test(source)],
  ['legacy mismatched csrf_token cookie parser is absent', !/csrf_token=/.test(source)],
  ['unsafe HTTP methods are identified centrally', /!\['GET',\s*'HEAD',\s*'OPTIONS'\]\.includes\(method\)/.test(source)],
  ['CSRF header is attached before mutation requests', /headers\.set\('X-CSRF-Token',\s*csrf\)/.test(source)],
  ['401 retry delegates to the canonical refresh coordinator', /import\('@\/api\/client'\)[\s\S]*refreshSessionShared/.test(source) && !/api\/auth\/refresh/.test(source)],
  ['push subscription POST has CSRF and Bearer regression tests', /fetchClient\.post\('\/api\/v1\/notifications\/push-subscriptions'/.test(test) && /X-CSRF-Token/.test(test) && /Authorization/.test(test)],
];
let failed = 0;
for (const [label, pass] of checks) {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!pass) failed += 1;
}
process.stdout.write(`\nFetch client CSRF audit: ${checks.length - failed}/${checks.length} passed\n`);
if (failed) process.exitCode = 1;
