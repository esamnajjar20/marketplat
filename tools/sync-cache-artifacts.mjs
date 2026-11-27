#!/usr/bin/env node
/**
 * Generate runtime cache-policy/contract mirrors from the canonical shared files.
 * Edit shared/cache-policy.json and shared/cache/cache-contract.json only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const write = (relativePath, content) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const policy = readJson('shared/cache-policy.json');
const contract = readJson('shared/cache/cache-contract.json');

if (!Number.isInteger(policy.version) || policy.version < 2) {
  throw new Error('Unsupported cache policy version; expected version >= 2');
}
if (contract.version !== 3 || contract.keyAlgorithmVersion !== 1) {
  throw new Error('Unsupported cache contract; expected contract v3 / key algorithm v1');
}
if (!Array.isArray(contract.mobileMutationInvalidation) || !contract.publicMutationTags?.resources || !contract.publicReadTags?.paths) {
  throw new Error('Cache contract v3 is missing mutation invalidation or public cache tag maps');
}

const policyText = `${JSON.stringify(policy, null, 2)}\n`;
const contractText = `${JSON.stringify(contract, null, 2)}\n`;
for (const target of [
  'frontend/lib/cache-policy.json',
  'apps/api/src/shared/cache/cache-policy.json',
]) write(target, policyText);
for (const target of [
  'frontend/lib/cache/cache-contract.json',
  'apps/api/src/shared/cache/cache-contract.json',
]) write(target, contractText);

write(
  'frontend/public/cache-policy.js',
  `/* generated from shared/cache-policy.json — do not edit */\nself.MARKET_CACHE_POLICY = ${JSON.stringify(policy)};\n`,
);
write(
  'frontend/public/cache-contract.js',
  `/* generated from shared/cache/cache-contract.json — do not edit */\nself.MARKET_CACHE_CONTRACT = ${JSON.stringify(contract, null, 2)};\n`,
);

const canonicalKey = fs.readFileSync(path.join(root, 'shared/cache/cacheKey.ts'), 'utf8');
write('frontend/lib/cache/cacheKey.ts', canonicalKey);
write('apps/api/src/shared/cache/cacheKey.ts', canonicalKey);

write(
  'workers/cf-api-proxy/src/cachePolicy.generated.ts',
  `/* generated from shared/cache-policy.json — do not edit */\nexport const GENERATED_CACHE_POLICY = ${JSON.stringify(policy, null, 2)} as const;\n`,
);
write(
  'apps/mobile/src/cachePolicy.generated.ts',
  `/* generated from shared/cache-policy.json — do not edit */\nexport const MOBILE_CACHE_POLICY = ${JSON.stringify(policy, null, 2)} as const;\n`,
);

console.log('[cache-sync] generated web/API/Service Worker/Worker artifacts from shared cache sources');
