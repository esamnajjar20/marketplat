// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const contract = JSON.parse(read('shared/cache/cache-contract.json'));
const policy = JSON.parse(read('shared/cache-policy.json'));
const errors = [];
const scopes = new Set(['public', 'personal', 'private']);
const names = new Set();
for (const domain of ['publicLive', 'publicDetail', 'publicHome', 'recommendations', 'reference']) {
  const grace = policy[domain]?.offline?.staleGraceMs;
  if (!Number.isInteger(grace) || grace < 0 || grace > 7 * 24 * 60 * 60 * 1000) {
    errors.push(`invalid offline stale grace for ${domain}`);
  }
}
for (const [name, d] of Object.entries(contract.domains ?? {})) {
  if (names.has(name)) errors.push(`duplicate domain ${name}`); names.add(name);
  if (!d.namespace || !d.policy || !policy[d.policy] || !scopes.has(d.scope)) errors.push(`incomplete domain ${name}`);
  if (!Array.isArray(d.queryPrefixes)) errors.push(`missing queryPrefixes ${name}`);
  for (const prefix of d.queryPrefixes ?? []) if (!Array.isArray(prefix) || !prefix.length) errors.push(`invalid query prefix ${name}`);
}
for (const rule of contract.invalidation ?? []) {
  if (!rule.prefixes?.length || !rule.domains?.length) errors.push('empty invalidation rule');
  for (const prefix of rule.prefixes) if (typeof prefix !== 'string' || !prefix.startsWith('/')) errors.push(`bad route prefix ${prefix}`);
  for (const domain of rule.domains) if (!contract.domains[domain]) errors.push(`unknown invalidation domain ${domain}`);
}

for (const rule of contract.mobileMutationInvalidation ?? []) {
  if (typeof rule.route !== 'string' || !rule.route.startsWith('^/api/v1/')) errors.push('invalid mobile mutation route pattern');
  if (!Array.isArray(rule.privatePrefixes) || !Array.isArray(rule.publicPrefixes)) errors.push('mobile mutation rule must declare private and public prefixes');
  for (const prefix of [...(rule.privatePrefixes ?? []), ...(rule.publicPrefixes ?? [])]) {
    if (typeof prefix !== 'string' || !prefix.length) errors.push(`invalid mobile mutation cache prefix ${prefix}`);
  }
}
if (!contract.mobileMutationInvalidation?.length) errors.push('missing mobile mutation invalidation rules');
if (contract.version !== 3) errors.push('expected cache contract v3');
const mutationTags = contract.publicMutationTags;
if (!mutationTags?.methods?.includes('PATCH') || !mutationTags?.resources) errors.push('missing public mutation cache tag policy');
for (const [resource, entry] of Object.entries(mutationTags?.resources ?? {})) {
  if (!entry.routeTags?.length) errors.push(`missing public mutation route tags for ${resource}`);
}
const readTags = contract.publicReadTags;
if (!readTags?.vocabulary || !readTags?.paths?.length) errors.push('missing public read cache tag policy');
for (const entry of readTags?.paths ?? []) {
  if (!entry.path?.startsWith('/') || !entry.tagKeys?.length) errors.push('invalid public read tag path');
  for (const key of entry.tagKeys ?? []) if (!readTags.vocabulary[key]) errors.push(`unknown public read tag key ${key}`);
}
for (const file of ['frontend/lib/cache/cache-contract.json','apps/api/src/shared/cache/cache-contract.json']) if (read(file) !== JSON.stringify(contract,null,2)+'\n') errors.push(`stale contract copy ${file}`);
if (errors.length) { for (const e of errors) console.error(`[cache-contract-audit] FAIL: ${e}`); process.exit(1); }
console.log(`[cache-contract-audit] PASS domains=${names.size} rules=${contract.invalidation.length}`);
