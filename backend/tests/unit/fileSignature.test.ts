import { detectImageType, isAllowedImageContent } from '../../src/shared/utils/fileSignature';
import {
  validJpegBuffer,
  validPngBuffer,
  validWebpBuffer,
  invalidImageBuffer,
} from '../helpers/fileSignature.helper';

describe('fileSignature', () => {
  describe('detectImageType', () => {
    it('detects a valid JPEG by its FF D8 FF signature', () => {
      expect(detectImageType(validJpegBuffer())).toBe('image/jpeg');
    });

    it('detects a valid PNG by its 8-byte signature', () => {
      expect(detectImageType(validPngBuffer())).toBe('image/png');
    });

    it('detects a valid WebP by its RIFF....WEBP signature', () => {
      expect(detectImageType(validWebpBuffer())).toBe('image/webp');
    });

    it('returns null for a buffer with no recognized signature', () => {
      expect(detectImageType(invalidImageBuffer())).toBeNull();
    });

    it('returns null for a buffer that is too short to contain any signature', () => {
      expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    });

    it('returns null for an empty buffer', () => {
      expect(detectImageType(Buffer.alloc(0))).toBeNull();
    });

    it('does not misidentify a RIFF file that is not WEBP (e.g. a WAV file)', () => {
      const wav = Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.alloc(4, 0x00),
        Buffer.from('WAVE', 'ascii'),
        Buffer.alloc(10, 0x00),
      ]);
      expect(detectImageType(wav)).toBeNull();
    });

    it('does not misidentify a PDF (%PDF magic bytes) as an image', () => {
      const pdf = Buffer.from('%PDF-1.4\n%fake-pdf-content');
      expect(detectImageType(pdf)).toBeNull();
    });

    it('does not misidentify an HTML/script payload as an image, even with an image extension', () => {
      const htmlPayload = Buffer.from('<html><script>alert(1)</script></html>');
      expect(detectImageType(htmlPayload)).toBeNull();
    });
  });

  describe('isAllowedImageContent', () => {
    it('returns true for real JPEG/PNG/WebP bytes', () => {
      expect(isAllowedImageContent(validJpegBuffer())).toBe(true);
      expect(isAllowedImageContent(validPngBuffer())).toBe(true);
      expect(isAllowedImageContent(validWebpBuffer())).toBe(true);
    });

    it('returns false for a non-image buffer regardless of claimed type', () => {
      expect(isAllowedImageContent(invalidImageBuffer())).toBe(false);
    });
  });
});
