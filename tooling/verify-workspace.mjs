import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const rootPackage = readJson('package.json');
const expected = [
  ['apps/web/package.json', 'marketplat'],
  ['apps/api/package.json', 'classifieds-platform-backend'],
  ['packages/contracts/package.json', '@marketplat/contracts'],
];
const errors = [];

if (rootPackage.private !== true) errors.push('Root package must remain private.');
if (!existsSync(resolve(root, 'pnpm-workspace.yaml'))) errors.push('Missing pnpm-workspace.yaml.');
for (const [path, expectedName] of expected) {
  if (!existsSync(resolve(root, path))) {
    errors.push(`Missing workspace package manifest: ${path}`);
    continue;
  }
  const pkg = readJson(path);
  if (pkg.name !== expectedName) {
    errors.push(`${path}: expected package name "${expectedName}", found "${pkg.name}".`);
  }
}

if (errors.length) {
  console.error('Workspace bootstrap verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Workspace bootstrap structure verified.');
  console.log('Web, API, and contracts packages are discoverable in the workspace.');
  console.log('Note: dependency installation and build/test baselines are intentionally not claimed by this structural check.');
}
