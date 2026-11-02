import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Run an npm job and forward scheduler cancellation to the active child. */
export function runChildJob(name: string, scheduledFor?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', name], {
      stdio: 'inherit',
      env: scheduledFor ? { ...process.env, MARKETPLAT_SCHEDULED_FOR: scheduledFor } : process.env,
    });
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      if (error) reject(error);
      else resolve();
    };
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill(signal);
      // A stuck child must not keep a cancelled GitHub/Render job alive forever.
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 10_000);
      forceKillTimer.unref();
    };
    const onSigint = () => forwardSignal('SIGINT');
    const onSigterm = () => forwardSignal('SIGTERM');

    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    child.once('error', error => finish(error));
    child.once('close', (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(`Scheduled job ${name} failed: ${signal ?? `exit code ${code}`}`));
    });
  });
}

/** Run every due child even when one fails, then fail the parent invocation so
 * CI/monitoring records an unhealthy run instead of silently accepting it. */
export async function runChildJobsIndependently(names: string[], label: string): Promise<void> {
  const failures: Array<{ name: string; error: unknown }> = [];
  let interrupted = false;
  const markInterrupted = () => { interrupted = true; };
  process.on('SIGINT', markInterrupted);
  process.on('SIGTERM', markInterrupted);
  try {
    for (const name of names) {
      if (interrupted) break;
      try {
        await runChildJob(name);
      } catch (error) {
        failures.push({ name, error });
        console.error(`[${label}] job failed; continuing with remaining jobs`, {
          job: name,
          error: error instanceof Error ? error.message : String(error),
        });
        // Never launch a new child after the host asked this runner to stop.
        if (interrupted) break;
      }
    }
  } finally {
    process.off('SIGINT', markInterrupted);
    process.off('SIGTERM', markInterrupted);
  }

  if (interrupted) {
    throw new Error(`${label}: interrupted by SIGINT/SIGTERM; remaining jobs were not started`);
  }
  if (failures.length > 0) {
    const namesText = failures.map(item => item.name).join(', ');
    throw new Error(`${label}: ${failures.length} of ${names.length} jobs failed (${namesText})`);
  }
}

/**
 * Production API adapter for the Go-owned scheduler. The Go scheduler sends
 * only an allowlisted job name; the API launches the already-compiled script
 * directly (not ts-node-dev/npm) so production installs do not need dev tools.
 */
const PRODUCTION_SCHEDULED_JOB_SCRIPTS: Readonly<Record<string, string>> = Object.freeze({
  'report:expire-ads': 'expireAds',
  'report:notification-digest': 'dailyNotificationDigest',
  'report:seller-response-metrics': 'updateSellerResponseMetrics',
  'report:cleanup-tokens': 'cleanupExpiredTokens',
  'report:cleanup-failed-tasks': 'cleanupFailedBackgroundTasks',
  'report:cleanup-notifications': 'cleanupOldNotifications',
  'report:cleanup-stories': 'cleanupExpiredStories',
  'report:cleanup-media-assets': 'cleanupMediaAssets',
  'report:analytics-rollup': 'rollupAnalytics',
  'report:inventory-monitor': 'inventoryMonitor',
  'report:fraud-monitor': 'fraudMonitor',
  'report:expire-service-requests': 'expireStaleServiceRequests',
  'report:cleanup-analytics': 'cleanupAnalytics',
  'report:demote-stale-boosts': 'demoteStaleAdBoosts',
  'report:weekly-ad-views': 'weeklyAdViewsReport',
  'report:weekly-store-views': 'weeklyStoreViewsReport',
  'report:weekly-service-views': 'weeklyServiceViewsReport',
  'report:expire-open-requests': 'expireOpenRequests',
});

export function getProductionScheduledJobScript(name: string): string | null {
  return Object.prototype.hasOwnProperty.call(PRODUCTION_SCHEDULED_JOB_SCRIPTS, name)
    ? PRODUCTION_SCHEDULED_JOB_SCRIPTS[name]
    : null;
}

export function runProductionScheduledJob(name: string, scheduledFor: string, signal?: AbortSignal): Promise<void> {
  const scriptName = getProductionScheduledJobScript(name);
  if (!scriptName) return Promise.reject(new Error(`Unsupported scheduled job: ${name}`));

  // This module is emitted to dist/scripts by `npm run build`; the job modules
  // are emitted beside it with the same stable basename.
  const scriptPath = resolve(__dirname, `${scriptName}.js`);
  if (!existsSync(scriptPath)) {
    return Promise.reject(new Error(`Compiled scheduled job is missing: ${scriptName}.js`));
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Scheduled job cancelled before start'));
      return;
    }

    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, MARKETPLAT_SCHEDULED_FOR: scheduledFor },
      stdio: 'inherit',
    });
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      signal?.removeEventListener('abort', abortChild);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abortChild = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      // The API request may be cancelled by Go or the caller. Do not leave a
      // child process alive indefinitely if it does not handle SIGTERM.
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 10_000);
      forceKillTimer.unref();
    };

    signal?.addEventListener('abort', abortChild, { once: true });
    child.once('error', error => finish(error));
    child.once('close', (code, childSignal) => {
      if (code === 0) finish();
      else finish(new Error(`Scheduled job ${name} failed: ${childSignal ?? `exit code ${code}`}`));
    });
  });
}
