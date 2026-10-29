import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const service = read('../../api/src/modules/ads/ads.service.ts');
const controller = read('../../api/src/modules/ads/ads.controller.ts');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const start = service.indexOf('deleteAd: async (adId: string, userId: string, userRole: string)');
assert.notEqual(start, -1, 'Ad delete service must exist');
const body = service.slice(start, service.indexOf('\n  },', start));
assert.match(body, /if \(!ad\) throw new NotFoundError/, 'Unknown ad remains a 404');
assert.match(body, /canManageAd\(ad, userId, userRole\)/, 'Authorization remains enforced');
assert.ok(body.indexOf('canManageAd(ad, userId, userRole)') < body.indexOf("if (ad.status === 'DELETED') return"), 'Authorization must happen before idempotent replay');
assert.match(body, /if \(ad\.status === 'DELETED'\) return/, 'Already-deleted ad is acknowledged without duplicate side effects');
assert.match(body, /await adsRepository\.softDelete\(adId\)/, 'First delete still soft-deletes');
assert.match(controller, /await adsService\.deleteAd\(params\.id, user\.userId, user\.role\);[\s\S]{0,100}successResponse\('Ad deleted'\)/, 'Controller returns success for first and replayed deletes');
assert.match(pkg.scripts.test, /run-all-verifications\.mjs/, 'npm test must invoke the discovery runner');
assert.match(readFileSync(new URL('./run-all-verifications.mjs', import.meta.url), 'utf8'), /startsWith\('verify-'\)[\s\S]*endsWith\('\.mjs'\)/, 'Phase 62 verifier is included in npm test');
console.log('Phase 62 checks passed: authorized repeated ad deletion is idempotent and does not repeat mutation side effects (static source contract only).');
