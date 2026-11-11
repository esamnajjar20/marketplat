import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const workspacePackages = [
  ['apps/api/package.json', 'classifieds-platform-backend'],
  ['apps/mobile/package.json', '@marketplat/mobile'],
  ['packages/contracts/package.json', '@marketplat/contracts'],
  ['workers/cf-api-proxy/package.json', '@marketplat/cf-api-proxy'],
];
const frontendPath = 'frontend/package.json';
const taskTargets = {
  'build:all': ['apps/api/package.json'],
  'type-check:all': workspacePackages.map(([path]) => path),
  'test:all': workspacePackages.map(([path]) => path),
  'lint:all': ['apps/api/package.json'],
  'dev:all': ['apps/api/package.json', 'apps/mobile/package.json'],
  'test:worker': ['workers/cf-api-proxy/package.json'],
};
const errors = [];

if (!existsSync(resolve(root, 'package.json'))) throw new Error('Run this verifier from the repository root.');
const rootPackage = readJson('package.json');
if (rootPackage.private !== true) errors.push('Root package must remain private.');
if (!existsSync(resolve(root, 'pnpm-workspace.yaml'))) errors.push('Missing pnpm-workspace.yaml.');
if (!existsSync(resolve(root, 'pnpm-lock.yaml'))) errors.push('Missing pnpm-lock.yaml.');
if (!existsSync(resolve(root, 'turbo.json'))) errors.push('Missing turbo.json.');

const workspaceText = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
for (const pattern of ["'apps/*'", "'packages/*'", "'workers/*'"]) {
  if (!workspaceText.includes(pattern)) errors.push(`pnpm-workspace.yaml is missing ${pattern}.`);
}
if (/frontend|apps\/web/.test(workspaceText)) {
  errors.push('The Next.js frontend is intentionally managed by npm and must not be added to pnpm workspace patterns.');
}
const workflowDirectory = resolve(root, '.github/workflows');
if (existsSync(workflowDirectory)) {
  for (const file of readdirSync(workflowDirectory).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))) {
    const workflow = readFileSync(resolve(workflowDirectory, file), 'utf8');
    if (/apps\/web(?:\/|\b)/.test(workflow)) errors.push(`.github/workflows/${file} still references the removed apps/web path.`);
  }
}

const turbo = existsSync(resolve(root, 'turbo.json')) ? readJson('turbo.json') : null;
if (turbo) {
  for (const task of ['build', 'type-check', 'test', 'lint', 'dev']) {
    if (!turbo.tasks?.[task]) errors.push(`turbo.json: missing task "${task}".`);
  }
}

const packages = new Map();
for (const [path, expectedName] of workspacePackages) {
  if (!existsSync(resolve(root, path))) {
    errors.push(`Missing pnpm workspace package manifest: ${path}`);
    continue;
  }
  const pkg = readJson(path);
  packages.set(path, pkg);
  if (pkg.name !== expectedName) errors.push(`${path}: expected "${expectedName}", found "${pkg.name}".`);
}

if (!existsSync(resolve(root, frontendPath))) {
  errors.push(`Missing standalone npm frontend manifest: ${frontendPath}`);
} else {
  const frontend = readJson(frontendPath);
  if (frontend.name !== 'marketplat') errors.push(`${frontendPath}: expected package name "marketplat".`);
  for (const task of ['dev', 'build', 'test', 'type-check', 'lint']) {
    if (!frontend.scripts?.[task]) errors.push(`${frontendPath}: missing required script "${task}".`);
  }
  for (const script of ['dev:web', 'build:web', 'test:web', 'type-check:web', 'lint:web']) {
    if (!rootPackage.scripts?.[script]?.includes('npm --prefix frontend')) {
      errors.push(`Root script "${script}" must invoke the standalone npm frontend via --prefix frontend.`);
    }
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
    if (pkg && !pkg.scripts?.[task]) errors.push(`${path}: script "${task}" required by root script "${script}" is missing.`);
  }
}

if (!rootPackage.scripts?.['dev:all']?.includes('tools/dev-all.mjs')) {
  errors.push('dev:all must use the process supervisor for the standalone frontend and pnpm services.');
}

// Keep the full-stack Compose build context aligned with the standalone npm
// frontend. A wrong context silently drops its package-lock.json and makes
// `npm ci` fail inside Docker even when local development works.
const fullComposePath = 'apps/api/docker-compose.full.yml';
const fullCompose = existsSync(resolve(root, fullComposePath))
  ? readFileSync(resolve(root, fullComposePath), 'utf8')
  : '';
if (!fullCompose) {
  errors.push(`Missing ${fullComposePath}.`);
} else {
  const expectedFrontendBuild = /web:\s*\n\s*build:\s*\n\s*context:\s*\.\.\/\.\.\/frontend\s*\n\s*dockerfile:\s*Dockerfile/m;
  if (!expectedFrontendBuild.test(fullCompose)) {
    errors.push(`${fullComposePath}: web service must build from ../../frontend using Dockerfile.`);
  }
}
if (!existsSync(resolve(root, 'frontend/Dockerfile'))) errors.push('Missing frontend/Dockerfile.');
if (!existsSync(resolve(root, 'frontend/.dockerignore'))) errors.push('Missing frontend/.dockerignore.');
if (existsSync(resolve(root, 'frontend/.dockerignore'))) {
  const frontendDockerIgnore = readFileSync(resolve(root, 'frontend/.dockerignore'), 'utf8');
  if (/^package-lock\.json$/m.test(frontendDockerIgnore)) {
    errors.push('frontend/.dockerignore must not exclude package-lock.json required by npm ci.');
  }
}
const ciWorkflowPath = '.github/workflows/ci.yml';
if (existsSync(resolve(root, ciWorkflowPath))) {
  const ciWorkflow = readFileSync(resolve(root, ciWorkflowPath), 'utf8');
  if (!ciWorkflow.includes("matrix.service == 'backend' && '.' || './frontend'")) {
    errors.push(`${ciWorkflowPath}: Docker matrix must use the monorepo root for backend and frontend/ for web.`);
  }
  if (!ciWorkflow.includes("matrix.service == 'backend' && 'apps/api/Dockerfile' || 'Dockerfile'")) {
    errors.push(`${ciWorkflowPath}: Docker matrix must select apps/api/Dockerfile for backend.`);
  }
  if (!ciWorkflow.includes('node tools/verify-workspace.mjs')) {
    errors.push(`${ciWorkflowPath}: run the workspace/Docker context verifier in CI.`);
  }
}
const apiDockerfilePath = 'apps/api/Dockerfile';
if (existsSync(resolve(root, apiDockerfilePath))) {
  const apiDockerfile = readFileSync(resolve(root, apiDockerfilePath), 'utf8');
  if (!apiDockerfile.includes('COPY workers/cf-api-proxy/package.json ./workers/cf-api-proxy/package.json')) {
    errors.push(`${apiDockerfilePath}: copy all pnpm workspace manifests before frozen-lockfile install.`);
  }
}
if (errors.length) {
  console.error('Workspace bootstrap verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Workspace bootstrap structure verified.');
  console.log('Standalone npm frontend and pnpm API/mobile/contracts/Worker workspace are correctly separated.');
  console.log('Root web scripts target frontend/; recursive scripts include the frontend explicitly.');
  console.log('This is a structural check; it does not prove install, build, or test success.');
}
