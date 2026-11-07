import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import {
  MAX_CONCURRENCY, MAX_USERS, MAX_WRITE_USERS, getRegistrationCredentials, getRunArtifactDirectory, parseTestAccounts,
  readConfig, readScenarios, saveReport, validateTargetUrl
} from './store.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);
};
const safePath = raw => {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch { return String(raw).split('?')[0].slice(0, 300); }
};

function createRunRecord(options, selectedScenarios) {
  return {
    id: `mp-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`,
    status: 'queued',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    options: {
      virtualUsers: options.virtualUsers,
      browserConcurrency: options.browserConcurrency,
      rampUpMs: options.rampUpMs,
      thinkTimeMs: options.thinkTimeMs,
      iterations: options.iterations,
      viewport: options.viewport,
      scenarioIds: selectedScenarios.map(s => s.id),
      targetUrl: options.targetUrl
    },
    summary: {
      usersTotal: options.virtualUsers,
      usersStarted: 0,
      usersCompleted: 0,
      usersFailed: 0,
      stepsTotal: 0,
      stepsPassed: 0,
      stepsFailed: 0,
      httpRequests: 0,
      httpErrors: 0,
      consoleErrors: 0,
      pageErrors: 0,
      averagePageLoadMs: null,
      p95PageLoadMs: null,
      averageApiDurationMs: null,
      p95ApiDurationMs: null,
      durationMs: 0,
      averageLcpMs: null,
      p95LcpMs: null
    },
    users: [],
    operations: [],
    apiRequests: [],
    errors: [],
    artifacts: []
  };
}

function summarize(run, pageLoads, apiDurations, lcpValues = []) {
  const durationValues = apiDurations.filter(Number.isFinite);
  run.summary.durationMs = Math.max(0, new Date(run.finishedAt || Date.now()) - new Date(run.startedAt));
  run.summary.averagePageLoadMs = pageLoads.length ? Math.round(pageLoads.reduce((a, b) => a + b, 0) / pageLoads.length) : null;
  run.summary.p95PageLoadMs = percentile(pageLoads, 95);
  run.summary.averageLcpMs = lcpValues.length ? Math.round(lcpValues.reduce((a, b) => a + b, 0) / lcpValues.length) : null;
  run.summary.p95LcpMs = percentile(lcpValues, 95);
  run.summary.averageApiDurationMs = durationValues.length ? Math.round(durationValues.reduce((a, b) => a + b, 0) / durationValues.length) : null;
  run.summary.p95ApiDurationMs = percentile(durationValues, 95);
  run.summary.httpRequests = run.apiRequests.length;
  run.summary.httpErrors = run.apiRequests.filter(item => item.status >= 400 || item.failed).length;
}

function interpolate(value, vars) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key) => Object.hasOwn(vars, key) ? String(vars[key]) : match);
}

function ensureSafeNavigation(pathname, baseUrl) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error('Navigation step must use an internal path beginning with /');
  }
  const next = new URL(pathname, baseUrl);
  if (next.origin !== new URL(baseUrl).origin) throw new Error('External navigation is blocked');
  return next.toString();
}

