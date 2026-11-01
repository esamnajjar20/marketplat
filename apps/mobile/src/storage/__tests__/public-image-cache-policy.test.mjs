import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PUBLIC_IMAGE_CACHE_BYTES,
  MAX_TRACKED_PUBLIC_IMAGES,
  planPublicImageEviction,
} from '../public-image-cache-policy.mjs';

test('image cache enforces aggregate bytes, not only file count', () => {
  const files = [
    { uri: 'newest-large', modified: 10, sizeBytes: 70, referenced: false },
    { uri: 'old-small', modified: 1, sizeBytes: 20, referenced: false },
    { uri: 'pinned', modified: 0, sizeBytes: 20, referenced: true },
  ];
  assert.deepEqual(planPublicImageEviction(files, { maxFiles: 120, maxBytes: 100 }), ['old-small']);
});

test('image cache removes oldest unreferenced images first and preserves pinned offline images', () => {
  const files = Array.from({ length: 5 }, (_, index) => ({
    uri: `image-${index}`,
    modified: index,
    sizeBytes: 10,
    referenced: index === 0 || index === 4,
  }));
  assert.deepEqual(planPublicImageEviction(files, { maxFiles: 3, maxBytes: 1_000 }), ['image-1', 'image-2']);
});

test('image cache keeps referenced images even if they exceed both storage limits', () => {
  const files = [
    { uri: 'saved-1', modified: 1, sizeBytes: MAX_PUBLIC_IMAGE_CACHE_BYTES, referenced: true },
    { uri: 'saved-2', modified: 2, sizeBytes: 10, referenced: true },
  ];
  assert.deepEqual(planPublicImageEviction(files, { maxFiles: 0, maxBytes: 0 }), []);
});

test('image cache defaults stay within a finite count and byte budget', () => {
  assert.equal(MAX_TRACKED_PUBLIC_IMAGES, 120);
  assert.equal(MAX_PUBLIC_IMAGE_CACHE_BYTES, 80 * 1024 * 1024);
});
