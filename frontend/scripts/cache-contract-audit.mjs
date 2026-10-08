import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const contract = JSON.parse(read('shared/cache/cache-contract.json'));
const errors = [];
const scopes = new Set(['public', 'personal', 'private']);
const names = new Set();
for (const [name, d] of Object.entries(contract.domains ?? {})) {
  if (names.has(name)) errors.push(`duplicate domain ${name}`); names.add(name);
  if (!d.namespace || !d.policy || !scopes.has(d.scope)) errors.push(`incomplete domain ${name}`);
  if (!Array.isArray(d.queryPrefixes)) errors.push(`missing queryPrefixes ${name}`);
  for (const prefix of d.queryPrefixes ?? []) if (!Array.isArray(prefix) || !prefix.length) errors.push(`invalid query prefix ${name}`);
}
for (const rule of contract.invalidation ?? []) {
  if (!rule.prefixes?.length || !rule.domains?.length) errors.push('empty invalidation rule');
  for (const prefix of rule.prefixes) if (typeof prefix !== 'string' || !prefix.startsWith('/')) errors.push(`bad route prefix ${prefix}`);
  for (const domain of rule.domains) if (!contract.domains[domain]) errors.push(`unknown invalidation domain ${domain}`);
}
for (const file of ['frontend/lib/cache/cache-contract.json','backend/src/shared/cache/cache-contract.json']) if (read(file) !== JSON.stringify(contract,null,2)+'\n') errors.push(`stale contract copy ${file}`);
if (errors.length) { for (const e of errors) console.error(`[cache-contract-audit] FAIL: ${e}`); process.exit(1); }
console.log(`[cache-contract-audit] PASS domains=${names.size} rules=${contract.invalidation.length}`);
