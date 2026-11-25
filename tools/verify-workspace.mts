import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';


const root = process.cwd();
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const workspacePackages = [
  ['apps/api/package.json', 'classifieds-platform-backend'],
  ['apps/mobile/package.json', '@marketplat/mobile'],
  ['packages/contracts/package.json', '@marketplat/contracts'],
  ['workers/cf-api-proxy/package.json', '@marketplat/cf-api-proxy'],
  ['workers/keepalive-worker/package.json', 'marketplat-keepalive-worker'],
];
const frontendPath = 'frontend/package.json';
const taskTargets = {
  'build:all': [
    [frontendPath, 'build'],
    ['apps/api/package.json', 'build'],
    ['apps/mobile/package.json', 'build:bundle:ci'],
    ['workers/cf-api-proxy/package.json', 'build'],
  ],
  'type-check:all': [
    [frontendPath, 'type-check'],
    [frontendPath, 'type-check:e2e'],
    [frontendPath, 'type-check:scripts'],
    ['apps/api/package.json', 'type-check'],
    ['apps/mobile/package.json', 'type-check'],
    ['packages/contracts/package.json', 'type-check'],
    ['workers/cf-api-proxy/package.json', 'type-check'],
  ],
  'test:all': [
    [frontendPath, 'test'],
    ['apps/api/package.json', 'test'],
    ['apps/mobile/package.json', 'test:all'],
    ['packages/contracts/package.json', 'test'],
    ['workers/cf-api-proxy/package.json', 'test'],
    ['workers/keepalive-worker/package.json', 'test'],
  ],
  'lint:all': [
    [frontendPath, 'lint'],
    ['apps/api/package.json', 'lint'],
    ['apps/mobile/package.json', 'lint'],
  ],
  'dev:all': [
    ['apps/api/package.json', 'dev'],
    ['apps/mobile/package.json', 'dev'],
  ],
  'test:worker': [['workers/cf-api-proxy/package.json', 'test']],
};
const packageManifests = new Map();

const errors = [];

if (!existsSync(resolve(root, 'package.json'))) throw new Error('Run this verifier from the repository root.');
const rootPackage = readJson('package.json');
if (rootPackage.private !== true) errors.push('Root package must remain private.');
if (!existsSync(resolve(root, 'pnpm-workspace.yaml'))) errors.push('Missing pnpm-workspace.yaml.');
if (!existsSync(resolve(root, 'tsconfig.scripts.json'))) errors.push('Missing repository-wide tsconfig.scripts.json.');
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

for (const [path, expectedName] of workspacePackages) {
  if (!existsSync(resolve(root, path))) {
    errors.push(`Missing pnpm workspace package manifest: ${path}`);
    continue;
  }
  const pkg = readJson(path);
  packageManifests.set(path, pkg);
  if (pkg.name !== expectedName) errors.push(`${path}: expected "${expectedName}", found "${pkg.name}".`);
}

if (!existsSync(resolve(root, frontendPath))) {
  errors.push(`Missing standalone npm frontend manifest: ${frontendPath}`);
} else {
  const frontend = readJson(frontendPath);
  if (frontend.name !== 'marketplat') errors.push(`${frontendPath}: expected package name "marketplat".`);
  for (const task of ['dev', 'build', 'test', 'type-check', 'type-check:e2e', 'type-check:scripts', 'lint']) {
    if (!frontend.scripts?.[task]) errors.push(`${frontendPath}: missing required script "${task}".`);
  }
  for (const script of ['dev:web', 'build:web', 'test:web', 'type-check:web', 'type-check:web:e2e', 'lint:web']) {
    if (!rootPackage.scripts?.[script]?.includes('npm --prefix frontend')) {
      errors.push(`Root script "${script}" must invoke the standalone npm frontend via --prefix frontend.`);
    }
  }
  packageManifests.set(frontendPath, frontend);
}

for (const [script, requiredTargets] of Object.entries(taskTargets)) {
  if (!rootPackage.scripts?.[script]) errors.push(`Root package.json: missing script "${script}".`);
  for (const [path, requiredScript] of requiredTargets) {
    const pkg = packageManifests.get(path);
    if (pkg && !pkg.scripts?.[requiredScript]) {
      errors.push(`${path}: script "${requiredScript}" required by root script "${script}" is missing.`);
    }
  }
}