async function executeStep({ page, step, vars, baseUrl, timeoutMs, run, userLabel, scenarioId, iteration, pageLoads, lcpValues }) {
  const started = Date.now();
  const op = {
    at: new Date(started).toISOString(), user: userLabel, scenarioId, iteration,
    type: step.type, label: String(step.label || step.selector || step.name || step.text || step.value || step.role || step.type).slice(0, 120),
    status: 'running', durationMs: 0, path: safePath(page.url() || baseUrl)
  };
  const check = () => { if (run.stopRequested) throw new Error('Run stopped by administrator'); };
  check();
  try {
    const selector = step.selector;
    const destructivePattern = /(?:delete|remove|cancel-account|deactivate|refund|checkout|payment|pay|حذف|إزالة|الغاء الحساب|إلغاء الحساب|إلغاء الطلب|إلغاء الإعلان|دفع|شراء|استرداد|حظر)/i;
    const actionHint = `${String(selector || '')} ${String(step.text || '')} ${String(step.label || '')}`;
    const isDestructiveAction = ['click', 'clickText', 'clickRole', 'clickDialogRole', 'press', 'pressRole'].includes(step.type)
      && destructivePattern.test(`${actionHint} ${interpolate(step.text || '', vars)} ${interpolate(step.name || '', vars)}`);
    const timeout = Number.isInteger(step.timeoutMs) ? Math.min(60000, Math.max(1000, step.timeoutMs)) : timeoutMs;
    switch (step.type) {
      case 'goto': {
        const target = ensureSafeNavigation(interpolate(step.value, vars), baseUrl);
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout });
        if (response && response.status() >= 400) throw new Error(`Navigation returned HTTP ${response.status()}`);
        await page.locator('body').waitFor({ state: 'visible', timeout });
        const timing = await page.evaluate(() => {
          const entry = performance.getEntriesByType('navigation')[0];
          const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
          return {
            domContentLoadedMs: entry ? Math.round(entry.domContentLoadedEventEnd) : null,
            loadEventMs: entry ? Math.round(entry.loadEventEnd) : null,
            lcpMs: lcp ? Math.round(lcp.startTime) : null
          };
        }).catch(() => null);
        if (timing?.domContentLoadedMs != null) pageLoads.push(timing.domContentLoadedMs);
        if (timing?.lcpMs != null) lcpValues.push(timing.lcpMs);
        op.path = safePath(page.url());
        op.httpStatus = response?.status() ?? null;
        op.navigation = timing;
        break;
      }
      case 'click':
        if (step.risk === 'destructive' || isDestructiveAction) throw new Error('Potentially destructive action is blocked on the published production target');
        await page.locator(selector).first().click({ timeout });
        break;
      case 'clickText':
        if (step.risk === 'destructive' || isDestructiveAction) throw new Error('Potentially destructive action is blocked on the published production target');
        await page.getByText(interpolate(step.text, vars), { exact: step.exact === true }).first().click({ timeout });
        break;
      case 'fill':
        await page.locator(selector).first().fill(interpolate(step.value, vars), { timeout });
        break;
      case 'select':
        await page.locator(selector).first().selectOption(interpolate(step.value, vars), { timeout });
        break;
      case 'selectFirstOption': {
        const trigger = page.locator(selector).first();
        await trigger.click({ timeout });
        const option = page.getByRole('option').first();
        await option.waitFor({ state: 'visible', timeout });
        op.selectedOption = (await option.innerText({ timeout })).trim().slice(0, 120);
        await option.click({ timeout });
        break;
      }
      case 'check':
        await page.locator(selector).first().check({ timeout });
        break;
      case 'uncheck':
        await page.locator(selector).first().uncheck({ timeout });
        break;
      case 'hover':
        await page.locator(selector).first().hover({ timeout });
        break;
      case 'press':
        if (isDestructiveAction) throw new Error('Potentially destructive action is blocked on the published production target');
        await page.locator(selector).first().press(interpolate(step.value, vars), { timeout });
        break;
      case 'scrollIntoView':
        await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout });
        break;
      case 'clickRole': {
        if (step.risk === 'destructive' || isDestructiveAction) throw new Error('Potentially destructive action is blocked on the published production target');
        const locator = page.getByRole(interpolate(step.role, vars), { name: interpolate(step.name, vars), exact: step.exact === true }).first();
        if (step.optional === true) {
          if (await locator.count() === 0 || !(await locator.isVisible())) break;
        }
        await locator.click({ timeout });
        break;
      }
      case 'clickDialogRole': {
        if (step.risk === 'destructive' || isDestructiveAction) throw new Error('Potentially destructive action is blocked on the published production target');
        await page.getByRole('dialog').getByRole(interpolate(step.role, vars), { name: interpolate(step.name, vars), exact: step.exact === true }).first().click({ timeout });
        break;
      }
      case 'fillRole':
        await page.getByRole(interpolate(step.role, vars), { name: interpolate(step.name, vars), exact: step.exact === true }).first().fill(interpolate(step.value, vars), { timeout });
        break;
      case 'pressRole':
        if (step.risk === 'destructive' || isDestructiveAction) throw new Error('Potentially destructive action is blocked on the published production target');
        await page.getByRole(interpolate(step.role, vars), { name: interpolate(step.name, vars), exact: step.exact === true }).first().press(interpolate(step.value, vars), { timeout });
        break;
      case 'expectRoleVisible':
        await page.getByRole(interpolate(step.role, vars), { name: interpolate(step.name, vars), exact: step.exact === true }).first().waitFor({ state: 'visible', timeout });
        break;
      case 'upload': {
        const fixture = String(step.file || '');
        if (!/^[a-zA-Z0-9._-]{1,120}$/.test(fixture) || fixture.includes('..')) throw new Error('Upload must reference a fixture filename only');
        const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
        const file = path.resolve(fixtureDir, fixture);
        if (!file.startsWith(`${fixtureDir}${path.sep}`)) throw new Error('Upload fixture path is invalid');
        await page.locator(selector).first().setInputFiles(file, { timeout });
        break;
      }
      case 'expectVisible':
        await page.locator(selector).first().waitFor({ state: 'visible', timeout });
        break;
      case 'expectHidden':
        await page.locator(selector).first().waitFor({ state: 'hidden', timeout });
        break;
      case 'expectText':
        await page.getByText(interpolate(step.text, vars), { exact: step.exact === true }).first().waitFor({ state: 'visible', timeout });
        break;
      case 'expectUrl':
        await page.waitForURL(url => url.toString().includes(interpolate(step.contains, vars)), { timeout });
        break;
      case 'expectNotUrl':
        await page.waitForTimeout(Math.min(1500, Math.max(150, step.settleMs || 350)));
        if (page.url().includes(interpolate(step.contains, vars))) throw new Error(`Unexpected URL contains ${step.contains}`);
        break;
      case 'wait':
        await page.waitForTimeout(Math.min(15000, Math.max(0, Number(step.ms) || 0)));
        break;
      case 'screenshot': {
        const file = path.join(run.artifactDir, `${userLabel}-${scenarioId}-${iteration}-${run.artifacts.length + 1}.png`);
        await fs.mkdir(run.artifactDir, { recursive: true });
        await page.screenshot({ path: file, fullPage: step.fullPage === true, timeout });
        run.artifacts.push({ type: 'screenshot', name: path.basename(file), user: userLabel, scenarioId });
        break;
      }
      default: throw new Error(`Unsupported browser step: ${step.type}`);
    }
    op.status = 'passed';
  } catch (error) {
    op.status = 'failed';
    op.error = (error instanceof Error ? error.message : String(error)).slice(0, 700);
    run.summary.stepsFailed += 1;
    run.errors.push({ at: op.at, user: userLabel, scenarioId, step: op.type, path: safePath(page.url() || baseUrl), message: op.error });
    throw error;
  } finally {
    op.durationMs = Date.now() - started;
    op.path = safePath(page.url() || baseUrl);
    run.summary.stepsTotal += 1;
    if (op.status === 'passed') run.summary.stepsPassed += 1;
    if (run.operations.length < 5000) run.operations.push(op);
  }
}

