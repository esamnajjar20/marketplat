import { describe, expect, it } from 'vitest';
import { publishAttemptFingerprint } from '@/lib/publishAttemptFingerprint';

describe('publishAttemptFingerprint', () => {
  it('keeps the fingerprint stable for a retry of the same payload and File objects', () => {
    const image = { name: 'photo.jpg', size: 1234, lastModified: 10, type: 'image/jpeg' };
    const first = publishAttemptFingerprint({ title: 'Test', attributes: { b: 2, a: 1 }, images: [image] });
    const retry = publishAttemptFingerprint({ title: 'Test', attributes: { a: 1, b: 2 }, images: [image] });
    expect(retry).toBe(first);
  });

  it('changes when a form field changes', () => {
    const image = { name: 'photo.jpg', size: 1234 };
    expect(publishAttemptFingerprint({ title: 'First', images: [image] }))
      .not.toBe(publishAttemptFingerprint({ title: 'Second', images: [image] }));
  });

  it('changes when a different image object is selected, even if metadata matches', () => {
    const firstImage = { name: 'photo.jpg', size: 1234 };
    const secondImage = { name: 'photo.jpg', size: 1234 };
    expect(publishAttemptFingerprint({ title: 'Same', images: [firstImage] }))
      .not.toBe(publishAttemptFingerprint({ title: 'Same', images: [secondImage] }));
  });
});
