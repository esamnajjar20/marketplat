#!/usr/bin/env node
/**
 * Builds @marketplat/contracts without requiring pnpm.
 *
 * The web app (frontend/) is installed with npm (e.g. on Cloudflare), where
 * `pnpm --filter ...` fails and the contracts package has no node_modules yet.
 * - If the workspace already installed contracts' devDependencies (pnpm/Codespace),
 *   only compile.
 * - Otherwise install the two pinned deps with npm first, then compile.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = join(root, 'packages', 'contracts');
const tscBin = join(contracts, 'node_modules', 'typescript', 'bin', 'tsc');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: contracts, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[build-contracts] failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(tscBin)) {
  console.log('[build-contracts] installing contracts dependencies with npm');
  run(npm, ['install', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts']);
}

run(process.execPath, [tscBin, '-p', 'tsconfig.build.json']);
