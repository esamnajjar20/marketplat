/**
 * fileSignature — validates a file's *actual* binary content against its
 * claimed MIME type, using magic-byte (file signature) checks.
 *
 * SEC FIX (MIME-01): upload.middleware.ts previously trusted
 * `file.mimetype` for its allow-list — that value comes straight from the
 * client-supplied `Content-Type` part header in the multipart body, which
 * any HTTP client can set to whatever it wants regardless of the actual
 * file bytes. A `.php`/`.html`/`.svg`-with-script payload renamed with a
 * spoofed `Content-Type: image/png` would sail through the old filter.
 *
 * This checks the first bytes of the buffer against the known signatures
 * for the four types this app actually accepts (JPEG, PNG, WebP), which is
 * what every image-upload hardening guide (OWASP included) recommends as
 * the minimum bar above trusting client-supplied headers.
 *
 * Deliberately dependency-free rather than pulling in the `file-type`
 * package: recent major versions of `file-type` are ESM-only, and this
 * project's tsconfig is CommonJS (`module: "commonjs"`) — forcing that
 * interop for four fixed, well-documented signatures is not worth the
 * added build complexity. If the allow-list grows to cover many more
 * formats (video, documents, etc.), revisit this tradeoff.
 */

export type DetectedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | null;

/**
 * Inspects the leading bytes of a buffer and returns the image MIME type
 * they actually correspond to, or null if the bytes don't match any
 * signature this app recognizes.
 *
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 0D 0A 1A 0A
 * - WebP: 'RIFF' .... 'WEBP' (RIFF container, WEBP fourCC at offset 8)
 *
 * GIF is intentionally NOT included — it is not in ALLOWED_MIME_TYPES.
 */
export function detectImageType(buffer: Buffer): DetectedImageType {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: bytes 0-3 'RIFF', bytes 8-11 'WEBP'
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * True if the buffer's real content matches one of the app's allowed
 * image types, regardless of what Content-Type the client claimed.
 * `jpeg`/`jpg` share one signature, so both mimetypes map to the same
 * detected type — this treats them as equivalent rather than requiring
 * an exact string match against the declared mimetype.
 */
export function isAllowedImageContent(buffer: Buffer): boolean {
  return detectImageType(buffer) !== null;
}
