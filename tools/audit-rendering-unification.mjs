import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];
const report = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function check(condition, message) {
  if (!condition) failures.push(message);
  else report.push(message);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

// Next.js 15 exposes React Compiler through experimental.reactCompiler.
const nextConfig = read('frontend/next.config.ts');
check(/experimental\s*:\s*\{[\s\S]*?reactCompiler\s*:\s*\{\s*panicThreshold\s*:\s*['"]NONE['"]\s*\}/.test(nextConfig),
  'Next.js enables React Compiler and skips non-compatible components instead of failing the build.');

const frontendPackage = JSON.parse(read('frontend/package.json'));
const frontendLock = JSON.parse(read('frontend/package-lock.json'));
check(frontendPackage.devDependencies?.['babel-plugin-react-compiler'] === '1.0.0',
  'Frontend declares babel-plugin-react-compiler@1.0.0.');
check(frontendLock.packages?.['']?.devDependencies?.['babel-plugin-react-compiler'] === '1.0.0'
  && frontendLock.packages?.['node_modules/babel-plugin-react-compiler']?.version === '1.0.0',
  'Frontend npm lockfile contains the exact React Compiler dependency.');

const mobileConfig = JSON.parse(read('apps/mobile/app.json'));
const mobilePackage = JSON.parse(read('apps/mobile/package.json'));
const pnpmLock = read('pnpm-lock.yaml');
check(mobileConfig.expo?.experiments?.reactCompiler === true,
  'Expo enables the React Compiler experiment.');
check(mobilePackage.devDependencies?.['babel-plugin-react-compiler'] === '1.0.0',
  'Mobile declares babel-plugin-react-compiler@1.0.0 explicitly.');
const mobileImporter = pnpmLock.split('  apps/mobile:\n')[1]?.split('\n  packages/')[0] ?? '';
check(/babel-plugin-react-compiler:\n\s+specifier: 1\.0\.0\n\s+version: 1\.0\.0/.test(mobileImporter),
  'pnpm lockfile pins the mobile React Compiler package.');

const authPath = 'apps/mobile/src/features/auth/AuthContext.tsx';
const authSource = read(authPath);
const authHookContexts = {
  useAuthUser: 'AuthIdentityContext',
  useAuthSession: 'AuthSessionContext',
  useAuthStatus: 'AuthStatusContext',
  useAuthActions: 'AuthActionsContext',
};
for (const [hook, contextName] of Object.entries(authHookContexts)) {
  check(new RegExp(`export function ${hook}\\(`).test(authSource), `${hook} is exported as a granular auth subscription.`);
  check(new RegExp(`${contextName}\\.Provider`).test(authSource), `${hook} subscribes to the isolated ${contextName}.`);
}
check(/export function useAuth\(\): AuthState/.test(authSource),
  'The aggregate useAuth hook remains available for backwards compatibility.');
check(/const ownerId = userRef\.current\?\.id/.test(authSource),
  'Logout reads the current account through a stable ref instead of capturing user state.');
check(!/ReturnType<typeof useAuth>/.test(read('apps/mobile/app/index.tsx')),
  'Home screen types use the granular auth hook instead of the aggregate hook.');

const mobileSources = [
  ...walk(path.join(root, 'apps/mobile/app')),
  ...walk(path.join(root, 'apps/mobile/src')),
];
let remainingLegacyCalls = [];
let granularCallCount = 0;
for (const file of mobileSources) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const source = fs.readFileSync(file, 'utf8');
  if (relative !== authPath && /\buseAuth\s*\(/.test(source)) remainingLegacyCalls.push(relative);
  granularCallCount += (source.match(/\buseAuth(?:User|Session|Status|Actions)\s*\(/g) ?? []).length;
}
check(remainingLegacyCalls.length === 0,
  remainingLegacyCalls.length === 0
    ? 'All mobile consumers use granular auth hooks; legacy aggregate calls remain only inside AuthContext.'
    : `Legacy useAuth consumers remain: ${remainingLegacyCalls.join(', ')}`);
check(granularCallCount >= 90, `Granular mobile auth subscriptions are present (${granularCallCount} hook calls).`);

console.log(`Rendering unification audit: ${failures.length ? 'FAILED' : 'PASSED'}`);
for (const line of report) console.log(`✓ ${line}`);
if (failures.length) {
  for (const line of failures) console.error(`✗ ${line}`);
  process.exitCode = 1;
}
