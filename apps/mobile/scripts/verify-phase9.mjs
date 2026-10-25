import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const authApi = await read('src/features/auth/auth.api.ts');
const authContext = await read('src/features/auth/AuthContext.tsx');
const apiClient = await read('src/api/client.ts');
const mobilePackage = JSON.parse(await read('package.json'));
const login = await read('app/login.tsx');
const backendRoutes = await readFile(path.resolve(root, '../api/src/modules/auth/auth.routes.ts'), 'utf8');
const backendController = await readFile(path.resolve(root, '../api/src/modules/auth/auth.controller.ts'), 'utf8');

assert.match(backendRoutes, /authRouter\.post\('\/refresh', refreshRateLimit, authController\.refresh\)/);
assert.match(backendController, /getRefreshTokenFromCookie\(req\)/);
assert.match(backendController, /refreshToken deliberately stripped from the response body/);
assert.match(authApi, /\/api\/v1\/auth\/refresh/);
assert.match(authApi, /credentials: 'include'/);
assert.match(apiClient, /credentials: options\.credentials \?\? 'include'/);
assert.match(authContext, /expo-secure-store/);
assert.match(authContext, /SecureStore\.setItemAsync/);
assert.match(authContext, /SecureStore\.deleteItemAsync/);
assert.match(authContext, /refreshAccessSession\(\)/);
assert.match(authContext, /expiresAt/);
assert.doesNotMatch(authApi + authContext, /refreshToken\s*[:,=]/);
assert.equal(mobilePackage.dependencies['expo-secure-store'], '~15.0.7');
assert.match(login, /التخزين الآمن للجهاز/);

console.log('Phase 9 session persistence/refresh contract checks passed (static checks only; no live cookie test or native build performed).');
