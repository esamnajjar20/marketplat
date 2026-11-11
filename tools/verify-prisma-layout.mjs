import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const schemaPath = resolve(root, 'apps/api/prisma/schema.prisma');
const migrationDir = resolve(root, 'apps/api/prisma/migrations/20261025100000_add_ad_image_offline_idempotency');
const migrationPath = join(migrationDir, 'migration.sql');
const errors = [];
const warnings = [];

if (!existsSync(schemaPath)) errors.push('Missing apps/api/prisma/schema.prisma');
if (!existsSync(migrationPath)) errors.push('Missing migration 20261025100000_add_ad_image_offline_idempotency/migration.sql');

if (existsSync(schemaPath) && existsSync(migrationPath)) {
  const schema = readFileSync(schemaPath, 'utf8');
  const migration = readFileSync(migrationPath, 'utf8');
  const modelMatch = schema.match(/model\s+AdImageOfflineOperation\s*\{([\s\S]*?)\n\}/);
  if (!modelMatch) {
    errors.push('Schema does not define model AdImageOfflineOperation.');
  } else {
    const model = modelMatch[1];
    for (const field of ['id', 'operationId', 'adId', 'userId', 'imageUrls', 'createdAt']) {
      if (!new RegExp(`^\\s*${field}\\s+`, 'm').test(model)) errors.push(`AdImageOfflineOperation is missing field ${field}.`);
    }
    if (!/@unique/.test(model.match(/^\s*operationId\s+[^\n]+/m)?.[0] ?? '')) errors.push('operationId must remain unique in Prisma schema.');
    if (!/@@index\(\[adId, userId\]\)/.test(model)) errors.push('Schema is missing @@index([adId, userId]).');
    if (!/@@index\(\[createdAt\]\)/.test(model)) errors.push('Schema is missing @@index([createdAt]).');
  }
  for (const pattern of [
    /CREATE TABLE IF NOT EXISTS "AdImageOfflineOperation"/i,
    /"operationId" TEXT NOT NULL/i,
    /"adId" TEXT NOT NULL/i,
    /"userId" TEXT NOT NULL/i,
    /UNIQUE INDEX IF NOT EXISTS "AdImageOfflineOperation_operationId_key"/i,
    /INDEX IF NOT EXISTS "AdImageOfflineOperation_adId_userId_idx"/i,
    /INDEX IF NOT EXISTS "AdImageOfflineOperation_createdAt_idx"/i,
  ]) if (!pattern.test(migration)) errors.push(`Migration is missing expected SQL pattern: ${pattern}`);

  if (!/REFERENCES\s+"(ads|users)"/i.test(migration)) warnings.push('Migration does not define foreign keys to ads/users; confirm this is intentional for the durable replay ledger.');
  const src = resolve(root, 'apps/api/src');
  if (existsSync(src)) {
    const stack = [src]; let found = false;
    while (stack.length) {
      const dir = stack.pop();
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, ent.name);
        if (ent.isDirectory()) stack.push(path);
        else if (/\.(ts|js)$/.test(ent.name) && readFileSync(path, 'utf8').includes('AdImageOfflineOperation')) found = true;
      }
    }
    if (!found) warnings.push('No application source reference to AdImageOfflineOperation was found; confirm the feature is wired to this persistence model.');
  }
}

if (errors.length) {
  console.error('Prisma layout verification failed:');
  for (const item of errors) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('Prisma layout checks passed (static checks only; no database was contacted).');
  for (const item of warnings) console.warn(`WARNING: ${item}`);
}
