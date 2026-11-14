// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SCENARIOS, validateScenario } from './scenarios.mts';
import type { PathLike } from 'node:fs';




const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.SIMULATOR_DATA_DIR || path.join(HERE, '..', 'data'));
const REPORT_DIR = path.resolve(process.env.SIMULATOR_REPORT_DIR || path.join(HERE, '..', 'reports'));
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SCENARIOS_FILE = path.join(DATA_DIR, 'scenarios.json');

function boundedIntegerEnv(name: string, fallback: number, max: number) {
  const raw = Number(process.env[name]);
  return Number.isInteger(raw) && raw >= 1 ? Math.min(max, raw) : fallback;
}

export const MAX_USERS = boundedIntegerEnv('SIMULATOR_HARD_MAX_USERS', 100, 1000);
export const MAX_CONCURRENCY = boundedIntegerEnv('SIMULATOR_HARD_MAX_CONCURRENCY', 20, 50);
export const MAX_WRITE_USERS = boundedIntegerEnv('SIMULATOR_HARD_MAX_WRITE_USERS', 5, 20);
export const ALLOWED_HOSTS = new Set((process.env.SIMULATOR_ALLOWED_HOSTS || 'marketplat.esamnajjar6.workers.dev').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
export const DEFAULT_TARGET_URL = process.env.SIMULATOR_TARGET_URL || 'https://marketplat.esamnajjar6.workers.dev';

export function validateTargetUrl(raw: string|URL) {
  let target;
  try { target = new URL(raw); } catch { throw new Error('Target URL is invalid'); }
  if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Only HTTP(S) target URLs are allowed');
  if (target.username || target.password) throw new Error('Credentials are not allowed in the target URL');
  if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) throw new Error(`Target host is not allowlisted: ${target.hostname}`);
  if (process.env.NODE_ENV === 'production' && target.protocol !== 'https:') throw new Error('Production target must use HTTPS');
  return target.origin;
}

const DEFAULT_CONFIG = {
  targetUrl: DEFAULT_TARGET_URL,
  virtualUsers: 1,
  browserConcurrency: 1,
  rampUpMs: 2000,
  thinkTimeMs: 800,
  iterations: 1,
  actionTimeoutMs: (() => { const value = Number(process.env.SIMULATOR_DEFAULT_TIMEOUT_MS || 20000); return Number.isInteger(value) && value >= 3000 && value <= 60000 ? value : 20000; })(),
  viewport: 'desktop',
  stopOnFailure: false,
  defaultAllowWrites: false
};

export async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(REPORT_DIR, { recursive: true });
  try { await fs.access(CONFIG_FILE); }
  catch { await writeJsonAtomic(CONFIG_FILE, DEFAULT_CONFIG); }

  let existingScenarios;
  try {
    existingScenarios = JSON.parse(await fs.readFile(SCENARIOS_FILE, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`Cannot read simulator scenarios file: ${error instanceof Error ? error.message : String(error)}`);
    await writeJsonAtomic(SCENARIOS_FILE, DEFAULT_SCENARIOS);
    return;
  }
  if (!Array.isArray(existingScenarios)) throw new Error('Simulator scenarios file must contain a JSON array');

  let changed = false;
  const loginScenario = existingScenarios.find(item => item?.id === 'login-and-account-pages');
  const legacyLoginPrefix = [
    { type: 'goto', value: '/login' },
    { type: 'fill', selector: '#email', value: '{accountEmail}' },
    { type: 'fill', selector: '#password', value: '{accountPassword}' },
    { type: 'click', selector: 'form button[type="submit"]', risk: 'safe' },
    { type: 'expectUrl', contains: '/dashboard', timeoutMs: 25000 }
  ];
  if (loginScenario && Array.isArray(loginScenario.steps)
    && legacyLoginPrefix.every((expected, index) => JSON.stringify(loginScenario.steps[index]) === JSON.stringify(expected))) {
    loginScenario.steps.splice(0, legacyLoginPrefix.length);
    loginScenario.description = DEFAULT_SCENARIOS.find(item => item.id === 'login-and-account-pages')?.description || loginScenario.description;
    changed = true;
  }

  const existingIds = new Set(existingScenarios.filter(item => item && typeof item.id === 'string').map(item => item.id));
  const newDefaults = DEFAULT_SCENARIOS.filter(item => !existingIds.has(item.id));
  if (newDefaults.length) {
    existingScenarios.push(...newDefaults.map(item => structuredClone(item)));
    changed = true;
  }
  // Validate the complete merged set before writing it; invalid admin-edited scenarios are never silently replaced.
  existingScenarios.forEach(validateScenario);
  if (changed) await writeJsonAtomic(SCENARIOS_FILE, existingScenarios);
}

