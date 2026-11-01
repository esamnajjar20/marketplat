import { spawn } from 'node:child_process';

/** Run an npm job and forward scheduler cancellation to the active child. */
export function runChildJob(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', name], { stdio: 'inherit', env: process.env });
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
