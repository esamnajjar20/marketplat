#!/usr/bin/env node
/**
 * Fails if any raw #hex color appears under app/ or src/components/
 * (except documentation comments). Theme tokens live only in src/theme/tokens.ts.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HEX = /#[0-9A-Fa-f]{3,8}\b/g;
const SCAN = [join(root, 'app'), join(root, 'src', 'components')];

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walk(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const scanRoot of SCAN) {
  for (const file of await walk(scanRoot)) {
    const rel = relative(root, file).replace(/\\/g, '/');
    const content = await readFile(file, 'utf8');
    content.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      const matches = line.match(HEX);
      if (!matches) return;
      for (const m of matches) {
        violations.push({ file: rel, line: i + 1, match: m, snippet: trimmed.slice(0, 100) });
      }
    });
  }
}

if (violations.length === 0) {
  console.log('✅ No raw hex colors in app/ or src/components.');
  process.exit(0);
}

console.error(`❌ ${violations.length} raw hex color(s):\n`);
for (const v of violations.slice(0, 60)) {
  console.error(`  ${v.file}:${v.line}  ${v.match}  →  ${v.snippet}`);
}
process.exit(1);
