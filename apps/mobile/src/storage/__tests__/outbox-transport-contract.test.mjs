import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOutboxCreateAdRequest } from '../outbox-transport-contract.mjs';

// ─── Helper builders ────────────────────────────────────────────────
function payload(overrides = {}) {
  return {
    title: 'Test ad',
    description: 'A valid description',
    city: 'Gaza',
    price: 100,
    categoryId: 'cat-1',
    isNegotiable: false,
    images: [
      { uri: 'file:///data/img1.jpg', name: 'img1.jpg', type: 'image/jpeg', sizeBytes: 1024 },
    ],
    ...overrides,
  };
}

function makeItem(overrides = {}) {
  return {
    operation: 'create-ad',
    idempotencyKey: 'op-12345678',
    payloadJson: JSON.stringify(payload()),
    ...overrides,
  };
}

// ─── Operation validation ───────────────────────────────────────────
test('rejects non create-ad operation', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ operation: 'update-ad' })),
    /only enabled for idempotent ad creation/,
  );
});

// ─── Idempotency key validation ─────────────────────────────────────
test('rejects empty idempotency key', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ idempotencyKey: '' })),
    /must match the API X-Offline-Op-Id/,
  );
});

test('rejects idempotency key starting with non-alphanumeric', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ idempotencyKey: '!invalid' })),
    /must match the API X-Offline-Op-Id/,
  );
});

test('rejects idempotency key longer than 128 chars', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ idempotencyKey: 'a'.repeat(129) })),
    /must match the API X-Offline-Op-Id/,
  );
});

test('rejects idempotency key with invalid chars', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ idempotencyKey: 'has space' })),
    /must match the API X-Offline-Op-Id/,
  );
});

// ─── JSON parsing ───────────────────────────────────────────────────
test('rejects invalid JSON payload', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: 'not-json{' })),
    /not valid JSON/,
  );
});

test('rejects array payload', () => {
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: '[]' })),
    /must be a JSON object/,
  );
});

// ─── Images validation ──────────────────────────────────────────────
test('rejects payload without images', () => {
  const p = payload();
  delete p.images;
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(p) })),
    /دون صورة محفوظة محليًا/,
  );
});

test('rejects more than 10 images', () => {
  const images = Array.from({ length: 11 }, (_, i) => ({
    uri: `file:///img${i}.jpg`, name: `img${i}.jpg`, type: 'image/jpeg',
  }));
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) })),
    /أكثر من 10 صور/,
  );
});

test('rejects image without uri', () => {
  const images = [{ name: 'a.jpg', type: 'image/jpeg' }];
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) })),
    /مسار محلي صالح/,
  );
});

test('rejects image with empty string uri', () => {
  const images = [{ uri: '', name: 'a.jpg', type: 'image/jpeg' }];
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) })),
    /مسار محلي صالح/,
  );
});

test('rejects non-file/non-content URI', () => {
  const images = [{ uri: 'https://evil.com/img.jpg', name: 'a.jpg', type: 'image/jpeg' }];
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) })),
    /ليست ملفًا محليًا قابلًا للرفع/,
  );
});

test('rejects unsupported mime type', () => {
  const images = [{ uri: 'file:///a.gif', name: 'a.gif', type: 'image/gif' }];
  assert.throws(
    () => toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) })),
    /نوع صورة الإعلان غير مدعوم/,
  );
});

// ─── Happy paths ────────────────────────────────────────────────────
test('accepts valid payload with one image', () => {
  const r = toOutboxCreateAdRequest(makeItem());
  assert.equal(r.method, 'POST');
  assert.equal(r.path, '/api/v1/ads');
  assert.equal(r.headers['X-Offline-Op-Id'], 'op-12345678');
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].type, 'image/jpeg');
  assert.equal(r.body.title, 'Test ad');
  assert.equal(r.body.images, undefined, 'images should be stripped from body');
});

test('accepts content:// URI (Android)', () => {
  const images = [{ uri: 'content://media/external/images/1', name: 'a.jpg', type: 'image/jpeg' }];
  const r = toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) }));
  assert.equal(r.images.length, 1);
});

test('accepts webp and png', () => {
  const images = [
    { uri: 'file:///a.webp', name: 'a.webp', type: 'image/webp' },
    { uri: 'file:///b.png', name: 'b.png', type: 'image/png' },
  ];
  const r = toOutboxCreateAdRequest(makeItem({ payloadJson: JSON.stringify(payload({ images })) }));
  assert.equal(r.images.length, 2);
});
