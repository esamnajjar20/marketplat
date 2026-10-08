/**
 * Final static guardrail for the warming subsystem.
 * No dependencies: safe to run in CI before installing browser tooling.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => { console.error(`[warming-audit] FAIL: ${message}`); process.exitCode = 1; };
const pass = (message) => console.log(`[warming-audit] OK: ${message}`);

const required = [
  'lib/warmingRegistry.ts', 'lib/warmingBudget.ts', 'lib/warmingRuntimeBudget.ts',
  'lib/warmingEngine.ts', 'lib/warmingQueryContract.ts', 'lib/warmingManifest.ts',
  'lib/warmingTelemetry.ts', 'lib/offlineWarmingPipeline.ts',
  'lib/offlineWarmingPlanner.ts', 'lib/offlineCoreBundle.ts',
  'lib/offlineRouteShells.ts', 'lib/offlineWarmingUserData.ts',
  'scripts/generate-warming-manifest.mjs',
];
for (const file of required) {
  if (fs.existsSync(path.join(root, file))) pass(`required file: ${file}`);
  else fail(`missing required file: ${file}`);
}

const routes = read('lib/offlineRouteShells.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
for (const name of ['CORE_ROUTES', 'PERSONAL_SHELL_ROUTES_ESSENTIAL']) {
  const match = routes.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`));
  if (!match) { fail(`cannot parse ${name}`); continue; }
  const values = [...match[1].matchAll(/['"](\/[^'"]+)['"]/g)].map((m) => m[1]);
  if (new Set(values).size !== values.length) fail(`${name} contains duplicate routes`);
  if (values.some((v) => v === '/admin' || v.startsWith('/admin/'))) fail(`${name} contains an admin route`);
  else pass(`${name}: ${values.length} routes, no admin routes`);
}

const contract = read('lib/warmingQueryContract.ts');
if ((contract.match(/consumer: 'react-query'/g) ?? []).length === 0) fail('query contract has no React Query entries');
if (contract.includes("id: 'product-categories'")) fail('product-categories is duplicated in user warming; core/self warming owns it');
if (contract.includes("id: 'my-store'")) fail('my-store is duplicated in user warming; self warming owns it');
else pass('user warming avoids self/profile duplicates');

const pipeline = read('lib/offlineWarmingPipeline.ts');
if (!pipeline.includes('return { ran: pipelineRan };')) fail('pipeline does not return the engine result');
if (pipeline.includes('warmCoreBundle(') || pipeline.includes('warmRouteShellsAtomic(')) fail('pipeline directly invokes phase functions instead of the engine');
else pass('pipeline has a single engine entry point');

for (const file of ['lib/offlineCoreBundle.ts', 'lib/offlineRouteShells.ts', 'lib/offlineWarmingUserData.ts']) {
  if (!read(file).includes('reserveWarmingRequest')) fail(`${file} bypasses the runtime request budget`);
  else pass(`${file} participates in runtime budget`);
}

const pkg = JSON.parse(read('package.json'));
if (!String(pkg.scripts?.build ?? '').includes('generate-warming-manifest.mjs')) fail('build script does not generate warming manifest');
else if (!String(pkg.scripts.build).includes('next build') || !String(pkg.scripts.build).includes('&& node scripts/generate-warming-manifest.mjs')) fail('warming manifest is not regenerated after next build');
else pass('build regenerates warming manifest after Next build');

const sw = read('public/sw.js');
const cacheVersion = sw.match(/const CACHE_VERSION = ['"]([^'"]+)['"]/)?.[1];
const cacheVersionSource = read('lib/cacheVersion.ts');
const sourceVersion = cacheVersionSource.match(/SW_CACHE_VERSION[^=]*=\s*['"]([^'"]+)['"]/)?.[1];
if (!cacheVersion || !sourceVersion || cacheVersion !== sourceVersion) fail(`cache version drift: sw=${cacheVersion ?? '?'} source=${sourceVersion ?? '?'}`);
else pass(`cache version synchronized: ${cacheVersion}`);

const manifestScript = read('scripts/generate-warming-manifest.mjs');
if (!manifestScript.includes('app/(public)')) fail('manifest generator lacks App Router route-group aliases');
else pass('manifest generator handles App Router route groups');

if (process.exitCode) process.exit(1);
console.log('[warming-audit] FINAL AUDIT PASSED');
