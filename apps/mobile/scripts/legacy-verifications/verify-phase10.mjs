import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const authApi = await read('src/features/auth/auth.api.ts');
const authContext = await read('src/features/auth/AuthContext.tsx');
const backendRoutes = await readFile(path.resolve(root, '../api/src/modules/auth/auth.routes.ts'), 'utf8');
const backendController = await readFile(path.resolve(root, '../api/src/modules/auth/auth.controller.ts'), 'utf8');
const backendCookies = await readFile(path.resolve(root, '../api/src/shared/utils/authCookies.ts'), 'utf8');
const csrfMiddleware = await readFile(path.resolve(root, '../api/src/middlewares/csrf.middleware.ts'), 'utf8');
const packageJson = JSON.parse(await read('package.json'));

// Keep the mobile client aligned with the real backend's cookie-based refresh contract.
assert.match(backendRoutes, /authRouter\.post\('\/refresh', refreshRateLimit, authController\.refresh\)/);
assert.match(backendController, /getRefreshTokenFromCookie\(req\)/);
assert.match(backendController, /refreshToken deliberately stripped from the response body/);
assert.match(backendCookies, /httpOnly:\s*true/);
assert.match(backendCookies, /REFRESH_TOKEN_COOKIE_PATH\s*=\s*'\/api\/v1\/auth'/);
assert.match(csrfMiddleware, /'\/auth\/refresh'/, 'refresh must remain CSRF-exempt to allow session restoration after app restart');
assert.match(authApi, /credentials:\s*'include'/);
assert.match(authApi, /\/api\/v1\/auth\/refresh/);
assert.match(authApi, /refreshInFlight/);
assert.match(authApi, /refreshInFlight\s*=\s*performAccessRefresh\(\)\.finally/);
assert.match(authApi, /\/api\/v1\/auth\/logout/);
assert.match(authApi, /X-CSRF-Token/);
assert.doesNotMatch(authApi, /refreshToken\s*[:,=]/, 'mobile must never read or persist a refresh token value');
assert.match(authContext, /SecureStore\.setItemAsync/);
assert.match(authContext, /SecureStore\.deleteItemAsync/);
assert.match(authContext, /error\.status === 401 \|\| error\.status === 403/);
assert.match(authContext, /cached\.expiresAt <= Date\.now\(\)/);
assert.doesNotMatch(authContext, /refreshToken\s*[:,=]/);
assert.match(packageJson.scripts.test, /verify-phase10\.mjs/);

console.log('Phase 10 auth-session contract checks passed (static source checks only; no live cookie jar, device, TypeScript, or native build test performed).');
