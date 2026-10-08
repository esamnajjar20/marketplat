#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dirs = ['hooks/mutations', 'hooks/queries', 'components'];
const files = [];
for (const dir of dirs) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(abs);
}

const rows = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const re = /invalidateQueries\(\s*\{\s*queryKey:\s*([^}]+?)\}\s*\)/g;
  let m;
  while ((m = re.exec(source))) {
    const expr = m[1].replace(/\s+/g, ' ').trim();
    const line = source.slice(0, m.index).split('\n').length;
    const broad = /(?:\.all\(\)|\[\s*['"][^'"]+['"]\s*\])$/.test(expr) || /^\[[^\]]+\]$/.test(expr);
    rows.push({ file: path.relative(root, file), line, expr, broad });
  }
}

const broad = rows.filter((r) => r.broad);
const byRoot = new Map();
for (const row of broad) {
  const rootName = (row.expr.match(/['"]([^'"]+)['"]/) || [,'unknown'])[1];
  byRoot.set(rootName, (byRoot.get(rootName) ?? 0) + 1);
}

console.log(`invalidateQueries: ${rows.length}`);
console.log(`potential broad/root expressions: ${broad.length}`);
console.log('\nBroad candidates by root:');
for (const [name, count] of [...byRoot.entries()].sort((a,b) => b[1]-a[1])) {
  console.log(`- ${name}: ${count}`);
}
console.log('\nSemantic review rule: do not narrow a root invalidation unless the mutation is proven unable to affect sibling list/filter/detail queries.');
console.log('This audit is intentionally evidence-oriented; it does not rewrite invalidations automatically.');
