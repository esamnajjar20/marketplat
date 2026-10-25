import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const mobileRoot = new URL('../', import.meta.url);
const apiRoot = new URL('../../api/', import.meta.url);
const readMobile = (p) => readFile(new URL(p, mobileRoot), 'utf8');
const readApi = (p) => readFile(new URL(p, apiRoot), 'utf8');

// Historical phase contract: server-side image idempotency was introduced in phase 66; phase 67 now wires it into the mobile outbox.
const editor = await readMobile('app/ad-editor.tsx');
assert.match(editor, /draft\.images\.map\(\(image\) => \(/);
assert.match(editor, /await updateAd\(id, draft, accessToken, csrfToken\)/);

const transport = await readMobile('src/storage/outbox-transport.ts');
assert.match(transport, /sendOutboxUpdateAd/);
assert.match(transport, /sendOutboxUpdateAd[\s\S]*?new FormData\(\)/);

const controller = await readApi('src/modules/ads/ads.controller.ts');
const routes = await readApi('src/modules/ads/ads.routes.ts');
const service = await readApi('src/modules/ads/ads.service.ts');
assert.match(routes, /'\/:id\/images'[\s\S]*?adsController\.addImages/);
assert.match(controller, /adsService\.addImages\(params\.id, user\.userId, user\.role, files, offlineOpId\)/);
assert.match(controller, /x-offline-op-id/i);
assert.match(service, /addImages:/);
assert.match(service, /uploadAdImages\(files\)/);

console.log('Phase 65 passed: mobile update replay contract remains compatible with phase 66 image idempotency.');
