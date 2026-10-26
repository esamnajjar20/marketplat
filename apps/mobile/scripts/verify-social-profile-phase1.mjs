import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const files = [
  'app/profile/[id].tsx', 'app/profile/[id]/followers.tsx', 'app/profile/[id]/following.tsx',
  'app/blocked-users.tsx', 'app/report/[targetType]/[targetId].tsx', 'app/my-reports.tsx',
  'src/features/account/social.api.ts',
];
for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
const api = read('src/features/account/social.api.ts');
for (const route of ['/api/v1/users/', '/api/v1/follows/status/USER/', '/api/v1/follows/users/', '/api/v1/blocked-users', '/api/v1/reports/me']) assert.ok(api.includes(route), `missing API route ${route}`);
assert.ok(api.includes("targetType: 'USER'"), 'user follow uses USER target type');
assert.ok(api.includes("'SCAM' | 'FAKE' | 'OFFENSIVE' | 'SPAM'"), 'report reason union is defined');
const profile = read('app/profile/[id].tsx');
for (const route of ['/profile/[id]/followers', '/profile/[id]/following', '/report/[targetType]/[targetId]']) assert.ok(profile.includes(route), `profile missing navigation to ${route}`);
assert.ok(read('app/settings.tsx').includes("router.push('/blocked-users')"), 'settings links to blocked users');
assert.ok(read('app/settings.tsx').includes("router.push('/my-reports')"), 'settings links to reports');
assert.ok(read('app/ads/[id].tsx').includes('الإبلاغ عن الإعلان'), 'ad detail exposes report action');
assert.ok(read('app/products/[id].tsx').includes('الإبلاغ عن المنتج'), 'product detail exposes report action');
assert.ok(read('app/services/[id].tsx').includes('الإبلاغ عن الخدمة'), 'service detail exposes report action');
assert.ok(read('app/stores/[id].tsx').includes('الإبلاغ عن المتجر'), 'store detail exposes report action');
console.log('Social/profile phase 1 verification passed (14 checks).');
