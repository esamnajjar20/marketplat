import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const read = (path) => { const full = resolve(root, path); assert.ok(existsSync(full), `Missing target: ${path}`); return readFileSync(full, 'utf8'); };
const home = read('app/index.tsx');
assert.ok(home.includes('requestSequence === adsRequestSequence.current') && home.includes('تعذر تحميل المزيد من الإعلانات.'), 'Home pagination stale failures must be ignored');
assert.ok(home.includes('if (requestSequence === adsRequestSequence.current) setLoadingMore(false)'), 'Stale pagination finalizers must not mutate current loading state');
const requests = read('app/service-requests.tsx');
assert.ok(requests.includes("{accessToken ? 'إعادة المحاولة' : 'تسجيل الدخول'}"), 'Service request recovery action label must match its action');
assert.ok(requests.includes('requestSequence.current += 1'), 'Service request screen must invalidate requests on cleanup');
for (const path of ['app/stores.tsx', 'app/products.tsx', 'app/notifications.tsx', 'app/messages/[id].tsx']) {
  const source = read(path);
  assert.ok(source.includes('requestSequence') || source.includes('loadSequence'), `${path} must protect against stale async results`);
  assert.ok(/current\s*\+=\s*1/.test(source), `${path} must invalidate pending requests on cleanup`);
}
console.log('Phase 6 static verification passed (stale-request guards, screen cleanup, and service-request recovery label).');