const aggregateScriptRequirements = {
  'build:all': [
    'npm --prefix frontend run build',
    'pnpm --recursive --if-present run build',
    'pnpm --filter @marketplat/mobile build:bundle:ci',
    'make -C apps/go-worker build',
  ],
  'type-check:all': [
    'npm --prefix frontend run type-check',
    'npm --prefix frontend run type-check:e2e',
    'npm --prefix frontend run type-check:scripts',
    'pnpm --recursive --if-present run type-check',
    'make -C apps/go-worker vet',
  ],
  'test:all': [
    'npm --prefix frontend run test',
    'pnpm --filter classifieds-platform-backend test',
    'pnpm --filter @marketplat/mobile test:all',
    'pnpm --filter @marketplat/contracts test',
    'pnpm --filter @marketplat/cf-api-proxy test',
    'pnpm --filter marketplat-keepalive-worker test',
    'make -C apps/go-worker test',
  ],
  'lint:all': [
    'npm --prefix frontend run lint',
    'pnpm --recursive --if-present run lint',
    'make -C apps/go-worker fmt-check',
  ],
  'verify:all': ['verify:workspace', 'verify:prisma-layout', 'lint:all', 'type-check:all', 'test:all', 'build:all'],
};
for (const [script, requiredFragments] of Object.entries(aggregateScriptRequirements)) {
  const command = rootPackage.scripts?.[script] ?? '';
  for (const fragment of requiredFragments) {
    if (!command.includes(fragment)) {
      errors.push(`Root script "${script}" does not include required target "${fragment}".`);
    }
  }
}

if (rootPackage.scripts?.['verify:prisma-layout'] !== 'node tools/verify-prisma-layout.mts') {
  errors.push('Root package.json: verify:prisma-layout must invoke tools/verify-prisma-layout.mts.');
}

if (!rootPackage.scripts?.['dev:all']?.includes('tools/dev-all.mts')) {
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
  if (!ciWorkflow.includes('node tools/verify-workspace.mts')) {
    errors.push(`${ciWorkflowPath}: run the workspace/Docker context verifier in CI.`);
  }
  for (const event of ['push:', 'pull_request:', 'workflow_dispatch:']) {
    if (!ciWorkflow.includes(event)) errors.push(`${ciWorkflowPath}: missing automatic/manual trigger "${event}".`);
  }
  for (const pathPattern of ["'apps/api/**'", "'apps/mobile/**'", "'frontend/**'", "'packages/**'", "'workers/**'"]) {
    if (!ciWorkflow.includes(pathPattern)) errors.push(`${ciWorkflowPath}: push path filters are missing ${pathPattern}.`);
  }
  if (!ciWorkflow.includes('Do not path-filter pull_request')) {
    errors.push(`${ciWorkflowPath}: pull_request must always create a workflow status for branch-protection compatibility.`);
  }
  if (ciWorkflow.includes('if: false')) errors.push(`${ciWorkflowPath}: an unconditional false guard disables a CI job.`);
  if (!ciWorkflow.includes('npm run e2e:ci')) errors.push(`${ciWorkflowPath}: the critical browser E2E suite must run in CI.`);
  for (const command of ['npm run type-check:e2e', 'npm --prefix frontend run type-check:scripts']) {
    if (!ciWorkflow.includes(command)) errors.push(`${ciWorkflowPath}: missing TypeScript validation step \"${command}\".`);
  }
  if (!ciWorkflow.includes("'tsconfig.scripts.json'")) {
    errors.push(`${ciWorkflowPath}: push path filters must include tsconfig.scripts.json.`);
  }
}
const frontendPackage = packageManifests.get(frontendPath);
const criticalE2ESpecs = [
  'e2e/tests/marketplace-smoke.spec.ts',
  'e2e/tests/auth-form-validation.spec.ts',
  'e2e/tests/missing-business-journeys-mocked.spec.ts',
];
if (!frontendPackage?.scripts?.['e2e:ci']) {
  errors.push('frontend/package.json: missing e2e:ci script.');
} else {
  for (const spec of criticalE2ESpecs) {
    if (!frontendPackage.scripts['e2e:ci'].includes(spec)) {
      errors.push(`frontend/package.json: e2e:ci is missing ${spec}.`);
    }
    if (!existsSync(resolve(root, 'frontend', spec))) {
      errors.push(`Critical E2E spec is missing: frontend/${spec}.`);
    }
  }
}
if (!existsSync(resolve(root, 'apps/go-worker/Makefile')) || !readFileSync(resolve(root, 'apps/go-worker/Makefile'), 'utf8').includes('fmt-check:')) {
  errors.push('apps/go-worker/Makefile: missing non-mutating fmt-check target required by lint:all.');
}
const rootGitIgnore = readFileSync(resolve(root, '.gitignore'), 'utf8');
if (!rootGitIgnore.includes('apps/go-worker/bin/')) {
  errors.push('.gitignore: Go worker build output apps/go-worker/bin/ must be ignored.');
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
  console.log('Aggregate build/lint/type-check/test scripts cover Web, API, Mobile, Contracts, Cloudflare Worker, Keepalive Worker, and Go Worker.');
  console.log('CI triggers and critical E2E coverage are configured; this remains a structural check, not proof of runtime build/test success.');
}
