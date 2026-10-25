import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const authApi = await read('src/features/auth/auth.api.ts');
const authContext = await read('src/features/auth/AuthContext.tsx');
const login = await read('app/login.tsx');
const layout = await read('app/_layout.tsx');
const home = await read('app/index.tsx');
const backendRoutes = await readFile(path.resolve(root, '../api/src/modules/auth/auth.routes.ts'), 'utf8');
const backendController = await readFile(path.resolve(root, '../api/src/modules/auth/auth.controller.ts'), 'utf8');

assert.match(backendRoutes, /authRouter\.post\('\/login', authRateLimit, authController\.login\)/);
assert.match(backendRoutes, /authRouter\.post\('\/logout', authenticate, authController\.logout\)/);
assert.match(authApi, /\/api\/v1\/auth\/login/);
assert.match(authApi, /\/api\/v1\/auth\/logout/);
assert.match(backendController, /refreshToken deliberately stripped from the response body/);
assert.match(authApi, /accessToken/);
assert.doesNotMatch(authApi, /data\?\.tokens\?\.refreshToken|localStorage|AsyncStorage|SecureStore/);
assert.match(authApi, /X-CSRF-Token/);
assert.match(authContext, /setAccessToken\(null\)/);
assert.match(authContext, /setUser\(null\)/);
assert.match(layout, /<AuthProvider>/);
assert.match(login, /secureTextEntry/);
assert.match(login, /router\.replace\('\/'\)/);
assert.match(home, /router\.push\('\/login'\)/);
assert.match(home, /logout\(\)/);

console.log('Phase 8 authentication contract checks passed (static checks only; no live authentication or native build performed).');
