import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toOutboxCreateAdRequest } from '../src/storage/outbox-transport-contract.mjs';

const apiLimits = await readFile(new URL('../../api/src/config/limits.ts', import.meta.url), 'utf8');
const picker = await readFile(new URL('../app/ad-editor.tsx', import.meta.url), 'utf8');
const transportContract = await readFile(new URL('../src/storage/outbox-transport-contract.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const payload = (image) => JSON.stringify({ title: 'اختبار توافق الصور', images: [image] });
const item = (image) => ({ operation: 'create-ad', idempotencyKey: 'offline-op:phase42', payloadJson: payload(image) });

assert.match(apiLimits, /MAX_IMAGE_SIZE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
assert.match(apiLimits, /'image\/jpeg'/);
assert.match(apiLimits, /'image\/png'/);
assert.match(apiLimits, /'image\/webp'/);
assert.match(transportContract, /MAX_IMAGE_SIZE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
assert.ok(picker.includes('image\\/(jpeg|jpg|png|webp)'), 'picker should not advertise HEIC/HEIF when API rejects them');
assert.doesNotThrow(() => toOutboxCreateAdRequest(item({ uri: 'file:///documents/a.webp', type: 'image/webp', sizeBytes: 1024 })));
assert.throws(() => toOutboxCreateAdRequest(item({ uri: 'file:///documents/a.heic', type: 'image/heic' })), /غير مدعوم من الخادم/);
assert.throws(() => toOutboxCreateAdRequest(item({ uri: 'file:///documents/a.jpg', type: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 + 1 })), /يتجاوز الحد المسموح/);
assert.ok(pkg.scripts.test.includes('verify-phase42.mjs'), 'phase 42 verifier must be part of npm test');
console.log('Phase 42 API image MIME/size compatibility checks passed (Node contract tests + source assertions; no real image upload or device test).');
