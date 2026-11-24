#!/usr/bin/env node
/**
 * Builds the Android Expo export, reports distributable payload sizes, and
 * enforces the checked-in absolute budgets. Source maps are excluded because
 * they are diagnostics, not part of the distributable application payload.
 * Usage: pnpm --filter @marketplat/mobile analyze:bundle
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateMobileBundleBudget } from '../src/lib/bundle-budget-policy.ts';

type BundleBudgetConfig = {
  version: number;
  platform: string;
  maxMainBundleBytes: number;
  maxExportedPayloadBytes: number;
  warningRatio?: number;
  measurement?: string;
};

type ExportedFile = { file: string; bytes: number };

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-analyze');
const budgetPath = join(root, 'scripts', 'bundle-budget.json');
const reportPath = join(root, '.bundle-analysis', 'android-bundle-report.json');
let exitCode = 0;

function walk(dir: string, files: ExportedFile[] = []): ExportedFile[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, files);
    else files.push({ file: relative(out, full), bytes: info.size });
  }
  return files;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MiB`;
}

try {
  const budget = JSON.parse(readFileSync(budgetPath, 'utf8')) as BundleBudgetConfig;
  if (budget.version !== 1 || budget.platform !== 'android') {
    throw new Error(`Unsupported bundle budget file: ${budgetPath}`);
  }

  rmSync(out, { recursive: true, force: true });
  const run = spawnSync('npx', [
    '--no-install',
    'expo', 'export',
    '--platform', 'android',
    '--dump-sourcemap',
    '--output-dir', out,
  ], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`expo export failed with exit status ${run.status ?? 'unknown'}`);

  const allFiles = walk(out);
  const distributableFiles = allFiles.filter((file) => !file.file.toLowerCase().endsWith('.map'));
  const bundleFiles = distributableFiles.filter((file) => /\.(?:hbc|bundle|js)$/i.test(file.file));
  if (bundleFiles.length === 0) throw new Error('No Android JavaScript bundle (.hbc, .bundle, or .js) was found in the Expo export.');

  const mainBundleBytes = bundleFiles.reduce((total, file) => total + file.bytes, 0);
  const exportedPayloadBytes = distributableFiles.reduce((total, file) => total + file.bytes, 0);
  const budgetResult = evaluateMobileBundleBudget({ mainBundleBytes, exportedPayloadBytes }, budget);
  const largestFiles = [...distributableFiles].sort((a, b) => b.bytes - a.bytes).slice(0, 15);

  const report = {
    platform: 'android',
    generatedAt: new Date().toISOString(),
    mainBundleFiles: bundleFiles,
    mainBundleBytes,
    exportedPayloadBytes,
    sourceMapBytesExcluded: allFiles
      .filter((file) => file.file.toLowerCase().endsWith('.map'))
      .reduce((total, file) => total + file.bytes, 0),
    budget: {
      maxMainBundleBytes: budget.maxMainBundleBytes,
      maxExportedPayloadBytes: budget.maxExportedPayloadBytes,
      warningRatio: budget.warningRatio ?? 0.85,
      measurement: budget.measurement ?? null,
    },
    warnings: budgetResult.warnings,
    errors: budgetResult.errors,
    largestFiles,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\nAndroid bundle analysis');
  console.log(`Main JS bundle (${bundleFiles.length} file(s)): ${formatBytes(mainBundleBytes)}`);
  console.log(`Exported payload (excluding source maps): ${formatBytes(exportedPayloadBytes)}`);
  console.log(`Report: ${reportPath}`);
  console.log('\nLargest exported files:');
  for (const file of largestFiles) console.log(`${formatBytes(file.bytes).padStart(12)}  ${file.file}`);

  for (const warning of budgetResult.warnings) console.warn(`::warning::${warning}`);
  for (const error of budgetResult.errors) console.error(`::error::${error}`);
  if (budgetResult.errors.length > 0) exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exitCode = exitCode;