async function writeJsonAtomic(file: PathLike, value: any[]) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}

export async function readConfig() {
  const raw = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  return { ...DEFAULT_CONFIG, ...raw, targetUrl: validateTargetUrl(raw.targetUrl || DEFAULT_TARGET_URL) };
}

export async function updateConfig(patch: object) {
  const current = await readConfig();
  const next = { ...current };
  for (const key of ['targetUrl', 'virtualUsers', 'browserConcurrency', 'rampUpMs', 'thinkTimeMs', 'iterations', 'actionTimeoutMs', 'viewport', 'stopOnFailure', 'defaultAllowWrites']) {
    if (Object.hasOwn(patch, key)) next[key] = patch[key];
  }
  next.targetUrl = validateTargetUrl(next.targetUrl);
  const intLimits = {
    virtualUsers: [1, MAX_USERS],
    browserConcurrency: [1, MAX_CONCURRENCY],
    rampUpMs: [0, 120000],
    thinkTimeMs: [0, 15000],
    iterations: [1, 20],
    actionTimeoutMs: [3000, 60000]
  };
  for (const [key, [min, max]] of Object.entries(intLimits)) {
    if (!Number.isInteger(next[key]) || next[key] < min || next[key] > max) throw new Error(`${key} must be between ${min} and ${max}`);
  }
  if (next.browserConcurrency > next.virtualUsers) throw new Error('browserConcurrency cannot exceed virtualUsers');
  if (!['desktop', 'mobile'].includes(next.viewport)) throw new Error('viewport must be desktop or mobile');
  if (typeof next.stopOnFailure !== 'boolean' || typeof next.defaultAllowWrites !== 'boolean') throw new Error('Boolean config values are invalid');
  await writeJsonAtomic(CONFIG_FILE, next);
  return next;
}

export async function readScenarios() {
  const items = JSON.parse(await fs.readFile(SCENARIOS_FILE, 'utf8'));
  if (!Array.isArray(items)) throw new Error('Scenarios file is invalid');
  return items.map(validateScenario);
}

