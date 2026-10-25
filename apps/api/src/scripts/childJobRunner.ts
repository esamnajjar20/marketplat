import { spawn } from 'node:child_process';

/** Run an npm job and forward scheduler cancellation to the active child. */
export function runChildJob(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', name], { stdio: 'inherit', env: process.env });
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      if (error) reject(error);
      else resolve();
    };
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
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
