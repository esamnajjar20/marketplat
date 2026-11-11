import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const command = (name) => windows ? `${name}.cmd` : name;
const processes = [];
let shuttingDown = false;

const tasks = [
  { name: 'frontend', bin: 'npm', args: ['run', 'dev', '--prefix', 'frontend'] },
  { name: 'api', bin: 'pnpm', args: ['--filter', 'classifieds-platform-backend', 'dev'] },
  { name: 'mobile', bin: 'pnpm', args: ['--filter', '@marketplat/mobile', 'dev'] },
];

function stopAll(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 250).unref();
}

for (const task of tasks) {
  const child = spawn(command(task.bin), task.args, {
    cwd: root,
    stdio: 'inherit',
    shell: windows,
    env: process.env,
  });
  processes.push(child);
  child.once('error', (error) => {
    console.error(`[dev:all] Unable to start ${task.name}: ${error.message}`);
    stopAll(1);
  });
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[dev:all] ${task.name} exited (${signal ?? code ?? 'unknown'}); stopping sibling services.`);
      stopAll(typeof code === 'number' && code !== 0 ? code : 1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(0));
}
