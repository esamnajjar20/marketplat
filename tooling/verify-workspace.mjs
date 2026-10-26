import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const expected = [
  ['apps/web/package.json', 'marketplat'],
  ['apps/api/package.json', 'classifieds-platform-backend'],
  ['apps/mobile/package.json', '@marketplat/mobile'],
  ['packages/contracts/package.json', '@marketplat/contracts'],
  ['workers/cf-api-proxy/package.json', '@marketplat/cf-api-proxy'],
];
const taskTargets = {
  'build:all': ['apps/web/package.json', 'apps/api/package.json'],
  'type-check:all': expected.map(([path]) => path),
  'test:all': expected.map(([path]) => path),
  'lint:all': ['apps/web/package.json', 'apps/api/package.json'],
  'dev:all': ['apps/web/package.json', 'apps/api/package.json', 'apps/mobile/package.json'],
  'test:worker': ['workers/cf-api-proxy/package.json'],
};
const errors = [];

if (readJson('package.json').private !== true) errors.push('Root package must remain private.');
const rootPackage = readJson('package.json');
if (!existsSync(resolve(root, 'pnpm-workspace.yaml'))) errors.push('Missing pnpm-workspace.yaml.');
if (!existsSync(resolve(root, 'pnpm-lock.yaml'))) errors.push('Missing pnpm-lock.yaml.');
if (!rootPackage.devDependencies?.turbo) errors.push('Root devDependencies must include turbo.');

let turbo = null;
if (!existsSync(resolve(root, 'turbo.json'))) {
  errors.push('Missing turbo.json.');
} else {
  turbo = readJson('turbo.json');
  for (const task of ['build', 'type-check', 'test', 'lint', 'dev']) {
    if (!turbo.tasks?.[task]) errors.push(`turbo.json: missing task "${task}".`);
  }
}

const packages = new Map();
for (const [path, expectedName] of expected) {
  if (!existsSync(resolve(root, path))) {
    errors.push(`Missing workspace package manifest: ${path}`);
    continue;
  }
  const pkg = readJson(path);
  packages.set(path, pkg);
  if (pkg.name !== expectedName) {
    errors.push(`${path}: expected package name "${expectedName}", found "${pkg.name}".`);
  }
}

for (const [script, paths] of Object.entries(taskTargets)) {
  if (!rootPackage.scripts?.[script]) errors.push(`Root package.json: missing script "${script}".`);
  const task = script === 'build:all' ? 'build'
    : script === 'type-check:all' ? 'type-check'
    : script === 'test:all' ? 'test'
    : script === 'lint:all' ? 'lint'
    : script === 'test:worker' ? 'test'
    : 'dev';
  for (const path of paths) {
    const pkg = packages.get(path);
    if (pkg && !pkg.scripts?.[task]) {
      errors.push(`${path}: script "${task}" is required by root script "${script}".`);
    }
  }
}

if (errors.length) {
  console.error('Workspace bootstrap verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Workspace bootstrap structure verified.');
  console.log('Web, API, mobile, contracts, and Cloudflare Worker package manifests are discoverable.');
  console.log('Root Turbo scripts target packages that define the requested tasks.');
  console.log('This is a structural check; it does not prove install, build, or test success.');
}
