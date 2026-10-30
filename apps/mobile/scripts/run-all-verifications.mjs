#!/usr/bin/env node
/**
 * Runs every scripts/verify-*.mjs sequentially and prints a summary.
 * Replaces the 5000-character inline test command in package.json.
 */
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(__dirname))
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
  .sort();

if (files.length === 0) {
  console.log('⚠️  No active verify-*.mjs scripts found.');
  process.exit(1);
}

let legacyCount = 0;
try {
  const legacyManifest = JSON.parse(await readFile(join(__dirname, 'legacy-verifications', 'manifest.json'), 'utf8'));
  legacyCount = Array.isArray(legacyManifest.entries) ? legacyManifest.entries.length : 0;
} catch {
  console.warn('⚠️  Legacy verification manifest missing; quarantine status cannot be summarized.');
}

console.log(`\nActive verification checks: ${files.length}`);
console.log(`Quarantined historical checks (not counted as passed): ${legacyCount}`);
console.log('The quarantined scripts are preserved in scripts/legacy-verifications/ with diagnosis metadata.\n');

let passed = 0;
const failures = [];

for (const f of files) {
  process.stdout.write(`  ${f.padEnd(58)} `);
  const { code, output } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, f)], {
      stdio: 'pipe',
      timeout: 30_000,
      killSignal: 'SIGTERM',
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, output: out }));
  });
  if (code === 0) {
    console.log('✅');
    passed += 1;
  } else {
    console.log('❌');
    failures.push({ file: f, output });
  }
}

const failed = failures.length;
console.log(`\n${'═'.repeat(70)}`);
console.log(`  Active: ${files.length}  |  ✅ ${passed}  |  ❌ ${failed}  |  Quarantined historical (not passed): ${legacyCount}`);
console.log(`${'═'.repeat(70)}\n`);

if (failed > 0) {
  for (const { file, output } of failures) {
    console.log(`\n❌ ${file}:\n${'-'.repeat(70)}`);
    console.log(output.split('\n').slice(-25).join('\n'));
    console.log('-'.repeat(70));
  }
  process.exit(1);
}
