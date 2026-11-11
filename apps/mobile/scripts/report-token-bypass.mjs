#!/usr/bin/env node
// تقرير غير حاجب: أين تتجاوز الشاشات tokens (أرقام مباشرة للمسافات/الزوايا/الخطوط)،
// وأين يُستخدم TextInput خام بدل Field. يُستخدم لتتبّع التقدّم أثناء الترحيل التدريجي.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['android', 'node_modules', '.expo', 'assets', 'scripts', '__tests__']);
const checks = {
  'borderRadius رقمي': /borderRadius:\s*\d+/g,
  'padding/margin رقمي': /\b(?:padding|margin)(?:Horizontal|Vertical|Top|Bottom)?:\s*\d+/g,
  'fontSize رقمي': /fontSize:\s*\d+/g,
  'TextInput خام': /<TextInput\b/g,
  'style inline': /style=\{\{/g,
};
const totals = Object.fromEntries(Object.keys(checks).map((k) => [k, { n: 0, files: new Map() }]));

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!skip.has(e.name) && !e.name.startsWith('.')) await walk(p); }
    else if (['.ts', '.tsx'].includes(extname(e.name)) && !p.endsWith('tokens.ts')) {
      const text = await readFile(p, 'utf8');
      for (const [label, re] of Object.entries(checks)) {
        const c = (text.match(re) || []).length;
        if (c) { totals[label].n += c; totals[label].files.set(relative(root, p), c); }
      }
    }
  }
}
await walk(join(root, 'app'));
await walk(join(root, 'src'));
for (const [label, { n, files }] of Object.entries(totals)) {
  console.log(`\n${label}: ${n} في ${files.size} ملف`);
  [...files].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([f, c]) => console.log(`  ${String(c).padStart(4)}  ${f}`));
}
