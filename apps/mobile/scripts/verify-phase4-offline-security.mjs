#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicCacheEntryUsable, PRIVATE_CACHE_MAX_STALE_MS, PUBLIC_CACHE_MAX_STALE_MS, planPublicCacheEviction } from '../src/storage/public-cache-policy.mjs';
import { MAX_PUBLIC_IMAGE_CACHE_BYTES, MAX_TRACKED_PUBLIC_IMAGES, planPublicImageEviction } from '../src/storage/public-image-cache-policy.mjs';
import { isValidSqlCipherKey } from '../src/storage/sqlcipher-key-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const checks = [];
function check(label, fn) { fn(); checks.push(label); }

const [encryptedDb, keyPolicy, cache, imageCache, savedOffline, saveButton, backupPlugin, adsApi, backupXml, extractionXml, storageScreen] = [
  'src/storage/encrypted-database.ts', 'src/storage/sqlcipher-key-policy.mjs', 'src/storage/public-cache.ts', 'src/storage/public-image-cache.ts',
  'src/storage/saved-offline.ts', 'src/components/ui/SaveOfflineButton.tsx', 'plugins/with-secure-storage-backup.js',
  'src/features/ads/ads.api.ts', 'android/app/src/main/res/xml/secure_store_backup_rules.xml',
  'android/app/src/main/res/xml/secure_store_data_extraction_rules.xml', 'app/storage.tsx',
].map(read);

check('SQLCipher native plugin is enabled and backup protection survives clean prebuild', () => {
  assert.ok(app.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite' && plugin[1]?.useSQLCipher === true));
  assert.ok(app.plugins.includes('./plugins/with-secure-storage-backup'));
  assert.equal(app.android.allowBackup, false);
  assert.match(backupPlugin, /withAndroidManifest/);
  assert.match(backupPlugin, /withDangerousMod/);
  for (const name of ['secure_store_backup_rules.xml', 'secure_store_data_extraction_rules.xml']) assert.ok(backupPlugin.includes(name));
  assert.match(backupPlugin, /android:allowBackup/);
  assert.match(backupPlugin, /android:dataExtractionRules/);
  assert.match(backupPlugin, /android:supportsRtl/);
  assert.match(backupXml, /marketplat-private-v2\.db-wal/);
  assert.match(extractionXml, /<device-transfer>/);
});

check('SQLCipher key material is validated and database integrity is checked before reads', () => {
  assert.match(encryptedDb, /sqlcipher-key-policy\.mjs/);
  assert.match(encryptedDb, /if \(!isValidSqlCipherKey\(keyHex\)\)/);
  assert.match(keyPolicy, /\^\[a-f0-9\]\{64\}\$/i);
  assert.equal(isValidSqlCipherKey('a'.repeat(64)), true);
  assert.equal(isValidSqlCipherKey('a'.repeat(63)), false);
  assert.equal(isValidSqlCipherKey('g'.repeat(64)), false);
  assert.match(encryptedDb, /PRAGMA cipher_version/);
  assert.match(encryptedDb, /PRAGMA key/);
  assert.match(encryptedDb, /PRAGMA quick_check/);
  assert.match(encryptedDb, /sqlcipher_export\('encrypted'\)/);
  assert.match(encryptedDb, /assertLegacyDataPreserved/);
  assert.match(encryptedDb, /Platform\.OS === 'web'[\s\S]*throw new Error/);
});

check('Public cache expires private snapshots earlier than public data', () => {
  assert.equal(PRIVATE_CACHE_MAX_STALE_MS, 24 * 60 * 60 * 1_000);
  assert.equal(PUBLIC_CACHE_MAX_STALE_MS, 7 * 24 * 60 * 60 * 1_000);
  const now = 1_000_000_000;
  assert.equal(isPublicCacheEntryUsable('api-private:user:/orders', now - PRIVATE_CACHE_MAX_STALE_MS - 1, now), false);
  assert.equal(isPublicCacheEntryUsable('api-public:/ads', now - PUBLIC_CACHE_MAX_STALE_MS - 1, now), false);
  assert.match(cache, /isPublicCacheEntryUsable/);
  assert.match(cache, /MAX_ENTRY_BYTES/);
});

check('Public response cache has a transactionally enforced count and byte budget', () => {
  assert.deepEqual(planPublicCacheEviction([
    { cacheKey: 'new', savedAt: 2, sizeBytes: 90 },
    { cacheKey: 'old', savedAt: 1, sizeBytes: 20 },
  ], { maxEntries: 100, maxBytes: 100 }), ['old']);
  assert.match(cache, /withExclusiveTransactionAsync/);
  assert.match(cache, /MAX_PUBLIC_CACHE_BYTES/);
});

check('Image cache has aggregate byte cap and preserves durable references', () => {
  assert.equal(MAX_TRACKED_PUBLIC_IMAGES, 120);
  assert.equal(MAX_PUBLIC_IMAGE_CACHE_BYTES, 80 * 1024 * 1024);
  assert.deepEqual(planPublicImageEviction([
    { uri: 'saved', modified: 1, sizeBytes: 200, referenced: true },
    { uri: 'old', modified: 0, sizeBytes: 50, referenced: false },
  ], { maxFiles: 1, maxBytes: 200 }), ['old']);
  assert.match(imageCache, /getReferencedPublicImageUris/);
  assert.match(imageCache, /prunePublicImageCache/);
  assert.match(cache, /saved_offline_resources/);
});

check('Explicit offline saves keep only verified local images and report partial media saves', () => {
  assert.match(savedOffline, /filterAvailablePublicImageUris/);
  assert.match(savedOffline, /await prunePublicImageCache\(\)/);
  assert.match(savedOffline, /requestedImages/);
  assert.match(savedOffline, /cachedImages/);
  assert.match(saveButton, /result\.cachedImages < result\.requestedImages/);
  assert.match(saveButton, /قد تحتاج إلى اتصال بالإنترنت/);
});

check('Image references are persisted before pruning after public API cache writes', () => {
  assert.match(adsApi, /await writePublicCache\(cacheKey, cachedResult\);\s*await prunePublicImageCache\(\)/);
  assert.match(adsApi, /pageImageUris\.slice\(0, 8\)/);
  assert.match(adsApi, /await writePublicCache\(cacheKey, cachedDetail\);\s*await prunePublicImageCache\(\)/);
});

check('Storage recovery copy distinguishes missing and invalid keys', () => {
  assert.match(storageScreen, /مفقود أو غير صالح/);
});

console.log(`PASS: Phase 4 offline/SQLCipher static checks (${checks.length}/${checks.length}).`);
for (const label of checks) console.log(`  - ${label}`);
console.log('NOT CHECKED: native SQLCipher build, Android/iOS encrypted-file inspection, restore/migration on physical devices, OS backup/restore behavior, and real disk-full/offline scenarios.');
