import { describe, expect, it, vi } from 'vitest';
import { readFileArrayBuffer } from '@/lib/fileArrayBuffer';

describe('readFileArrayBuffer', () => {
  it('falls back to FileReader when Android/browser Blob.arrayBuffer rejects', async () => {
    const file = new File(['marketplat-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const arrayBuffer = vi.fn().mockRejectedValue(new DOMException('NotReadableError', 'NotReadableError'));
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: arrayBuffer });

    const bytes = await readFileArrayBuffer(file);

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(new TextDecoder().decode(bytes)).toBe('marketplat-image-bytes');
  });

  it('uses Blob.arrayBuffer when the primary read succeeds', async () => {
    const file = new Blob(['primary-read']);
    const bytes = await readFileArrayBuffer(file);
    expect(new TextDecoder().decode(bytes)).toBe('primary-read');
  });
});
