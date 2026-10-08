#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const hooks = root;
const ignored = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__', 'scripts', 'e2e']);
function walk(dir) {
  const out=[];
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if (ignored.has(e.name)) continue;
    const p=path.join(dir,e.name);
    if(e.isDirectory()) out.push(...walk(p)); else if(/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files=walk(hooks);
const rows=[];
const re=/invalidateQueries\(\{\s*queryKey:\s*([^}\n]+)\}\)/g;
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  let m; while((m=re.exec(text))){
    const key=m[1].trim();
    const broad=/\[['"][^,\]]+['"]\]/.test(key) || /\.all\(\)/.test(key);
    rows.push({file:path.relative(root,file), key, broad});
  }
}
const broadRows=rows.filter(r=>r.broad);
console.log(`invalidateQueries total: ${rows.length}`);
console.log(`broad/root invalidations: ${broadRows.length}`);
console.log('');
for(const r of broadRows) console.log(`${r.file} :: ${r.key}`);