export async function saveScenario(input: { id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; tags: string[]; steps: ({ type: string; value: string; selector?: undefined; risk?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; selector: string; value: string; risk?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; selector: string; risk: string; value?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; contains: string; timeoutMs: number; value?: undefined; selector?: undefined; risk?: undefined; })[]; accountRole?: undefined; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; tags: string[]; steps: ({ type: string; value: string; contains?: undefined; selector?: undefined; }|{ type: string; contains: string; value?: undefined; selector?: undefined; }|{ type: string; selector: string; value?: undefined; contains?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; tags: string[]; steps: ({ type: string; value: string; selector?: undefined; role?: undefined; name?: undefined; contains?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; contains?: undefined; }|{ type: string; role: string; name: string; value: string; selector?: undefined; contains?: undefined; }|{ type: string; contains: string; value?: undefined; selector?: undefined; role?: undefined; name?: undefined; })[]; accountRole?: undefined; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; tags: string[]; steps: ({ type: string; value: string; role?: undefined; name?: undefined; exact?: undefined; selector?: undefined; text?: undefined; }|{ type: string; role: string; name: string; value?: undefined; exact?: undefined; selector?: undefined; text?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; selector?: undefined; text?: undefined; }|{ type: string; selector: string; value: string; role?: undefined; name?: undefined; exact?: undefined; text?: undefined; }|{ type: string; text: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; selector?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; requiresSeedAd: boolean; tags: string[]; steps: ({ type: string; value: string; role?: undefined; name?: undefined; exact?: undefined; optional?: undefined; selector?: undefined; }|{ type: string; role: string; name: string; exact: boolean; optional: boolean; value?: undefined; selector?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; optional?: undefined; selector?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; optional?: undefined; })[]; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; requiresSeedSeller: boolean; tags: string[]; steps: ({ type: string; value: string; role?: undefined; name?: undefined; exact?: undefined; optional?: undefined; selector?: undefined; }|{ type: string; role: string; name: string; exact: boolean; optional: boolean; value?: undefined; selector?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; optional?: undefined; selector?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; optional?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; requiresSeedSeller: boolean; tags: string[]; steps: ({ type: string; value: string; role?: undefined; name?: undefined; exact?: undefined; contains?: undefined; text?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; contains?: undefined; text?: undefined; }|{ type: string; contains: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; text?: undefined; }|{ type: string; role: string; name: string; value: string; exact?: undefined; contains?: undefined; text?: undefined; }|{ type: string; text: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; contains?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; requiresSeedAd: boolean; tags: string[]; steps: ({ type: string; value: string; selector?: undefined; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; selector: string; value: string; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; selector?: undefined; })[]; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; requiresSeedProduct: boolean; tags: string[]; steps: ({ type: string; value: string; selector?: undefined; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; selector: string; value: string; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; selector?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedService?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; requiresSeedService: boolean; tags: string[]; steps: ({ type: string; value: string; selector?: undefined; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; selector: string; value: string; role?: undefined; name?: undefined; exact?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; selector?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; }|{ id: string; name: string; description: string; enabled: boolean; writes: boolean; requiresAccount: boolean; accountRole: string; tags: string[]; steps: ({ type: string; value: string; selector?: undefined; role?: undefined; name?: undefined; exact?: undefined; file?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; selector: string; value: string; role?: undefined; name?: undefined; exact?: undefined; file?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; role: string; name: string; exact: boolean; value?: undefined; selector?: undefined; file?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; selector: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; file?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; selector: string; file: string; value?: undefined; role?: undefined; name?: undefined; exact?: undefined; contains?: undefined; timeoutMs?: undefined; }|{ type: string; contains: string; timeoutMs: number; value?: undefined; selector?: undefined; role?: undefined; name?: undefined; exact?: undefined; file?: undefined; })[]; requiresSeedAd?: undefined; requiresSeedSeller?: undefined; requiresSeedProduct?: undefined; requiresSeedService?: undefined; }) {
  const scenario = validateScenario(input);
  const items = await readScenarios();
  const index = items.findIndex(item => item.id === scenario.id);
  if (index >= 0) items[index] = scenario;
  else items.push(scenario);
  await writeJsonAtomic(SCENARIOS_FILE, items);
  return scenario;
}

export async function removeScenario(id: string) {
  const items = await readScenarios();
  const next = items.filter(item => item.id !== id);
  if (next.length === items.length) return false;
  await writeJsonAtomic(SCENARIOS_FILE, next);
  return true;
}

export function getRunArtifactDirectory(runId: string) {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(runId)) throw new Error('Invalid report id');
  return path.join(REPORT_DIR, runId);
}

export async function getArtifactFilePath(runId: string, artifactName: string|string[]) {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(runId)) throw new Error('Invalid report id');
  if (typeof artifactName !== 'string' || !/^[a-zA-Z0-9._-]{1,180}\.png$/i.test(artifactName) || artifactName.includes('..')) {
    throw new Error('Invalid artifact name');
  }
  const report = await readReport(runId);
  if (!Array.isArray(report.artifacts) || !report.artifacts.some((item: { type: string; name: string; }): { type: string; name: string; } => item?.type === 'screenshot' && item.name === artifactName)) {
    throw new Error('Artifact not found in report');
  }
  const root = getRunArtifactDirectory(runId);
  const file = path.resolve(root, artifactName);
  if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Invalid artifact path');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 15 * 1024 * 1024) throw new Error('Artifact is unavailable or too large');
  return file;
}

export async function saveReport(report: { id: any; artifacts?: never[]|{ type: string; name: string; }[]; status?: string; startedAt?: string; finishedAt?: null; options?: { virtualUsers: any; browserConcurrency: any; rampUpMs: any; thinkTimeMs: any; iterations: any; viewport: any; scenarioIds: any; targetUrl: any; }; summary?: { usersTotal: any; usersStarted: number; usersCompleted: number; usersFailed: number; stepsTotal: number; stepsPassed: number; stepsFailed: number; httpRequests: number; httpErrors: number; consoleErrors: number; pageErrors: number; averagePageLoadMs: null; p95PageLoadMs: null; averageApiDurationMs: null; p95ApiDurationMs: null; durationMs: number; averageLcpMs: null; p95LcpMs: null; }; users?: never[]; operations?: never[]; apiRequests?: never[]; errors?: never[]; }) {
  const file = path.join(REPORT_DIR, `${report.id}.json`);
  await writeJsonAtomic(file, report);
  return file;
}

export async function readReport(id: string) {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error('Invalid report id');
  return JSON.parse(await fs.readFile(path.join(REPORT_DIR, `${id}.json`), 'utf8'));
}

export async function listReports(limit = 30) {
  const files = (await fs.readdir(REPORT_DIR)).filter(name => /^[a-zA-Z0-9-]{8,80}\.json$/.test(name));
  const records = await Promise.all(files.map(async name => {
    try {
      const report = JSON.parse(await fs.readFile(path.join(REPORT_DIR, name), 'utf8'));
      return {
        id: report.id,
        status: report.status,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        summary: report.summary,
        options: report.options
      };
    } catch { return null; }
  }));
  return records.filter(Boolean).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, Math.max(1, Math.min(limit, 100)));
}

export function publicRunnerSettings() {
  const emails = parseTestAccounts();
  return {
    allowedHosts: [...ALLOWED_HOSTS],
    hardMaxUsers: MAX_USERS,
    hardMaxConcurrency: MAX_CONCURRENCY,
    hardMaxWriteUsers: MAX_WRITE_USERS,
    registrationConfigured: Boolean(process.env.SIMULATOR_EMAIL_TEMPLATE && process.env.SIMULATOR_TEST_PASSWORD),
    testAccountsConfigured: emails.length > 0 && emails.every(item => item.email && item.password),
    testAccountCount: emails.length,
    testAccountRoleCounts: {
      buyer: emails.filter(item => item.role === 'buyer').length,
      seller: emails.filter(item => item.role === 'seller').length,
      any: emails.filter(item => item.role === 'any').length
    },
    seedAdConfigured: Boolean(process.env.SIMULATOR_SEED_AD_ID),
    seedSellerConfigured: Boolean(process.env.SIMULATOR_SEED_SELLER_ID),
    seedProductConfigured: Boolean(process.env.SIMULATOR_SEED_PRODUCT_ID),
    seedServiceConfigured: Boolean(process.env.SIMULATOR_SEED_SERVICE_ID)
  };
}

export function parseTestAccounts() {
  const raw = process.env.SIMULATOR_TEST_ACCOUNTS || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item.email === 'string' && typeof item.password === 'string')
      .map(item => ({ ...item, role: ['buyer', 'seller'].includes(item.role) ? item.role : 'any' }));
  } catch { return []; }
}

export function getRegistrationCredentials(runId: string|any[], userIndex: number, iteration = 1) {
  const template = process.env.SIMULATOR_EMAIL_TEMPLATE || '';
  const password = process.env.SIMULATOR_TEST_PASSWORD || '';
  if (!template || !password) throw new Error('Registration is not configured. Set SIMULATOR_EMAIL_TEMPLATE and SIMULATOR_TEST_PASSWORD on the runner host.');
  const email = template.replaceAll('{runId}', runId).replaceAll('{user}', String(userIndex)).replaceAll('{iteration}', String(iteration));
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Generated registration email is invalid');
  return { email, password };
}
