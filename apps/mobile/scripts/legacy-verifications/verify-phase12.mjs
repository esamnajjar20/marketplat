import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const mobile = path.join(root, 'apps/mobile');
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const read = (relative) => fs.readFileSync(path.join(mobile, relative), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'));
const auth = read('src/features/auth/AuthContext.tsx');
const authApi = read('src/features/auth/auth.api.ts');
const client = read('src/api/client.ts');
const login = read('app/login.tsx');

check(packageJson.scripts?.test?.includes('verify-phase12.mjs'), 'Mobile test script must include the phase 12 verifier.');
check(auth.includes('Date.now() + seconds * 1000'), 'Session expiry must be derived from expiresIn.');
check(auth.includes('cached.expiresAt > Date.now()'), 'Only an unexpired cached access session may be restored for offline use.');
check(auth.includes('cached.expiresAt <= Date.now() || unauthorized'), 'Expired cached sessions and unauthorized refreshes must clear local credentials.');
check(auth.includes('If refresh failed because the device is offline, retain a still-valid secure access token.'), 'A transient refresh/network failure must not immediately erase a valid cached session.');
check(auth.includes('await clearPersisted();\n      setIsBusy(false);'), 'Logout must clear local credentials even if the server request fails.');
check(authApi.includes('refreshInFlight') && authApi.includes('performAccessRefresh().finally'), 'Refresh requests must be coalesced and the in-flight reference reset.');
check(!/refreshToken\s*[:=]/i.test(auth + authApi), 'Refresh token must not be read or stored in JavaScript session state.');
check(client.includes('AbortController') && client.includes('controller.abort()'), 'API requests must have timeout cancellation.');
check(client.includes("error.name === 'AbortError'"), 'Timeout errors must be distinguished from generic network failures.');
check(login.includes('accessibilityRole="alert"') && login.includes('disabled={isBusy}'), 'Login must announce errors and prevent duplicate submissions while busy.');
check(login.includes('type="password"') === false, 'Native password input must not use a web-only input type attribute.');

if (errors.length) {
  console.error('Phase 12 auth lifecycle contract checks FAILED:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Phase 12 auth lifecycle contract checks passed (static source checks only).');
}
console.log(`Node.js: ${process.versions.node}`);
console.log('This script does not test native cookie persistence, a live API, or an Android/iOS device.');
