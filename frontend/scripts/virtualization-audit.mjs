import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = ['components', 'app', 'hooks'];
const mapPattern = /\.map\s*\(\s*\([^)]*\)\s*=>/g;
const listWords = /(list|table|rows|items|messages|notifications|conversations|products|ads|stores|services)/i;

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
}
for (const rootDir of roots) walk(path.join(root, rootDir));

const candidates = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!mapPattern.test(text)) continue;
  mapPattern.lastIndex = 0;
  const rel = path.relative(root, file);
  if (listWords.test(rel) || listWords.test(text.slice(0, 1200))) {
    const count = (text.match(mapPattern) || []).length;
    candidates.push(`${rel}\tmap-expressions=${count}`);
  }
}

console.log('R14 virtualization candidates (static; no runtime-size claim):');
console.log(candidates.sort().join('\n') || 'none');
console.log('\nDecision rule: profile real row counts/DOM/layout first; do not add virtualization from static source alone.');
