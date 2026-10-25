import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toOutboxCreateAdRequest } from '../src/storage/outbox-transport-contract.mjs';

const transport = await readFile(new URL('../src/storage/outbox-transport.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../../api/src/modules/ads/ads.controller.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const base = {
  operation: 'create-ad',
  idempotencyKey: 'offline-op:images-1',
  payloadJson: JSON.stringify({ title: 'إعلان دون اتصال', price: '10', images: [
    { uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' },
    { uri: 'content://media/external/images/2', name: 'photo-2.png', type: 'image/png' },
  ] }),
};
const request = toOutboxCreateAdRequest(base);
assert.equal(request.images.length, 2, 'all validated local images should be retained for upload');
assert.equal(request.body.title, 'إعلان دون اتصال');
assert.equal('images' in request.body, false, 'file descriptors must not leak into ordinary form fields');
assert.equal(request.headers['X-Offline-Op-Id'], base.idempotencyKey, 'replays keep the same idempotency key');
assert.throws(() => toOutboxCreateAdRequest({ ...base, payloadJson: JSON.stringify({ title: 'No photo' }) }), /صورة محفوظة محليًا/);
assert.throws(() => toOutboxCreateAdRequest({ ...base, payloadJson: JSON.stringify({ title: 'Remote URL', images: [{ uri: 'https://example.com/photo.jpg' }] }) }), /قابلًا للرفع/);
assert.throws(() => toOutboxCreateAdRequest({ ...base, payloadJson: JSON.stringify({ title: 'Bad MIME', images: [{ uri: 'file:///cache/file.svg', type: 'image/svg+xml' }] }) }), /نوع صورة الإعلان غير مدعوم/);
assert.throws(() => toOutboxCreateAdRequest({ ...base, payloadJson: JSON.stringify({ title: 'HEIC not supported by API', images: [{ uri: 'file:///cache/photo.heic', type: 'image/heic' }] }) }), /غير مدعوم من الخادم/);
assert.throws(() => toOutboxCreateAdRequest({ ...base, payloadJson: JSON.stringify({ title: 'Too large', images: [{ uri: 'file:///cache/photo.jpg', type: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 + 1 }] }) }), /يتجاوز الحد المسموح/);
assert.doesNotThrow(() => toOutboxCreateAdRequest({ ...base, payloadJson: JSON.stringify({ title: 'At limit', images: [{ uri: 'file:///cache/photo.jpg', type: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 }] }) }));
assert.match(controller, /if \(files\.length === 0\)/, 'API rejects ad creation without multipart images');
assert.match(transport, /new FormData\(\)/, 'mobile transport must send multipart form data');
assert.match(transport, /form\.append\('images'/, 'mobile transport must attach local image files');
assert.match(client, /init\.body instanceof FormData/, 'shared client must not override multipart Content-Type boundary');
assert.ok(pkg.scripts.test.includes('verify-phase41.mjs'), 'phase 41 test must be wired into npm test');
console.log('Phase 41 local-image validation, multipart request contract, missing-image rejection, and idempotency checks passed (Node contract test + source assertions; no Expo/device/API integration).');
