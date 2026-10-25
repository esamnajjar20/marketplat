import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const mobile = path.join(root, 'apps/mobile');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const warnings = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

const rootPackage = readJson(path.join(root, 'package.json'));
const mobilePackage = readJson(path.join(mobile, 'package.json'));
const appConfig = readJson(path.join(mobile, 'app.json'));
const workspaceText = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
const authContext = fs.readFileSync(path.join(mobile, 'src/features/auth/AuthContext.tsx'), 'utf8');
const apiClient = fs.readFileSync(path.join(mobile, 'src/api/client.ts'), 'utf8');

check(rootPackage.packageManager === 'pnpm@10.18.0', 'Root packageManager must match the documented pnpm version.');
check(rootPackage.engines?.node === '>=22 <25', 'Root Node engine range must be explicit and compatible with Expo SDK 54.');
check(workspaceText.includes("- 'apps/*'") && workspaceText.includes("- 'packages/*'"), 'Workspace must include apps and shared packages.');
check(mobilePackage.name === '@marketplat/mobile', 'Mobile workspace package name is missing or unexpected.');
check(mobilePackage.main === 'expo-router/entry', 'Expo Router entry point is not configured.');
check(typeof mobilePackage.scripts?.['type-check'] === 'string' && mobilePackage.scripts['type-check'].includes('tsc --noEmit'), 'Mobile TypeScript check script is missing.');
check(mobilePackage.scripts?.test?.includes('verify-phase11.mjs'), 'Mobile test script must include the phase 11 verifier.');
check(appConfig.expo?.slug === 'marketplat-mobile' && appConfig.expo?.scheme === 'marketplat', 'Expo slug or deep-link scheme is missing.');
check(appConfig.expo?.android?.package === 'com.marketplat.mobile' && appConfig.expo?.ios?.bundleIdentifier === 'com.marketplat.mobile', 'Android/iOS application identifiers must be explicitly configured.');
check(fs.existsSync(path.join(mobile, 'app/_layout.tsx')), 'Expo Router root layout is missing.');
check(fs.existsSync(path.join(mobile, 'app/index.tsx')), 'Mobile landing route is missing.');
check(fs.existsSync(path.join(mobile, 'app/ads/[id].tsx')), 'Ad detail route is missing.');
check(authContext.includes('SecureStore.setItemAsync') && authContext.includes('SecureStore.deleteItemAsync'), 'Secure session persistence and cleanup paths are expected.');
check(authContext.includes('isRestoring') && authContext.includes('setIsRestoring(false)'), 'Startup session restoration must expose and end its loading state.');
check(authContext.includes('error.status === 401 || error.status === 403'), 'Unauthorized refresh cleanup must be present.');
check(apiClient.includes('AbortController') && apiClient.includes('DEFAULT_TIMEOUT_MS'), 'API transport timeout protection is missing.');
check(apiClient.includes("credentials: options.credentials ?? 'include'"), 'API transport cookie credentials default is missing.');

const lockfile = path.join(root, 'pnpm-lock.yaml');
if (!fs.existsSync(lockfile)) warnings.push('pnpm-lock.yaml is absent; dependency resolution is not reproducible yet.');
if (!fs.existsSync(path.join(root, 'node_modules'))) warnings.push('Root node_modules is absent; TypeScript/Expo runtime checks have not been run.');
if (!fs.existsSync(path.join(mobile, 'node_modules'))) warnings.push('Mobile node_modules is absent; no Metro or native build can be claimed.');
if (Number(process.versions.node.split('.')[0]) < 22 || Number(process.versions.node.split('.')[0]) >= 25) warnings.push(`Current Node ${process.versions.node} is outside the declared >=22 <25 range.`);

if (errors.length) {
  console.error('Phase 11 workspace readiness checks FAILED:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Phase 11 workspace readiness checks passed (static checks only).');
}
for (const warning of warnings) console.log(`ENVIRONMENT NOTE: ${warning}`);
console.log(`Node.js: ${process.versions.node}`);
console.log(`pnpm executable: ${process.env.PNPM_HOME ? 'PNPM_HOME configured' : 'not detected from environment'}`);
console.log('No network request, dependency installation, TypeScript compilation, Expo build, or device test is performed by this script.');
