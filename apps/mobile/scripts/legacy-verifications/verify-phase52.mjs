import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const imageCache = await readFile(new URL('../src/storage/public-image-cache.ts', import.meta.url), 'utf8');
const adsApi = await readFile(new URL('../src/features/ads/ads.api.ts', import.meta.url), 'utf8');
const detail = await readFile(new URL('../app/ads/[id].tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(imageCache, /export async function cachePublicImage/);
assert.match(imageCache, /FileSystem\.downloadAsync/);
assert.match(imageCache, /MAX_IMAGE_BYTES/);
assert.match(imageCache, /return uri/);
assert.match(adsApi, /cachePublicImages/);
assert.match(adsApi, /cachedDetail/);
assert.match(detail, /file:/);
assert.match(pkg.scripts.test, /run-all-verifications\.mjs/, 'npm test must invoke the discovery runner');
assert.match(readFileSync(new URL('./run-all-verifications.mjs', import.meta.url), 'utf8'), /startsWith\('verify-'\)[\s\S]*endsWith\('\.mjs'\)/, 'verification runner must discover scripts/verify-*.mjs files');
console.log('Phase 52 public-image offline cache source-contract checks passed (static only; device/network behavior not exercised).');
