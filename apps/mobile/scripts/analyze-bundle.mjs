#!/usr/bin/env node
/**
 * يبني حزمة Android عبر `expo export` ويطبع أحجام الملفات الأكبر (بدون أي اعتماد إضافي).
 * الاستعمال:  pnpm --filter @marketplat/mobile analyze:bundle
 * قارن الأرقام قبل/بعد أي تغيير كبير في الاعتماديات. للتفصيل الداخلي للحزمة استخدم
 * `npx react-native-bundle-visualizer` أو source-map-explorer على ملف .map الناتج.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-analyze');
rmSync(out, { recursive: true, force: true });

const run = spawnSync('npx', ['expo', 'export', '--platform', 'android', '--dump-sourcemap', '--output-dir', out], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (run.status !== 0) {
  console.error('expo export failed');
  process.exit(run.status ?? 1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else files.push({ file: relative(out, full), bytes: st.size });
  }
})(out);

files.sort((a, b) => b.bytes - a.bytes);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log('\nLargest exported files:');
for (const f of files.slice(0, 15)) console.log(`${kb(f.bytes).padStart(12)}  ${f.file}`);
const bundle = files.find((f) => /\.(hbc|js)$/.test(f.file) && !f.file.endsWith('.map'));
if (bundle) console.log(`\nMain JS bundle: ${bundle.file} = ${kb(bundle.bytes)}`);
console.log(`Total export size: ${kb(files.reduce((n, f) => n + f.bytes, 0))}`);
rmSync(out, { recursive: true, force: true });