class RunManager {
  constructor() { this.runs = new Map(); this.activeId = null; this.starting = false; }

  async list(limit) {
    const { listReports } = await import('./store.mjs');
    return listReports(limit);
  }

  get(id) { return this.runs.get(id) || null; }

  async start(input) {
    if (this.activeId || this.starting) throw new Error('A browser simulation is already running or starting');
    // Reserve the single-run slot synchronously before the first await. This
    // prevents two ADMIN requests arriving in parallel from both passing the
    // active-run check and launching independent Chromium pools.
    this.starting = true;
    try {
      const [config, scenarios] = await Promise.all([readConfig(), readScenarios()]);
      const targetUrl = validateTargetUrl(input.targetUrl || config.targetUrl);
      const virtualUsers = Number(input.virtualUsers ?? config.virtualUsers);
      const browserConcurrency = Number(input.browserConcurrency ?? config.browserConcurrency);
      const rampUpMs = Number(input.rampUpMs ?? config.rampUpMs);
      const thinkTimeMs = Number(input.thinkTimeMs ?? config.thinkTimeMs);
      const iterations = Number(input.iterations ?? config.iterations ?? 1);
      if (!Number.isInteger(virtualUsers) || virtualUsers < 1 || virtualUsers > MAX_USERS) throw new Error(`virtualUsers must be between 1 and ${MAX_USERS}`);
      if (!Number.isInteger(browserConcurrency) || browserConcurrency < 1 || browserConcurrency > Math.min(MAX_CONCURRENCY, virtualUsers)) throw new Error(`browserConcurrency must be between 1 and ${Math.min(MAX_CONCURRENCY, virtualUsers)}`);
      if (!Number.isInteger(rampUpMs) || rampUpMs < 0 || rampUpMs > 120000) throw new Error('rampUpMs must be between 0 and 120000');
      if (!Number.isInteger(thinkTimeMs) || thinkTimeMs < 0 || thinkTimeMs > 15000) throw new Error('thinkTimeMs must be between 0 and 15000');
      if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) throw new Error('iterations must be between 1 and 20');
      if (!Array.isArray(input.scenarioIds) || input.scenarioIds.length < 1) throw new Error('Select at least one scenario');
      const selected = input.scenarioIds.map(id => scenarios.find(s => s.id === id)).filter(Boolean);
      if (selected.length !== new Set(input.scenarioIds).size) throw new Error('One or more selected scenarios do not exist');
      if (selected.some(s => !s.enabled)) throw new Error('Disabled scenarios cannot be run');
      const allowWrites = input.allowWrites === true;
      if (selected.some(s => s.writes) && !allowWrites) throw new Error('Selected scenarios write data. Explicitly enable “Allow test-data creation” to continue.');
      if (selected.some(s => s.writes) && virtualUsers > MAX_WRITE_USERS) throw new Error(`Write-enabled production journeys are limited to ${MAX_WRITE_USERS} virtual users per run. Use read-only journeys for larger concurrency.`);
      if (selected.some(s => s.steps.some(step => step.risk === 'destructive'))) throw new Error('Selected scenarios contain destructive steps; destructive actions are not permitted on the published target.');
      const configuredAccounts = parseTestAccounts();
      const selectedAccountRoles = [...new Set(selected.filter(s => s.requiresAccount && s.accountRole).map(s => s.accountRole))];
      if (selectedAccountRoles.length > 1) {
        throw new Error('The selected journeys need different account roles (buyer and seller). Run buyer and seller scenarios in separate batches so each browser session uses the correct QA identity.');
      }
      const accountRole = selectedAccountRoles[0];
      const accounts = accountRole
        ? configuredAccounts.filter(item => item.role === accountRole)
        : configuredAccounts;
      if (selected.some(s => s.requiresAccount)) {
        if (accounts.length < virtualUsers) {
          const roleMessage = accountRole ? ` with role=${accountRole}` : '';
          throw new Error(`Selected scenarios require ${virtualUsers} dedicated test accounts${roleMessage}, but only ${accounts.length} are configured. Add unique accounts to SIMULATOR_TEST_ACCOUNTS or reduce virtual users.`);
        }
        const uniqueEmails = new Set(accounts.map(item => item.email.trim().toLowerCase()));
        if (uniqueEmails.size !== accounts.length) {
          throw new Error('SIMULATOR_TEST_ACCOUNTS contains duplicate email addresses. Use one dedicated account per virtual user.');
        }
      }
      const seedIds = { ad: process.env.SIMULATOR_SEED_AD_ID, seller: process.env.SIMULATOR_SEED_SELLER_ID, product: process.env.SIMULATOR_SEED_PRODUCT_ID, service: process.env.SIMULATOR_SEED_SERVICE_ID };
      for (const [kind, value] of Object.entries(seedIds)) {
        if (value && !/^[a-zA-Z0-9_-]{2,100}$/.test(value)) throw new Error(`SIMULATOR_SEED_${kind.toUpperCase()}_ID must be a simple record id without slashes or query characters.`);
      }
      if (selected.some(s => s.requiresSeedAd) && !process.env.SIMULATOR_SEED_AD_ID) throw new Error('This scenario requires SIMULATOR_SEED_AD_ID on the runner host.');
      if (selected.some(s => s.requiresSeedSeller) && !process.env.SIMULATOR_SEED_SELLER_ID) throw new Error('This scenario requires SIMULATOR_SEED_SELLER_ID on the runner host.');
      if (selected.some(s => s.requiresSeedProduct) && !process.env.SIMULATOR_SEED_PRODUCT_ID) throw new Error('This scenario requires SIMULATOR_SEED_PRODUCT_ID on the runner host.');
      if (selected.some(s => s.requiresSeedService) && !process.env.SIMULATOR_SEED_SERVICE_ID) throw new Error('This scenario requires SIMULATOR_SEED_SERVICE_ID on the runner host.');
      if (selected.some(s => s.id === 'register-test-user')) {
        if (selected.length !== 1) throw new Error('Run account registration as a separate scenario; do not combine it with existing-account journeys.');
        if (iterations !== 1) throw new Error('Account registration scenario supports exactly one iteration per run.');
        // Fail before opening Chromium or creating any data if registration variables are missing.
        getRegistrationCredentials('preflight', 1);
      }

      const options = {
        virtualUsers, browserConcurrency, rampUpMs, thinkTimeMs, iterations,
        viewport: input.viewport || config.viewport,
        targetUrl,
        actionTimeoutMs: config.actionTimeoutMs,
        stopOnFailure: input.stopOnFailure ?? config.stopOnFailure,
        allowWrites
      };
      if (!['desktop', 'mobile'].includes(options.viewport)) throw new Error('viewport must be desktop or mobile');
      const run = createRunRecord(options, selected);
      run.artifactDir = getRunArtifactDirectory(run.id);
      this.runs.set(run.id, run);
      this.activeId = run.id;
      this.starting = false;
      void this.execute(run, selected, accounts);
      return this.serialize(run, { compact: true });
    } catch (error) {
      this.starting = false;
      throw error;
    }
  }
  async execute(run, selected, accounts) {
    const pageLoads = [];
    const apiDurations = [];
    const lcpValues = [];
    let browser;
    run.status = 'running';
    try {
      browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
      let nextUser = 0;
      const workers = Array.from({ length: run.options.browserConcurrency }, async () => {
        while (!run.stopRequested) {
          const userIndex = nextUser++;
          if (userIndex >= run.options.virtualUsers) return;
          await sleep(run.options.rampUpMs ? Math.round((userIndex / Math.max(1, run.options.virtualUsers - 1)) * run.options.rampUpMs) : 0);
          if (run.stopRequested) return;
          const userStatus = await this.executeUser(run, selected, accounts, userIndex, browser, pageLoads, apiDurations, lcpValues);
          if (run.options.stopOnFailure && userStatus === 'failed') {
            run.stopRequested = true;
            return;
          }
        }
      });
      await Promise.all(workers);
      run.status = run.stopRequested ? 'stopped' : (run.summary.usersFailed > 0 ? 'completed_with_errors' : 'completed');
    } catch (error) {
      run.status = run.stopRequested ? 'stopped' : 'failed';
      run.errors.push({ at: new Date().toISOString(), message: (error instanceof Error ? error.message : String(error)).slice(0, 700), stage: 'runner' });
    } finally {
      if (browser) await browser.close().catch(() => undefined);
      run.finishedAt = new Date().toISOString();
      summarize(run, pageLoads, apiDurations, lcpValues);
      delete run.artifactDir;
      await saveReport(this.serialize(run)).catch(error => {
        run.errors.push({ at: new Date().toISOString(), stage: 'report', message: `Could not persist report: ${String(error).slice(0, 300)}` });
      });
      if (this.activeId === run.id) this.activeId = null;
    }
  }

  async executeUser(run, scenarios, accounts, userIndex, browser, pageLoads, apiDurations, lcpValues) {
    const userLabel = `user-${String(userIndex + 1).padStart(3, '0')}`;
    const record = { user: userLabel, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, scenarios: [], errors: [] };
    run.users.push(record);
    run.summary.usersStarted += 1;
    let context;
    let page;
    let credentials = null;
    try {
      const device = run.options.viewport === 'mobile' ? devices['Pixel 7'] : null;
      context = await browser.newContext(device ? {
        viewport: device.viewport,
        deviceScaleFactor: device.deviceScaleFactor,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        userAgent: device.userAgent,
        locale: 'ar-PS'
      } : { viewport: { width: 1440, height: 900 }, locale: 'ar-PS' });
      page = await context.newPage();
      page.setDefaultTimeout(run.options.actionTimeoutMs);
      page.on('console', message => {
        if (message.type() === 'error') {
          run.summary.consoleErrors += 1;
          if (run.errors.length < 1000) run.errors.push({ at: new Date().toISOString(), user: userLabel, kind: 'console', message: message.text().slice(0, 500), path: safePath(page.url()) });
        }
      });
      page.on('pageerror', error => {
        run.summary.pageErrors += 1;
        if (run.errors.length < 1000) run.errors.push({ at: new Date().toISOString(), user: userLabel, kind: 'pageerror', message: error.message.slice(0, 500), path: safePath(page.url()) });
      });
      const apiRequestRows = new WeakMap();
      page.on('requestfailed', request => {
        const url = safePath(request.url());
        if (!url.includes('/api/')) return;
        const existing = apiRequestRows.get(request);
        if (existing) {
          existing.failed = true;
          existing.failure = request.failure()?.errorText?.slice(0, 250) || 'request failed';
        } else if (run.apiRequests.length < 5000) {
          run.apiRequests.push({ at: new Date().toISOString(), user: userLabel, method: request.method(), url, status: 0, failed: true, failure: request.failure()?.errorText?.slice(0, 250) || 'request failed' });
        }
      });
      page.on('response', response => {
        const request = response.request();
        const url = safePath(response.url());
        if (!url.includes('/api/')) return;
        const row = { at: new Date().toISOString(), user: userLabel, method: request.method(), url, status: response.status(), durationMs: null };
        if (run.apiRequests.length < 5000) {
          run.apiRequests.push(row);
          apiRequestRows.set(request, row);
        }
      });
      page.on('requestfinished', request => {
        const row = apiRequestRows.get(request);
        if (!row) return;
        const timing = request.timing();
        const durationMs = Number.isFinite(timing.responseEnd) && timing.responseEnd >= 0 && Number.isFinite(timing.requestStart)
          ? Math.max(0, Math.round(timing.responseEnd - timing.requestStart))
          : null;
        row.durationMs = durationMs;
        if (durationMs != null) apiDurations.push(durationMs);
      });
      // Keep top-level browser navigation on the explicitly allowlisted MarketPlat origin.
      await context.route('**/*', async route => {
        const request = route.request();
        if (request.isNavigationRequest()) {
          const url = new URL(request.url());
          if (url.origin !== run.options.targetUrl) return route.abort('blockedbyclient');
        }
        return route.continue();
      });

      if (scenarios.some(scenario => scenario.requiresAccount)) {
        credentials = accounts[userIndex];
        const authScenario = { id: '__automatic-login__', name: 'تسجيل الدخول التلقائي لحساب الاختبار', iterations: [] };
        record.scenarios.push(authScenario);
        const authIteration = { iteration: 1, status: 'running', startedAt: new Date().toISOString(), finishedAt: null };
        authScenario.iterations.push(authIteration);
        const authVars = {
          user: userIndex + 1,
          runId: run.id,
          name: `MarketPlat QA ${run.id.slice(-5)}-${userIndex + 1}`,
          email: credentials.email,
          password: credentials.password,
          accountEmail: credentials.email,
          accountPassword: credentials.password,
          seedAdId: process.env.SIMULATOR_SEED_AD_ID || '',
          seedSellerId: process.env.SIMULATOR_SEED_SELLER_ID || '',
          seedProductId: process.env.SIMULATOR_SEED_PRODUCT_ID || '',
          seedServiceId: process.env.SIMULATOR_SEED_SERVICE_ID || ''
        };
        try {
          const authSteps = [
            { type: 'goto', value: '/login', label: 'فتح تسجيل الدخول' },
            { type: 'fill', selector: '#email', value: '{accountEmail}', label: 'إدخال بريد حساب QA' },
            { type: 'fill', selector: '#password', value: '{accountPassword}', label: 'إدخال كلمة مرور حساب QA' },
            { type: 'clickRole', role: 'button', name: 'تسجيل الدخول', exact: true, label: 'تسجيل الدخول' },
            { type: 'expectNotUrl', contains: '/login', settleMs: 900, label: 'التحقق من نجاح الدخول' }
          ];
          for (const step of authSteps) {
            await executeStep({ page, step, vars: authVars, baseUrl: run.options.targetUrl, timeoutMs: run.options.actionTimeoutMs, run, userLabel, scenarioId: authScenario.id, iteration: 1, pageLoads, lcpValues });
          }
          authIteration.status = 'passed';
        } catch (error) {
          authIteration.status = 'failed';
          authIteration.error = (error instanceof Error ? error.message : String(error)).slice(0, 700);
          record.errors.push({ scenarioId: authScenario.id, iteration: 1, message: authIteration.error });
          throw error;
        } finally {
          authIteration.finishedAt = new Date().toISOString();
        }
      }

      for (const scenario of scenarios) {
        if (run.stopRequested) break;
        const scenarioRecord = { id: scenario.id, name: scenario.name, iterations: [] };
        record.scenarios.push(scenarioRecord);
        for (let iteration = 1; iteration <= run.options.iterations; iteration += 1) {
          if (run.stopRequested) break;
          const iterationRecord = { iteration, status: 'running', startedAt: new Date().toISOString(), finishedAt: null };
          scenarioRecord.iterations.push(iterationRecord);
          if (scenario.id === 'register-test-user') credentials = getRegistrationCredentials(run.id, userIndex + 1, iteration);
          if (scenario.requiresAccount) credentials = accounts[userIndex];
          const vars = {
            user: userIndex + 1,
            runId: run.id,
            name: `MarketPlat QA ${run.id.slice(-5)}-${userIndex + 1}`,
            email: credentials?.email || '',
            password: credentials?.password || '',
            accountEmail: credentials?.email || '',
            accountPassword: credentials?.password || '',
            seedAdId: process.env.SIMULATOR_SEED_AD_ID || '',
            seedSellerId: process.env.SIMULATOR_SEED_SELLER_ID || '',
            seedProductId: process.env.SIMULATOR_SEED_PRODUCT_ID || '',
            seedServiceId: process.env.SIMULATOR_SEED_SERVICE_ID || '',
            customerName: `MarketPlat QA Customer ${run.id.slice(-5)}-${userIndex + 1}-${iteration}`,
            savedSearchLabel: `MarketPlat QA Search ${run.id.slice(-5)}-${userIndex + 1}-${iteration}`,
            testMessage: `MarketPlat QA Message ${run.id.slice(-5)}-${userIndex + 1}-${iteration}`,
            adTitle: `MarketPlat QA Ad ${run.id.slice(-5)}-${userIndex + 1}-${iteration}`,
            productName: `MarketPlat QA Product ${run.id.slice(-5)}-${userIndex + 1}-${iteration}`,
            serviceTitle: `MarketPlat QA Service ${run.id.slice(-5)}-${userIndex + 1}-${iteration}`
          };
          try {
            for (const step of scenario.steps) {
              if (run.stopRequested) throw new Error('Run stopped by administrator');
              await executeStep({ page, step, vars, baseUrl: run.options.targetUrl, timeoutMs: run.options.actionTimeoutMs, run, userLabel, scenarioId: scenario.id, iteration, pageLoads, lcpValues });
              if (run.options.thinkTimeMs) await sleep(run.options.thinkTimeMs);
            }
            iterationRecord.status = 'passed';
          } catch (error) {
            iterationRecord.status = run.stopRequested ? 'stopped' : 'failed';
            iterationRecord.error = (error instanceof Error ? error.message : String(error)).slice(0, 700);
            record.errors.push({ scenarioId: scenario.id, iteration, message: iterationRecord.error });
            const shot = path.join(run.artifactDir, `${userLabel}-${scenario.id}-${iteration}-failure.png`);
            await fs.mkdir(run.artifactDir, { recursive: true }).catch(() => undefined);
            await page.screenshot({ path: shot, fullPage: true, timeout: 5000 }).then(() => run.artifacts.push({ type: 'screenshot', name: path.basename(shot), user: userLabel, scenarioId: scenario.id })).catch(() => undefined);
            if (run.options.stopOnFailure) throw error;
            break;
          } finally {
            iterationRecord.finishedAt = new Date().toISOString();
          }
        }
      }
      record.status = record.errors.length ? 'failed' : run.stopRequested ? 'stopped' : 'completed';
    } catch (error) {
      record.status = run.stopRequested ? 'stopped' : 'failed';
      record.errors.push({ message: (error instanceof Error ? error.message : String(error)).slice(0, 700) });
    } finally {
      if (context) await context.close().catch(() => undefined);
      record.finishedAt = new Date().toISOString();
      if (record.status === 'failed') run.summary.usersFailed += 1;
      else if (record.status === 'completed') run.summary.usersCompleted += 1;
      return record.status;
    }
  }

  stop(id) {
    const run = this.runs.get(id);
    if (!run || !['queued', 'running'].includes(run.status)) return null;
    run.stopRequested = true;
    run.status = 'stopping';
    return this.serialize(run, { compact: true });
  }

  serialize(run, { compact = false } = {}) {
    const clone = structuredClone(run);
    delete clone.stopRequested;
    delete clone.artifactDir;
    if (compact) {
      clone.operations = clone.operations.slice(-200);
      clone.apiRequests = clone.apiRequests.slice(-300);
      clone.errors = clone.errors.slice(-100);
      clone.users = clone.users.slice(-MAX_USERS);
    }
    return clone;
  }
}

export const runManager = new RunManager();
