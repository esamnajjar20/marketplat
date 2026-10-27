#!/usr/bin/env node
/**
 * Runs every scripts/verify-*.mjs sequentially and prints a summary.
 * Replaces the 5000-character inline test command in package.json.
 */
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(__dirname))
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
  .sort();

if (files.length === 0) {
  console.log('⚠️  No verify-*.mjs scripts found.');
  process.exit(0);
}

console.log(`\nRunning ${files.length} verification scripts...\n`);

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
console.log(`  Total: ${files.length}  |  ✅ ${passed}  |  ❌ ${failed}`);
console.log(`${'═'.repeat(70)}\n`);

if (failed > 0) {
  for (const { file, output } of failures) {
    console.log(`\n❌ ${file}:\n${'-'.repeat(70)}`);
    console.log(output.split('\n').slice(-25).join('\n'));
    console.log('-'.repeat(70));
  }
  process.exit(1);
}
