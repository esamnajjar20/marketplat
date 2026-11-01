import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [
  ['pending logout marker is stored in SecureStore', read('src/features/auth/session-storage.ts').includes('PENDING_LOGOUT_KEY') && read('src/features/auth/session-storage.ts').includes('writePendingLogout')],
  ['restore retries pending server revocation before session refresh', (() => {
    const auth = read('src/features/auth/AuthContext.tsx');
    const helper = read('src/features/auth/pending-logout.ts');
    return auth.indexOf('pendingLogout = await readPendingLogout()') < auth.indexOf('await revokePendingLogout(pendingLogout)')
      && auth.indexOf('await revokePendingLogout(pendingLogout)') < auth.indexOf('await refreshAccessSession()')
      && helper.includes('isLogoutAuthRejection(error)')
      && helper.includes('isTerminalRefreshRejection(error)')
      && helper.includes('error.status === 401')
      && helper.includes('operations.refreshAccessSession()')
      && helper.includes('operations.logoutSession(refreshed.accessToken, refreshed.csrfToken)')
      && read('src/api/client.ts').includes('refreshError.status === 401');
  })()],
  ['login and registration are blocked until pending logout is confirmed', (read('src/features/auth/AuthContext.tsx').match(/await ensureNoPendingLogout\(\)/g) ?? []).length >= 2],
  ['logout writes revocation marker before network request', (() => {
    const logout = read('src/features/auth/AuthContext.tsx').split('const logout = useCallback', 2)[1] ?? '';
    return logout.indexOf('await writePendingLogout({ accessToken: token') >= 0
      && logout.indexOf('await writePendingLogout({ accessToken: token') < logout.indexOf('await revokePendingLogout({');
  })()],
  ['outbox upload timeout scales with measured image bytes', read('src/storage/entity-create-outbox.ts').includes('totalImageBytes += info.size') && read('src/storage/entity-create-outbox.ts').includes('Math.ceil(totalImageBytes / (1024 * 1024))')],
  ['public statistics no longer return ownerUserId', !read('../../apps/api/src/modules/sales/public-stats.controller.ts').includes('ownerUserId:')],
  ['public statistics exclude fully refunded sales but retain partial and zero-value sales', read('../../apps/api/src/modules/sales/public-stats.controller.ts').includes('"refundedAmount" < "totalPrice" OR ("totalPrice" = 0 AND "refundedAmount" = 0)')],
  ['my services now requests pages and preserves existing rows when loading more fails', read('app/my-services.tsx').includes('fetchMyServiceListingsPage') && read('app/my-services.tsx').includes('setMoreError') && read('src/features/services/services.api.ts').includes('fetchMyServiceListingsPage')],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
console.log(`Round-five follow-up: ${checks.length - failed}/${checks.length}`);
if (failed) process.exitCode = 1;
