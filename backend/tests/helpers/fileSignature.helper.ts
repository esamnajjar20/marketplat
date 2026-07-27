/**
 * Real magic-byte buffers for use in upload middleware tests.
 *
 * Previously, upload.middleware.test.ts used arbitrary strings like
 * Buffer.from('fake-jpeg-bytes') to simulate valid images — that was
 * fine when the middleware only checked the declared Content-Type, but
 * SEC FIX (MIME-01) added a real magic-byte content check, so tests
 * asserting a "valid image" path now need buffers whose actual bytes
 * match a real image signature, not just a plausible-looking string.
 */

/** Minimal valid JPEG: FF D8 FF + arbitrary padding. */
export const validJpegBuffer = (padding = 20): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(padding, 0x00)]);

/** Minimal valid PNG: 89 50 4E 47 0D 0A 1A 0A + arbitrary padding. */
export const validPngBuffer = (padding = 20): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(padding, 0x00),
  ]);

/** Minimal valid WebP: 'RIFF' + 4 size bytes + 'WEBP' + arbitrary padding. */
export const validWebpBuffer = (padding = 20): Buffer =>
  Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.alloc(4, 0x00),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(padding, 0x00),
  ]);

/** A buffer that is deliberately not a valid image of any recognized type. */
export const invalidImageBuffer = (): Buffer => Buffer.from('not-a-real-image-just-text');
