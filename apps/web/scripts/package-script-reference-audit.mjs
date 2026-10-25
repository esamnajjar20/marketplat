/** Validate package scripts without requiring dependencies to be installed. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const missing = [];
const scripts = pkg.scripts ?? {};
for (const [name, command] of Object.entries(scripts)) {
  for (const ref of command.matchAll(/npm run ([\w:.-]+)/g)) {
    if (!Object.hasOwn(scripts, ref[1])) missing.push({ name, ref: `npm run ${ref[1]}` });
  }
  const refs = [...command.matchAll(/(?:node|playwright test)\s+([^ &]+)/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (ref.startsWith('scripts/') && !fs.existsSync(path.join(root, ref))) {
      missing.push({ name, ref });
    }
  }
}
if (missing.length) {
  for (const item of missing) console.error(`FAIL ${item.name} references missing file ${item.ref}`);
  process.exitCode = 1;
} else {
  console.log(`PASS package script file and npm-run references exist (${Object.keys(scripts).length} scripts checked)`);
}
