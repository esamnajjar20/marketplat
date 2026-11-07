import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marketplat-simulator-'));
process.env.SIMULATOR_DATA_DIR = path.join(tempRoot, 'data');
process.env.SIMULATOR_REPORT_DIR = path.join(tempRoot, 'reports');
process.env.SIMULATOR_ALLOWED_HOSTS = 'marketplat.esamnajjar6.workers.dev';
process.env.SIMULATOR_TARGET_URL = 'https://marketplat.esamnajjar6.workers.dev';
const store = await import('../src/store.mjs');
const { DEFAULT_SCENARIOS } = await import('../src/scenarios.mjs');

after(async () => fs.rm(tempRoot, { recursive: true, force: true }));

test('config defaults and persists iteration count within safe bounds', async () => {
  await store.ensureStorage();
  const initial = await store.readConfig();
  assert.equal(initial.iterations, 1);
  const updated = await store.updateConfig({ iterations: 3, virtualUsers: 4, browserConcurrency: 2 });
  assert.equal(updated.iterations, 3);
  await assert.rejects(() => store.updateConfig({ iterations: 21 }), /iterations must be between 1 and 20/);
});

test('artifact path must be a screenshot explicitly listed in its report', async () => {
  await store.ensureStorage();
  const runId = 'mp-test-run-12345678';
  const artifactName = 'user-001-public-browse-1-failure.png';
  const directory = store.getRunArtifactDirectory(runId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, artifactName), Buffer.from('png-test-data'));
  await store.saveReport({ id: runId, artifacts: [{ type: 'screenshot', name: artifactName }] });
  assert.equal(await store.getArtifactFilePath(runId, artifactName), path.join(directory, artifactName));
  await assert.rejects(() => store.getArtifactFilePath(runId, '../config.json'), /Invalid artifact name/);
  await assert.rejects(() => store.getArtifactFilePath(runId, 'not-listed.png'), /Artifact not found in report/);
});


test('registration address template can distinguish separate iterations', () => {
  process.env.SIMULATOR_EMAIL_TEMPLATE = 'qa+{runId}-{user}-{iteration}@your-domain.example';
  process.env.SIMULATOR_TEST_PASSWORD = 'test-password-only';
  const first = store.getRegistrationCredentials('mp-test-run-12345678', 2, 1);
  const second = store.getRegistrationCredentials('mp-test-run-12345678', 2, 2);
  assert.notEqual(first.email, second.email);
  assert.equal(first.password, second.password);
});


test('test accounts normalize buyer/seller roles for role-specific runs', () => {
  process.env.SIMULATOR_TEST_ACCOUNTS = JSON.stringify([
    { email: 'buyer@example.test', password: 'buyer-secret', role: 'buyer' },
    { email: 'seller@example.test', password: 'seller-secret', role: 'seller' },
    { email: 'legacy@example.test', password: 'legacy-secret' }
  ]);
  const accounts = store.parseTestAccounts();
  assert.deepEqual(accounts.map(item => item.role), ['buyer', 'seller', 'any']);
  assert.deepEqual(store.publicRunnerSettings().testAccountRoleCounts, { buyer: 1, seller: 1, any: 1 });
});


test('startup migration adds new built-ins and removes only the known legacy login prefix', async () => {
  await store.ensureStorage();
  const scenariosPath = path.join(process.env.SIMULATOR_DATA_DIR, 'scenarios.json');
  const current = JSON.parse(await fs.readFile(scenariosPath, 'utf8'));
  const legacy = current.map(item => structuredClone(item)).filter(item => item.id !== 'create-test-ad');
  const login = legacy.find(item => item.id === 'login-and-account-pages');
  login.steps.unshift(
    { type: 'goto', value: '/login' },
    { type: 'fill', selector: '#email', value: '{accountEmail}' },
    { type: 'fill', selector: '#password', value: '{accountPassword}' },
    { type: 'click', selector: 'form button[type="submit"]', risk: 'safe' },
    { type: 'expectUrl', contains: '/dashboard', timeoutMs: 25000 }
  );
  await fs.writeFile(scenariosPath, JSON.stringify(legacy));
  await store.ensureStorage();
  const migrated = JSON.parse(await fs.readFile(scenariosPath, 'utf8'));
  const migratedLogin = migrated.find(item => item.id === 'login-and-account-pages');
  assert.equal(migratedLogin.steps[0].value, '/dashboard');
  assert.ok(migrated.some(item => item.id === 'create-test-ad'));
  assert.equal(migrated.filter(item => item.id === 'create-test-ad').length, 1);
  assert.equal(DEFAULT_SCENARIOS.some(item => item.id === 'create-test-ad'), true);
});
